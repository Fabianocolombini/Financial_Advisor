export type PriceBar = { date: string; value: number };

export function trendFromSparkline(data: number[]): {
  direction: "up" | "down" | "flat";
  delta: number | null;
  deltaPct: number | null;
} {
  if (data.length < 2) {
    return { direction: "flat", delta: null, deltaPct: null };
  }
  const prev = data[data.length - 2]!;
  const last = data[data.length - 1]!;
  const delta = last - prev;
  const deltaPct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : null;
  const direction =
    Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down";
  return { direction, delta, deltaPct };
}
