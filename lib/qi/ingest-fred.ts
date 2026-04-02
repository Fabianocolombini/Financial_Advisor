import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

import { fetchFredObservations, nextCalendarDayUtc } from "@/lib/market/fred";
import { loadMacroManifest } from "@/lib/qi/manifest";
import { prisma } from "@/lib/prisma";

function ymdToUtcNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

type FredSeriesMeta = {
  title?: string;
  frequency?: string;
  units?: string;
  seasonalAdjustment?: string;
};

async function fetchFredSeriesMetadata(
  apiKey: string,
  seriesId: string,
): Promise<FredSeriesMeta | null> {
  const url = new URL("https://api.stlouisfed.org/fred/series");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    seriess?: {
      title?: string;
      frequency?: string;
      units?: string;
      seasonal_adjustment?: string;
    }[];
  };
  const s0 = json.seriess?.[0];
  if (!s0) return null;
  return {
    title: s0.title,
    frequency: s0.frequency,
    units: s0.units,
    seasonalAdjustment: s0.seasonal_adjustment,
  };
}

export type IngestFredQiResult = {
  jobId: string;
  pointsInserted: number;
  seriesProcessed: number;
  errors: string[];
};

/**
 * Ingestão incremental FRED → `QiMacroSeries` / `QiMacroSeriesPoint`.
 * Usa o mesmo manifest que o job Python (`macro_series.json`).
 */
export async function ingestFredQi(fredApiKey: string): Promise<IngestFredQiResult> {
  const specs = loadMacroManifest();
  const backfill =
    process.env.QI_FRED_BACKFILL_START?.trim() || "2019-01-01";
  const errors: string[] = [];
  let pointsInserted = 0;

  const job = await prisma.qiIngestionJob.create({
    data: {
      source: "FRED",
      jobName: "macro_observations_ts",
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    for (const spec of specs) {
      const ext = spec.external_id;
      try {
        const meta = await fetchFredSeriesMetadata(fredApiKey, ext);
        const series = await prisma.qiMacroSeries.upsert({
          where: {
            provider_externalId: {
              provider: "FRED",
              externalId: ext,
            },
          },
          create: {
            provider: "FRED",
            externalId: ext,
            title: meta?.title ?? spec.title ?? ext,
            frequency: meta?.frequency ?? null,
            units: meta?.units ?? null,
            seasonalAdjustment: meta?.seasonalAdjustment ?? null,
          },
          update: {
            title: meta?.title ?? spec.title,
            frequency: meta?.frequency ?? null,
            units: meta?.units ?? null,
            seasonalAdjustment: meta?.seasonalAdjustment ?? null,
          },
        });

        const last = await prisma.qiMacroSeriesPoint.findFirst({
          where: { seriesId: series.id },
          orderBy: { observedOn: "desc" },
          select: { observedOn: true },
        });
        const lastYmd = last
          ? last.observedOn.toISOString().slice(0, 10)
          : null;
        const obsStart = lastYmd ? nextCalendarDayUtc(lastYmd) : backfill;

        const obs = await fetchFredObservations(fredApiKey, ext, obsStart);

        if (obs.length > 0) {
          const rows = obs.map((o) => ({
            id: randomUUID(),
            seriesId: series.id,
            observedOn: ymdToUtcNoon(o.date),
            value: new Prisma.Decimal(o.value),
            raw: o.raw as Prisma.InputJsonValue,
          }));

          const res = await prisma.qiMacroSeriesPoint.createMany({
            data: rows,
            skipDuplicates: true,
          });
          pointsInserted += res.count;
        }

        await prisma.qiMacroSeries.update({
          where: { id: series.id },
          data: { lastSuccessfulRunAt: new Date() },
        });
      } catch (e) {
        errors.push(
          `${ext}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const allFailed = errors.length === specs.length && specs.length > 0;
    await prisma.qiIngestionJob.update({
      where: { id: job.id },
      data: {
        status: allFailed ? "FAILED" : "SUCCESS",
        finishedAt: new Date(),
        rowsUpserted: pointsInserted,
        rowsFailed: errors.length,
        errorMessage:
          errors.length > 0
            ? errors.join("; ").slice(0, 2000)
            : null,
      },
    });

    return {
      jobId: job.id,
      pointsInserted,
      seriesProcessed: specs.length,
      errors,
    };
  } catch (e) {
    await prisma.qiIngestionJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: String(e).slice(0, 2000),
      },
    });
    throw e;
  }
}
