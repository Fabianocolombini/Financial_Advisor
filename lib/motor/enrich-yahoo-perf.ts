import { fetchYahooChartCloses } from "@/lib/market/yahoo";

export type SymbolPerfPct = {
  perf1dPct: number | null;
  perf7dPct: number | null;
  perf15dPct: number | null;
};

export type SymbolMarketEnrichment = SymbolPerfPct & {
  /** Average daily share volume over the last `VOLUME_SESSIONS` sessions with volume > 0. */
  avgVolumeShares: number | null;
};

/**
 * Volume window, in sessions. Three trading weeks is short enough to reflect the
 * mass actually being traded now, and long enough that one unusual session does
 * not dominate the average.
 */
export const VOLUME_SESSIONS = 15;

function perfFromCloses(bars: { value: number }[], lookback: number): number | null {
  if (bars.length < lookback + 1) return null;
  const latest = bars[bars.length - 1].value;
  const prior = bars[bars.length - 1 - lookback].value;
  if (!prior) return null;
  return ((latest - prior) / prior) * 100;
}

function avgVolumeShares(
  bars: { volume: number }[],
  sessions = VOLUME_SESSIONS,
): number | null {
  const withVol = bars.filter((b) => b.volume > 0);
  if (withVol.length < 5) return null;
  const slice = withVol.slice(-sessions);
  if (slice.length < 5) return null;
  const sum = slice.reduce((acc, b) => acc + b.volume, 0);
  return sum / slice.length;
}

/**
 * EOD % changes + avg volume from Yahoo chart bars.
 */
export async function fetchMarketEnrichmentMap(
  symbols: string[],
): Promise<Map<string, SymbolMarketEnrichment>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out = new Map<string, SymbolMarketEnrichment>();
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
          avgVolumeShares: avgVolumeShares(bars),
        });
      } catch {
        // skip failed symbol
      }
    }),
  );

  return out;
}

/**
 * EOD % changes from Yahoo chart bars (fallback when motor snapshot lacks perf).
 * Lookbacks are trading-day row counts (7D ≈ one week, 15D ≈ three weeks).
 */
export async function fetchPerfPctMap(symbols: string[]): Promise<Map<string, SymbolPerfPct>> {
  const full = await fetchMarketEnrichmentMap(symbols);
  const out = new Map<string, SymbolPerfPct>();
  for (const [sym, p] of full) {
    out.set(sym, {
      perf1dPct: p.perf1dPct,
      perf7dPct: p.perf7dPct,
      perf15dPct: p.perf15dPct,
    });
  }
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
