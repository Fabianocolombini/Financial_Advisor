import type { MarketDataProvider } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MARKET_SERIES, MARKET_BACKFILL_START } from "@/lib/market/defaults";
import { fetchFredObservations, nextCalendarDayUtc } from "@/lib/market/fred";
import { fetchYahooChartCloses } from "@/lib/market/yahoo";

function ymdToUtcNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

async function ensureSeries(
  provider: MarketDataProvider,
  externalId: string,
  displayName: string,
): Promise<{ id: string }> {
  return prisma.marketSeries.upsert({
    where: {
      provider_externalId: { provider, externalId },
    },
    create: {
      provider,
      externalId,
      displayName,
    },
    update: {
      displayName,
    },
    select: { id: true },
  });
}

async function latestObservationYmd(seriesId: string): Promise<string | null> {
  const row = await prisma.marketObservation.findFirst({
    where: { seriesId },
    orderBy: { observedAt: "desc" },
    select: { observedAt: true },
  });
  if (!row) return null;
  return row.observedAt.toISOString().slice(0, 10);
}

async function insertObservations(
  seriesId: string,
  rows: { ymd: string; value: number; raw: Prisma.InputJsonValue }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const data = rows.map((r) => ({
    seriesId,
    observedAt: ymdToUtcNoon(r.ymd),
    value: new Prisma.Decimal(r.value),
    raw: r.raw,
  }));
  const res = await prisma.marketObservation.createMany({
    data,
    skipDuplicates: true,
  });
  return res.count;
}

export type IngestSummary = {
  series: string;
  provider: MarketDataProvider;
  inserted: number;
  from: string;
  error?: string;
};

export async function ingestMarketData(fredApiKey: string): Promise<IngestSummary[]> {
  const summaries: IngestSummary[] = [];
  const nowSec = Math.floor(Date.now() / 1000);

  for (const cfg of DEFAULT_MARKET_SERIES) {
    const key = `${cfg.provider}:${cfg.externalId}`;
    try {
      const { id: seriesId } = await ensureSeries(
        cfg.provider,
        cfg.externalId,
        cfg.displayName,
      );

      const lastYmd = await latestObservationYmd(seriesId);
      let fromYmd: string;
      if (lastYmd) {
        fromYmd = nextCalendarDayUtc(lastYmd);
      } else {
        fromYmd = MARKET_BACKFILL_START;
      }

      let inserted = 0;

      if (cfg.provider === "FRED") {
        const obs = await fetchFredObservations(fredApiKey, cfg.externalId, fromYmd);
        inserted = await insertObservations(
          seriesId,
          obs.map((o) => ({ ymd: o.date, value: o.value, raw: o.raw })),
        );
      } else if (cfg.provider === "YFINANCE") {
        const p1 = Math.floor(ymdToUtcNoon(fromYmd).getTime() / 1000);
        const bars = await fetchYahooChartCloses(cfg.externalId, p1, nowSec);
        inserted = await insertObservations(
          seriesId,
          bars.map((b) => ({
            ymd: b.date,
            value: b.value,
            raw: b.raw,
          })),
        );
      }

      await prisma.marketSeries.update({
        where: { id: seriesId },
        data: { lastFetchedAt: new Date() },
      });

      summaries.push({
        series: key,
        provider: cfg.provider,
        inserted,
        from: fromYmd,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summaries.push({
        series: key,
        provider: cfg.provider,
        inserted: 0,
        from: MARKET_BACKFILL_START,
        error: msg,
      });
    }
  }

  return summaries;
}
