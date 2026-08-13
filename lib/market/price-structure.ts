/**
 * Price structure primitives shared by the decision summary and the forecast engine:
 * Bollinger position, trend state, swing pivots, support/resistance, ATR,
 * Fibonacci levels and volatility estimators.
 *
 * Everything degrades gracefully when only closes are available; `high`/`low`
 * simply produce tighter pivots and enable ATR.
 */

import { bollingerBands } from "./chart-overlays";

export type StructureBar = {
  date: string;
  value: number;
  high?: number;
  low?: number;
  volume?: number;
};

/* ------------------------------------------------------------------ *
 * Bollinger position
 * ------------------------------------------------------------------ */

export type BollingerZone =
  | "below_lower"
  | "lower_half"
  | "middle"
  | "upper_half"
  | "above_upper"
  | "unknown";

export type BollingerPosition = {
  mid: number | null;
  upper: number | null;
  lower: number | null;
  /** 0 = lower band, 1 = upper band. Outside [0,1] means the band was pierced. */
  percentB: number | null;
  /** (upper - lower) / mid — relative band width. */
  bandwidth: number | null;
  zone: BollingerZone;
  label: string;
};

const BOLLINGER_LABELS: Record<BollingerZone, string> = {
  below_lower: "below the lower band (stretched lower)",
  lower_half: "in the lower half of the band",
  middle: "at the middle of the band",
  upper_half: "in the upper half of the band",
  above_upper: "above the upper band (stretched higher)",
  unknown: "band position unavailable",
};

export function bollingerPosition(
  values: number[],
  period = 20,
  mult = 2,
): BollingerPosition {
  const empty: BollingerPosition = {
    mid: null,
    upper: null,
    lower: null,
    percentB: null,
    bandwidth: null,
    zone: "unknown",
    label: BOLLINGER_LABELS.unknown,
  };
  if (values.length < period) return empty;

  const { mid, upper, lower } = bollingerBands(values, period, mult);
  const i = values.length - 1;
  const m = mid[i];
  const u = upper[i];
  const l = lower[i];
  const price = values[i];
  if (m == null || u == null || l == null || price == null || u === l) return empty;

  const percentB = (price - l) / (u - l);
  const bandwidth = m !== 0 ? (u - l) / m : null;

  let zone: BollingerZone;
  if (percentB < 0) zone = "below_lower";
  else if (percentB < 0.35) zone = "lower_half";
  else if (percentB <= 0.65) zone = "middle";
  else if (percentB <= 1) zone = "upper_half";
  else zone = "above_upper";

  return { mid: m, upper: u, lower: l, percentB, bandwidth, zone, label: BOLLINGER_LABELS[zone] };
}

/* ------------------------------------------------------------------ *
 * Trend
 * ------------------------------------------------------------------ */

export type TrendDirection = "up" | "down" | "sideways" | "unknown";

export type TrendState = {
  direction: TrendDirection;
  label: string;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  /** % change of the 20d average over the last 20 sessions. */
  slopePct: number | null;
};

function simpleAverage(values: number[], period: number, offsetFromEnd = 0): number | null {
  const end = values.length - offsetFromEnd;
  if (end < period) return null;
  const slice = values.slice(end - period, end);
  return slice.reduce((a, b) => a + b, 0) / period;
}

const TREND_LABELS: Record<TrendDirection, string> = {
  up: "uptrend",
  down: "downtrend",
  sideways: "no defined trend (sideways)",
  unknown: "trend unavailable",
};

export function trendState(values: number[]): TrendState {
  const sma20 = simpleAverage(values, 20);
  const sma50 = simpleAverage(values, 50);
  const sma200 = simpleAverage(values, 200);
  const sma20Prior = simpleAverage(values, 20, 20);

  const slopePct =
    sma20 != null && sma20Prior != null && sma20Prior !== 0
      ? ((sma20 - sma20Prior) / sma20Prior) * 100
      : null;

  let direction: TrendDirection = "unknown";
  if (sma20 != null && sma50 != null && slopePct != null) {
    const above = sma20 > sma50 * 1.002;
    const below = sma20 < sma50 * 0.998;
    if (above && slopePct > 0.2) direction = "up";
    else if (below && slopePct < -0.2) direction = "down";
    else direction = "sideways";
  }

  return { direction, label: TREND_LABELS[direction], sma20, sma50, sma200, slopePct };
}

/* ------------------------------------------------------------------ *
 * Swing pivots and support / resistance
 * ------------------------------------------------------------------ */

export type SwingPivot = {
  index: number;
  date: string;
  price: number;
  kind: "high" | "low";
};

function barHigh(bar: StructureBar): number {
  return bar.high ?? bar.value;
}

function barLow(bar: StructureBar): number {
  return bar.low ?? bar.value;
}

/**
 * Confirmed swing pivots: a bar is a pivot when it is the extreme of the
 * `window` bars on both sides. Requiring both sides means the pivot is only
 * reported after it is confirmed, which keeps the levels free of look-ahead.
 */
