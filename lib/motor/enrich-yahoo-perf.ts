import { fetchYahooChartCloses } from "@/lib/market/yahoo";

/**
 * 1-day % change from Yahoo chart (EOD bars). Used when motor snapshot lacks perf.
 */
export async function fetchPerf1dPctMap(symbols: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out = new Map<string, number>();
  if (unique.length === 0) return out;

  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 21 * 86400;

  await Promise.all(
    unique.map(async (symbol) => {
      try {
        const bars = await fetchYahooChartCloses(symbol, period1, period2);
        if (bars.length < 2) return;
        const latest = bars[bars.length - 1].value;
        const prior = bars[bars.length - 2].value;
        if (!prior) return;
        out.set(symbol, ((latest - prior) / prior) * 100);
      } catch {
        // skip failed symbol
      }
    }),
  );

  return out;
}
