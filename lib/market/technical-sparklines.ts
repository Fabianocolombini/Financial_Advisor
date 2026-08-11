export type PriceBar = { date: string; value: number };

function closes(bars: PriceBar[]): number[] {
  return bars.map((b) => b.value);
}

function rsiAt(values: number[], end: number, period = 14): number | null {
  if (end < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = end - period + 1; i <= end; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function stochasticKAt(values: number[], end: number, period = 14): number | null {
  if (end < period - 1) return null;
  const slice = values.slice(end - period + 1, end + 1);
  const low = Math.min(...slice);
  const high = Math.max(...slice);
  const close = slice[slice.length - 1];
  if (high === low) return 50;
  return ((close - low) / (high - low)) * 100;
}

function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = emaVal;
  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
    out[i] = emaVal;
  }
  return out;
}

function macdAt(values: number[], end: number): number | null {
  const slice = values.slice(0, end + 1);
  const e12 = emaSeries(slice, 12);
  const e26 = emaSeries(slice, 26);
  const v12 = e12[end];
  const v26 = e26[end];
  if (v12 == null || v26 == null) return null;
  return v12 - v26;
}

function smaAt(values: number[], end: number, period: number): number | null {
  if (end < period - 1) return null;
  const slice = values.slice(end - period + 1, end + 1);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function sparklineFrom(
  bars: PriceBar[],
  compute: (values: number[], end: number) => number | null,
  points = 8,
): number[] {
  if (bars.length < 4) return [];
  const values = closes(bars);
  const out: number[] = [];
  const start = Math.max(0, values.length - points);
  for (let end = start; end < values.length; end++) {
    const v = compute(values, end);
    if (v != null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function technicalSparklines(bars: PriceBar[], indicatorId: string): number[] {
  switch (indicatorId) {
    case "rsi_14":
      return sparklineFrom(bars, rsiAt);
    case "stoch_k":
      return sparklineFrom(bars, stochasticKAt);
    case "macd":
      return sparklineFrom(bars, macdAt);
    case "momentum_10":
      return sparklineFrom(bars, (values, end) => {
        if (end < 10) return null;
        return values[end] - values[end - 10];
      });
    default: {
      const maMatch = /^sma_(\d+)$/.exec(indicatorId);
      if (maMatch) {
        const period = Number(maMatch[1]);
        return sparklineFrom(bars, (values, end) => smaAt(values, end, period));
      }
      const emaMatch = /^ema_(\d+)$/.exec(indicatorId);
      if (emaMatch) {
        const period = Number(emaMatch[1]);
        return sparklineFrom(bars, (values, end) => {
          const series = emaSeries(values.slice(0, end + 1), period);
          return series[end] ?? null;
        });
      }
      return sparklineFrom(bars, (_, end) => bars[end]?.value ?? null);
    }
  }
}

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
