import type { YahooBar } from "./yahoo";

export type PerfHorizonId = "1d" | "5d" | "15d" | "1m" | "2y";

export type PerfHorizons = Record<PerfHorizonId, number | null>;

/** Trading-day lookbacks used for chart window + performance tiles. */
export const PERF_HORIZON_LOOKBACK: Record<Exclude<PerfHorizonId, "2y">, number> = {
  "1d": 1,
  "5d": 5,
  "15d": 15,
  "1m": 21,
};

function perfFromCloses(bars: YahooBar[], lookback: number): number | null {
  if (bars.length < lookback + 1) return null;
  const latest = bars[bars.length - 1].value;
  const prior = bars[bars.length - 1 - lookback].value;
  if (!prior) return null;
  return ((latest - prior) / prior) * 100;
}

/** Trading-day lookbacks from daily bars. */
export function perfHorizonsFromBars(bars: YahooBar[]): PerfHorizons {
  if (bars.length < 2) {
    return { "1d": null, "5d": null, "15d": null, "1m": null, "2y": null };
  }
  const latest = bars[bars.length - 1].value;
  const first = bars[0].value;
  const twoYearPct =
    first > 0 ? ((latest - first) / first) * 100 : null;

  return {
    "1d": perfFromCloses(bars, PERF_HORIZON_LOOKBACK["1d"]),
    "5d": perfFromCloses(bars, PERF_HORIZON_LOOKBACK["5d"]),
    "15d": perfFromCloses(bars, PERF_HORIZON_LOOKBACK["15d"]),
    "1m": perfFromCloses(bars, PERF_HORIZON_LOOKBACK["1m"]),
    "2y": twoYearPct,
  };
}

export const PERF_HORIZON_LABELS: Record<PerfHorizonId, string> = {
  "1d": "1D",
  "5d": "5D",
  "15d": "15D",
  "1m": "1M",
  "2y": "2Y",
};

export function sliceBarsForHorizon<T>(bars: T[], horizon: PerfHorizonId): T[] {
  if (horizon === "2y" || bars.length === 0) return bars;
  const lookback = PERF_HORIZON_LOOKBACK[horizon];
  // Keep lookback+1 points so the return over the horizon is visible as a path.
  const n = Math.min(bars.length, lookback + 1);
  return bars.slice(-n);
}
