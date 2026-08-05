import { fetchYahooChartCloses } from "@/lib/market/yahoo";

export type SymbolPerfPct = {
  perf1dPct: number | null;
  perf7dPct: number | null;
  perf15dPct: number | null;
};

function perfFromCloses(bars: { value: number }[], lookback: number): number | null {
  if (bars.length < lookback + 1) return null;
  const latest = bars[bars.length - 1].value;
  const prior = bars[bars.length - 1 - lookback].value;
  if (!prior) return null;
  return ((latest - prior) / prior) * 100;
}

/**
 * EOD % changes from Yahoo chart bars (fallback when motor snapshot lacks perf).
 * Lookbacks are trading-day row counts (7D ≈ one week, 15D ≈ three weeks).
 */
export async function fetchPerfPctMap(symbols: string[]): Promise<Map<string, SymbolPerfPct>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out = new Map<string, SymbolPerfPct>();
  if (unique.length === 0) return out;

  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 45 * 86400;

  await Promise.all(
    unique.map(async (symbol) => {
      try {
        const bars = await fetchYahooChartCloses(symbol, period1, period2);
        out.set(symbol, {
          perf1dPct: perfFromCloses(bars, 1),
          perf7dPct: perfFromCloses(bars, 7),
          perf15dPct: perfFromCloses(bars, 15),
        });
      } catch {
        // skip failed symbol
      }
    }),
  );

  return out;
}

/** @deprecated use fetchPerfPctMap */
export async function fetchPerf1dPctMap(symbols: string[]): Promise<Map<string, number>> {
  const full = await fetchPerfPctMap(symbols);
  const out = new Map<string, number>();
  for (const [sym, p] of full) {
    if (p.perf1dPct != null) out.set(sym, p.perf1dPct);
  }
  return out;
}
