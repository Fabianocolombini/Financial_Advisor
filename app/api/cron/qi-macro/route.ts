import { buildMacroDerivedSnapshot } from "@/lib/qi/macro-derived";
import { ingestFredQi } from "@/lib/qi/ingest-fred";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Ingestão FRED → `QiMacroSeries` / `QiMacroSeriesPoint` (TypeScript).
 * Lê `analytics/qi/data/macro_series.json`.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`
 * Local: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/qi-macro
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const fredKey = process.env.FRED_API_KEY;
  if (!fredKey) {
    return NextResponse.json(
      { error: "FRED_API_KEY não configurada" },
      { status: 500 },
    );
  }

  try {
    const result = await ingestFredQi(fredKey);
    const derived = await buildMacroDerivedSnapshot();
    const status =
      result.errors.length === result.seriesProcessed && result.seriesProcessed > 0
        ? 500
        : result.errors.length > 0
          ? 207
          : 200;

    return NextResponse.json(
      {
        ok: result.errors.length < result.seriesProcessed || result.seriesProcessed === 0,
        jobId: result.jobId,
        pointsInserted: result.pointsInserted,
        seriesProcessed: result.seriesProcessed,
        errors: result.errors,
        derived,
      },
      { status },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