export function swingPivots(bars: StructureBar[], window = 5): SwingPivot[] {
  const pivots: SwingPivot[] = [];
  if (bars.length < window * 2 + 1) return pivots;

  for (let i = window; i < bars.length - window; i++) {
    const bar = bars[i]!;
    const high = barHigh(bar);
    const low = barLow(bar);
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      const other = bars[j]!;
      if (barHigh(other) >= high) isHigh = false;
      if (barLow(other) <= low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ index: i, date: bar.date, price: high, kind: "high" });
    else if (isLow) pivots.push({ index: i, date: bar.date, price: low, kind: "low" });
  }
  return pivots;
}

export type PriceLevels = {
  supports: number[];
  resistances: number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
  lastSwingHigh: SwingPivot | null;
  lastSwingLow: SwingPivot | null;
};

/** Collapses levels that sit within `tolerancePct` of each other. */
function clusterLevels(levels: number[], tolerancePct = 0.5): number[] {
  const sorted = [...levels].sort((a, b) => a - b);
  const out: number[] = [];
  for (const level of sorted) {
    const last = out[out.length - 1];
    if (last != null && last !== 0 && Math.abs((level - last) / last) * 100 < tolerancePct) {
      out[out.length - 1] = (last + level) / 2;
      continue;
    }
    out.push(level);
  }
  return out;
}

export function supportResistance(
  bars: StructureBar[],
  price: number | null,
  lookback = 180,
  window = 5,
): PriceLevels {
  const empty: PriceLevels = {
    supports: [],
    resistances: [],
    nearestSupport: null,
    nearestResistance: null,
    lastSwingHigh: null,
    lastSwingLow: null,
  };
  if (bars.length === 0 || price == null || !Number.isFinite(price)) return empty;

  const slice = bars.slice(-lookback);
  const pivots = swingPivots(slice, window);
  if (pivots.length === 0) return empty;

  const highs = pivots.filter((p) => p.kind === "high");
  const lows = pivots.filter((p) => p.kind === "low");

  const supports = clusterLevels(
    [...lows, ...highs].filter((p) => p.price < price).map((p) => p.price),
  ).reverse();
  const resistances = clusterLevels(
    [...highs, ...lows].filter((p) => p.price > price).map((p) => p.price),
  );

  return {
    supports: supports.slice(0, 3),
    resistances: resistances.slice(0, 3),
    nearestSupport: supports[0] ?? null,
    nearestResistance: resistances[0] ?? null,
    lastSwingHigh: highs.length ? highs[highs.length - 1]! : null,
    lastSwingLow: lows.length ? lows[lows.length - 1]! : null,
  };
}

/* ------------------------------------------------------------------ *
 * Volatility
 * ------------------------------------------------------------------ */

export function dailyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    if (!prev) continue;
    out.push((values[i]! - prev) / prev);
  }
  return out;
}

/** Standard deviation of daily returns over the last `window` sessions. */
export function realizedVol(values: number[], window = 20): number | null {
  const rets = dailyReturns(values).slice(-window);
  if (rets.length < Math.min(window, 10)) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance);
}

/** RiskMetrics EWMA daily volatility (same lambda as the motor's ewma_vol). */
export function ewmaVol(values: number[], lambda = 0.94): number | null {
  const rets = dailyReturns(values);
  if (rets.length < 20) return null;
  let variance = rets.slice(0, 20).reduce((a, r) => a + r * r, 0) / 20;
  for (let i = 20; i < rets.length; i++) {
    variance = lambda * variance + (1 - lambda) * rets[i]! ** 2;
  }
  return Math.sqrt(variance);
}

/** Average True Range. Falls back to close-to-close range when OHLC is absent. */
export function atr(bars: StructureBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]!;
    const prevClose = bars[i - 1]!.value;
    const high = barHigh(bar);
    const low = barLow(bar);
    trs.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)),
    );
  }
  const slice = trs.slice(-period);
  if (slice.length < period) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/* ------------------------------------------------------------------ *
 * Fibonacci
 * ------------------------------------------------------------------ */

export type FibonacciLevel = {
  ratio: number;
  label: string;
  price: number;
  kind: "retracement" | "extension";
};

const RETRACEMENT_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786];
const EXTENSION_RATIOS = [1.272, 1.618];

/**
 * Fibonacci levels anchored to a confirmed swing. Returns an empty list when the
 * swing is too shallow to be meaningful (default 3% of price), which is the normal
 * case for cash-like instruments.
 */
export function fibonacciLevels(
  swingLow: number | null,
  swingHigh: number | null,
  minSwingPct = 3,
): FibonacciLevel[] {
  if (swingLow == null || swingHigh == null) return [];
  if (!Number.isFinite(swingLow) || !Number.isFinite(swingHigh)) return [];
  if (swingHigh <= swingLow || swingLow <= 0) return [];

  const range = swingHigh - swingLow;
  if ((range / swingLow) * 100 < minSwingPct) return [];

  const levels: FibonacciLevel[] = RETRACEMENT_RATIOS.map((ratio) => ({
    ratio,
    label: `${(ratio * 100).toFixed(1)}%`,
    price: swingHigh - range * ratio,
    kind: "retracement" as const,
  }));

  for (const ratio of EXTENSION_RATIOS) {
    levels.push({
      ratio,
      label: `${(ratio * 100).toFixed(1)}%`,
      price: swingLow + range * ratio,
      kind: "extension",
    });
  }

  return levels;
}
