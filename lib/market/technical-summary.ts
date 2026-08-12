/**
 * Buy / Sell / Neutral ratings for the technical summary table.
 *
 * The rating rules follow the conventions used by mainstream charting platforms,
 * which are deliberately stricter than "value above/below a threshold": most
 * oscillators only signal when an extreme is being *left* (a reversal), not while
 * price is merely extended. That is why a strongly trending symbol shows many
 * Neutral oscillators alongside unanimous moving averages.
 */

import type { IndicatorAction } from "@/lib/motor/format-scores";
import {
  MA_PERIODS,
  computeIndicatorSeries,
  emaSeriesOf,
  ichimokuCloudAt,
  type IndicatorBar,
  type IndicatorSeries,
} from "./technical-indicators";

export type TechnicalIndicatorRow = {
  id: string;
  name: string;
  value: number | null;
  action: IndicatorAction;
  group: "oscillator" | "moving_average";
};

const NEUTRAL: IndicatorAction = "Neutral";

/** Last non-null value of a series, plus the `back`-th previous one. */
function at(series: Array<number | null> | undefined, back = 0): number | null {
  if (!series) return null;
  const index = series.length - 1 - back;
  if (index < 0) return null;
  const v = series[index];
  return v != null && Number.isFinite(v) ? v : null;
}

/**
 * Direction of the last step. A flat reading is deliberately neither rising nor
 * falling: an oscillator pinned at its ceiling has stopped confirming the move,
 * but it has not turned either, so it must not produce a reversal signal.
 */
function slope(series: Array<number | null> | undefined): "up" | "down" | "flat" | null {
  const now = at(series, 0);
  const prev = at(series, 1);
  if (now == null || prev == null) return null;
  if (now > prev) return "up";
  if (now < prev) return "down";
  return "flat";
}

function lineOf(series: IndicatorSeries, id: string): Array<number | null> | undefined {
  return series.lines.find((l) => l.id === id)?.values;
}

// ---------------------------------------------------------------------------
// Rating rules
// ---------------------------------------------------------------------------

function ratingRsi(series: IndicatorSeries): IndicatorAction {
  const v = at(series.values);
  const dir = slope(series.values);
  if (v == null || dir == null) return NEUTRAL;
  if (v < 30 && dir === "up") return "Buy";
  if (v > 70 && dir === "down") return "Sell";
  return NEUTRAL;
}

function ratingStochastic(series: IndicatorSeries, dId: string): IndicatorAction {
  const k = at(series.values);
  const d = at(lineOf(series, dId));
  if (k == null || d == null) return NEUTRAL;
  if (k < 20 && d < 20 && k > d) return "Buy";
  if (k > 80 && d > 80 && k < d) return "Sell";
  return NEUTRAL;
}

function ratingCci(series: IndicatorSeries): IndicatorAction {
  const v = at(series.values);
  const dir = slope(series.values);
  if (v == null || dir == null) return NEUTRAL;
  if (v < -100 && dir === "up") return "Buy";
  if (v > 100 && dir === "down") return "Sell";
  return NEUTRAL;
}

/**
 * ADX measures trend strength, not direction, so the rating comes from a fresh
 * ±DI crossover while the trend is strong enough to be meaningful. A symbol deep
 * into an established trend reads Neutral: the signal already happened.
 */
function ratingAdx(series: IndicatorSeries): IndicatorAction {
  const adx = at(series.values);
  if (adx == null || adx <= 20) return NEUTRAL;
  const plus = lineOf(series, "di_plus");
  const minus = lineOf(series, "di_minus");
  const p0 = at(plus, 0);
  const m0 = at(minus, 0);
  const p1 = at(plus, 1);
  const m1 = at(minus, 1);
  if (p0 == null || m0 == null || p1 == null || m1 == null) return NEUTRAL;
  if (p0 > m0 && p1 < m1) return "Buy";
  if (p0 < m0 && p1 > m1) return "Sell";
  return NEUTRAL;
}

/** Zero-line cross or a saucer (two-bar turn on the same side of zero). */
function ratingAwesome(series: IndicatorSeries): IndicatorAction {
  const v0 = at(series.values, 0);
  const v1 = at(series.values, 1);
  const v2 = at(series.values, 2);
  if (v0 == null || v1 == null || v2 == null) return NEUTRAL;
  if (v0 > 0 && v1 <= 0) return "Buy";
  if (v0 < 0 && v1 >= 0) return "Sell";
  if (v0 > 0 && v1 > 0 && v0 > v1 && v1 < v2) return "Buy";
  if (v0 < 0 && v1 < 0 && v0 < v1 && v1 > v2) return "Sell";
  return NEUTRAL;
}

function ratingMomentum(series: IndicatorSeries): IndicatorAction {
  const dir = slope(series.values);
  if (dir === "up") return "Buy";
  if (dir === "down") return "Sell";
  return NEUTRAL;
}

function ratingMacd(series: IndicatorSeries): IndicatorAction {
  const macd = at(series.values);
  const signal = at(lineOf(series, "macd_signal"));
  if (macd == null || signal == null) return NEUTRAL;
  if (macd > signal) return "Buy";
  if (macd < signal) return "Sell";
  return NEUTRAL;
}

function ratingStochRsi(series: IndicatorSeries): IndicatorAction {
  const k = at(series.values);
  const d = at(lineOf(series, "stoch_rsi_d"));
  if (k == null || d == null) return NEUTRAL;
  if (k < 20 && k > d) return "Buy";
  if (k > 80 && k < d) return "Sell";
  return NEUTRAL;
}

function ratingWilliams(series: IndicatorSeries): IndicatorAction {
  const v = at(series.values);
  const dir = slope(series.values);
  if (v == null || dir == null) return NEUTRAL;
  if (v < -80 && dir === "up") return "Buy";
  if (v > -20 && dir === "down") return "Sell";
  return NEUTRAL;
}

