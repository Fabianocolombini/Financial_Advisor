import type { YahooBar } from "./yahoo";

export type PerfHorizonId = "1d" | "5d" | "1m" | "2y";

export type PerfHorizons = Record<PerfHorizonId, number | null>;

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
    return { "1d": null, "5d": null, "1m": null, "2y": null };
  }
  const latest = bars[bars.length - 1].value;
  const first = bars[0].value;
  const twoYearPct =
    first > 0 ? ((latest - first) / first) * 100 : null;

  return {
    "1d": perfFromCloses(bars, 1),
    "5d": perfFromCloses(bars, 5),
    "1m": perfFromCloses(bars, 21),
    "2y": twoYearPct,
  };
}

export const PERF_HORIZON_LABELS: Record<PerfHorizonId, string> = {
  "1d": "1 day",
  "5d": "5 days",
  "1m": "1 month",
  "2y": "2 years",
};
