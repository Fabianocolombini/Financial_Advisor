import { NextResponse } from "next/server";
import { perfHorizonsFromBars } from "@/lib/market/perf-horizons";
import { computeTechnicalSummary } from "@/lib/market/technical-summary";
import { fetchYahooChartCloses } from "@/lib/market/yahoo";

const TWO_YEARS_SEC = 730 * 86400;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await ctx.params;
  const sym = symbol?.trim().toUpperCase();
  if (!sym) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - TWO_YEARS_SEC;

  try {
    const bars = await fetchYahooChartCloses(sym, period1, period2, 300);
    return NextResponse.json({
      symbol: sym,
      bars: bars.map((b) => ({ date: b.date, value: b.value, volume: b.volume })),
      perfHorizons: perfHorizonsFromBars(bars),
      technicalRows: computeTechnicalSummary(bars),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