/** Elder: enter with the trend when the opposing power is exhausting itself. */
function ratingBullBearPower(
  series: IndicatorSeries,
  emaDirection: "up" | "down" | "flat" | null,
): IndicatorAction {
  const bull = lineOf(series, "bull_power");
  const bear = lineOf(series, "bear_power");
  const bull0 = at(bull, 0);
  const bull1 = at(bull, 1);
  const bear0 = at(bear, 0);
  const bear1 = at(bear, 1);
  if (emaDirection == null || bull0 == null || bull1 == null || bear0 == null || bear1 == null) {
    return NEUTRAL;
  }
  if (emaDirection === "up" && bear0 < 0 && bear0 > bear1) return "Buy";
  if (emaDirection === "down" && bull0 > 0 && bull0 < bull1) return "Sell";
  return NEUTRAL;
}

function ratingUltimate(series: IndicatorSeries): IndicatorAction {
  const v = at(series.values);
  if (v == null) return NEUTRAL;
  if (v > 70) return "Buy";
  if (v < 30) return "Sell";
  return NEUTRAL;
}

function ratingPriceVsMa(price: number | null, ma: number | null): IndicatorAction {
  if (price == null || ma == null) return NEUTRAL;
  if (price > ma) return "Buy";
  if (price < ma) return "Sell";
  return NEUTRAL;
}

function ratingIchimoku(
  series: IndicatorSeries,
  close: number | null,
  spanA: number | null,
  spanB: number | null,
): IndicatorAction {
  const base = at(series.values);
  const conversion = at(lineOf(series, "ichimoku_conversion"));
  if (close == null || base == null || conversion == null || spanA == null || spanB == null) {
    return NEUTRAL;
  }
  if (spanA > spanB && close > spanA && close < conversion && conversion > base) return "Buy";
  if (spanA < spanB && close < spanB && close > conversion && conversion < base) return "Sell";
  return NEUTRAL;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type TechnicalAnalysis = {
  rows: TechnicalIndicatorRow[];
  series: IndicatorSeries[];
};

const MIN_BARS = 30;

export function computeTechnicalAnalysis(bars: IndicatorBar[]): TechnicalAnalysis {
  if (bars.length < MIN_BARS) return { rows: [], series: [] };

  const series = computeIndicatorSeries(bars);
  const byId = new Map(series.map((s) => [s.id, s]));
  const price = bars[bars.length - 1]?.value ?? null;

  const rate = (id: string, fn: (s: IndicatorSeries) => IndicatorAction): IndicatorAction => {
    const s = byId.get(id);
    return s ? fn(s) : NEUTRAL;
  };

  // Elder's rule keys off the direction of the 13-period EMA the powers are measured against.
  const emaDirection = slope(emaSeriesOf(bars.map((b) => b.value), 13));

  const cloud = ichimokuCloudAt(bars, bars.length - 1);

  const actions: Record<string, IndicatorAction> = {
    rsi_14: rate("rsi_14", ratingRsi),
    stoch_k: rate("stoch_k", (s) => ratingStochastic(s, "stoch_d")),
    cci_20: rate("cci_20", ratingCci),
    adx_14: rate("adx_14", ratingAdx),
    awesome: rate("awesome", ratingAwesome),
    momentum_10: rate("momentum_10", ratingMomentum),
    macd: rate("macd", ratingMacd),
    stoch_rsi: rate("stoch_rsi", ratingStochRsi),
    williams_r: rate("williams_r", ratingWilliams),
    bull_bear_power: rate("bull_bear_power", (s) => ratingBullBearPower(s, emaDirection)),
    ultimate: rate("ultimate", ratingUltimate),
    ichimoku_base: rate("ichimoku_base", (s) =>
      ratingIchimoku(s, price, cloud.spanA, cloud.spanB),
    ),
  };

  const rows: TechnicalIndicatorRow[] = series.map((s) => {
    const value = at(s.values);
    const action =
      actions[s.id] ?? (s.group === "moving_average" ? ratingPriceVsMa(price, value) : NEUTRAL);
    return { id: s.id, name: s.name, value, action, group: s.group };
  });

  return { rows, series };
}

export function computeTechnicalSummary(bars: IndicatorBar[]): TechnicalIndicatorRow[] {
  return computeTechnicalAnalysis(bars).rows;
}

export function countTaActions(rows: TechnicalIndicatorRow[]): {
  buy: number;
  neutral: number;
  sell: number;
} {
  let buy = 0;
  let neutral = 0;
  let sell = 0;
  for (const row of rows) {
    if (row.action === "Buy") buy += 1;
    else if (row.action === "Sell") sell += 1;
    else neutral += 1;
  }
  return { buy, neutral, sell };
}

/**
 * Maps a Buy/Sell/Neutral tally onto the −1…+1 gauge used by the clocks.
 * Unanimous Buy is +1, unanimous Sell is −1, a tie (or all Neutral) is 0.
 */
export function countsToSignedGauge(counts: {
  buy: number;
  sell: number;
  neutral: number;
}): number | null {
  const total = counts.buy + counts.sell + counts.neutral;
  if (total === 0) return null;
  return (counts.buy - counts.sell) / total;
}

export { MA_PERIODS };

/** % change between latest and lookback trading-day rows. */
export function perfFromBars(bars: IndicatorBar[], lookback: number): number | null {
  if (bars.length < lookback + 1) return null;
  const latest = bars[bars.length - 1]!.value;
  const prior = bars[bars.length - 1 - lookback]!.value;
  if (!prior) return null;
  return ((latest - prior) / prior) * 100;
}
