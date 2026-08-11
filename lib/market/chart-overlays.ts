import type { PriceBar } from "./technical-sparklines";

export type ChartBar = PriceBar & { volume?: number };

export function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function bollingerBands(
  values: number[],
  period = 20,
  mult = 2,
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid = smaSeries(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = mid[i];
    if (mean == null) continue;
    const variance =
      slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    upper[i] = mean + mult * std;
    lower[i] = mean - mult * std;
  }

  return { mid, upper, lower };
}

export function avgVolume(bars: ChartBar[], period = 20): number | null {
  const withVol = bars.filter((b) => (b.volume ?? 0) > 0);
  if (withVol.length === 0) return null;
  const slice = withVol.slice(-period);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + (b.volume ?? 0), 0) / slice.length;
}

export function volumeConfirmation(bars: ChartBar[], avgPeriod = 20): {
  latestVolume: number | null;
  averageVolume: number | null;
  vsAvgPct: number | null;
  message: string | null;
} {
  const latest = bars[bars.length - 1];
  const latestVolume = latest?.volume != null && latest.volume > 0 ? latest.volume : null;
  const averageVolume = avgVolume(bars, avgPeriod);
  if (latestVolume == null || averageVolume == null || averageVolume <= 0) {
    return { latestVolume, averageVolume, vsAvgPct: null, message: null };
  }
  const vsAvgPct = ((latestVolume - averageVolume) / averageVolume) * 100;
  const message =
    vsAvgPct >= 20
      ? `Volume ${vsAvgPct.toFixed(0)}% acima da média — movimento confirmado`
      : vsAvgPct <= -20
        ? `Volume ${Math.abs(vsAvgPct).toFixed(0)}% abaixo da média — confirmação fraca`
        : `Volume próximo da média (${vsAvgPct >= 0 ? "+" : ""}${vsAvgPct.toFixed(0)}%)`;
  return { latestVolume, averageVolume, vsAvgPct, message };
}

/** Cumulative return path ending at 0 for the last point (for sparkline). */
export function cumulativeReturnSparkline(values: number[], points = 20): number[] {
  if (values.length < 2) return [];
  const slice = values.slice(-points);
  const base = slice[0]!;
  if (!base) return [];
  return slice.map((v) => ((v - base) / base) * 100);
}

export function bollingerCompressionLabel(
  values: number[],
  period = 20,
): "comprimida" | "expandida" | null {
  if (values.length < period + 5) return null;
  const { upper, lower } = bollingerBands(values, period);
  const widths: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const u = upper[i];
    const l = lower[i];
    const mid = values[i];
    if (u == null || l == null || mid == null || mid === 0) continue;
    widths.push((u - l) / mid);
  }
  if (widths.length < 6) return null;
  const recent = widths.slice(-5);
  const prior = widths.slice(-15, -5);
  if (prior.length === 0) return null;
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (priorAvg <= 0) return null;
  const ratio = recentAvg / priorAvg;
  if (ratio < 0.75) return "comprimida";
  if (ratio > 1.25) return "expandida";
  return null;
}
