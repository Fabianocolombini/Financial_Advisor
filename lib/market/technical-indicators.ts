/**
 * Technical indicator engine.
 *
 * Every indicator is computed as a full series aligned index-for-index with the
 * input bars, so the summary table (last point), the sparkline (last points) and
 * the detail chart (whole series) all read from the same numbers instead of three
 * separate implementations that can disagree.
 *
 * Formulas follow the conventions used by charting platforms: Wilder smoothing
 * (RMA) for RSI/ATR/ADX, and true OHLC ranges for Stochastic, Williams %R, CCI
 * and the Ultimate Oscillator rather than close-only approximations.
 */

export type IndicatorBar = {
  date: string;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
};

export type IndicatorLine = {
  id: string;
  name: string;
  values: Array<number | null>;
  color: string;
};

export type IndicatorLevel = {
  value: number;
  label?: string;
  /** Zero/mid lines are drawn neutral; band edges are drawn as thresholds. */
  kind: "threshold" | "zero";
};

export type IndicatorSeries = {
  id: string;
  name: string;
  group: "oscillator" | "moving_average";
  /** Main plotted line, `null` until the warm-up period is satisfied. */
  values: Array<number | null>;
  /** Companion lines (signal, %D, ±DI) shown in the detail chart. */
  lines: IndicatorLine[];
  /** Horizontal reference levels for the detail chart. */
  levels: IndicatorLevel[];
  /** Moving averages are drawn over the price; oscillators need their own pane. */
  pane: "price" | "separate";
  decimals: number;
};

const LINE_PRIMARY = "#38bdf8";
const LINE_SECONDARY = "#f59e0b";
const LINE_TERTIARY = "#a78bfa";

// ---------------------------------------------------------------------------
// Generic smoothing helpers
// ---------------------------------------------------------------------------

function nulls(length: number): Array<number | null> {
  return new Array(length).fill(null);
}

/** Ratios of near-identical floats can land a hair outside their range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Bounded oscillators are re-clamped after smoothing: the rolling sum used by the
 * moving average accumulates floating-point error, which can push a series that
 * should sit exactly at 0 or 100 a few 1e-15 outside its own range.
 */
function clampSeries(
  values: Array<number | null>,
  min: number,
  max: number,
): Array<number | null> {
  return values.map((v) => (v == null ? null : clamp(v, min, max)));
}

export function smaSeriesOf(values: Array<number | null>, period: number): Array<number | null> {
  const out = nulls(values.length);
  if (period <= 0) return out;
  let sum = 0;
  let count = 0;
  let windowStart = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      // A gap resets the window: averaging across it would silently shorten the period.
      sum = 0;
      count = 0;
      windowStart = i + 1;
      continue;
    }
    sum += v;
    count += 1;
    if (count > period) {
      const dropped = values[windowStart];
      if (dropped != null) sum -= dropped;
      windowStart += 1;
      count -= 1;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

export function emaSeriesOf(values: Array<number | null>, period: number): Array<number | null> {
  const out = nulls(values.length);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seedSum += v;
      seedCount += 1;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (RMA): the average behind RSI, ATR and ADX. */
function rmaSeriesOf(values: Array<number | null>, period: number): Array<number | null> {
  const out = nulls(values.length);
  let prev: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seedSum += v;
      seedCount += 1;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (period - 1) + v) / period;
    out[i] = prev;
  }
  return out;
}

function wmaSeriesOf(values: Array<number | null>, period: number): Array<number | null> {
  const out = nulls(values.length);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = 0; j < period; j++) {
      const v = values[i - period + 1 + j];
      if (v == null) {
        ok = false;
        break;
      }
      sum += v * (j + 1);
    }
    if (ok) out[i] = sum / denom;
  }
  return out;
}

function rollingExtreme(values: number[], period: number, mode: "max" | "min"): Array<number | null> {
  const out = nulls(values.length);
  for (let i = period - 1; i < values.length; i++) {
    let best = values[i - period + 1]!;
    for (let j = i - period + 2; j <= i; j++) {
      const v = values[j]!;
      if (mode === "max" ? v > best : v < best) best = v;
    }
    out[i] = best;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bar accessors — fall back to close when a feed omits OHLC
// ---------------------------------------------------------------------------

function closesOf(bars: IndicatorBar[]): number[] {
  return bars.map((b) => b.value);
}

function highsOf(bars: IndicatorBar[]): number[] {
  return bars.map((b) => (b.high != null && Number.isFinite(b.high) ? b.high : b.value));
}

function lowsOf(bars: IndicatorBar[]): number[] {
  return bars.map((b) => (b.low != null && Number.isFinite(b.low) ? b.low : b.value));
}

function volumesOf(bars: IndicatorBar[]): number[] {
  return bars.map((b) => (b.volume != null && Number.isFinite(b.volume) ? b.volume : 0));
}

export function hasIntradayRange(bars: IndicatorBar[]): boolean {
  return bars.some((b) => b.high != null && b.low != null && b.high !== b.low);
}

// ---------------------------------------------------------------------------
// Oscillators
// ---------------------------------------------------------------------------

export function rsiSeries(closes: number[], period = 14): Array<number | null> {
  const gains = nulls(closes.length);
  const losses = nulls(closes.length);
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? -diff : 0;
  }
  const avgGain = rmaSeriesOf(gains, period);
  const avgLoss = rmaSeriesOf(losses, period);
  const out = nulls(closes.length);
  for (let i = 0; i < closes.length; i++) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g == null || l == null) continue;
    if (l === 0) {
      out[i] = g === 0 ? 50 : 100;
      continue;
    }
    out[i] = 100 - 100 / (1 + g / l);
  }
  return out;
}

/** Raw %K over a true high/low range, before smoothing. */
function rawStochastic(
  closes: number[],
  highs: number[],
  lows: number[],
  period: number,
): Array<number | null> {
  const hh = rollingExtreme(highs, period, "max");
  const ll = rollingExtreme(lows, period, "min");
  const out = nulls(closes.length);
  for (let i = 0; i < closes.length; i++) {
    const high = hh[i];
    const low = ll[i];
    if (high == null || low == null) continue;
    out[i] = high === low ? 50 : clamp(((closes[i]! - low) / (high - low)) * 100, 0, 100);
  }
  return out;
}

export function stochasticSeries(
  closes: number[],
  highs: number[],
  lows: number[],
  period = 14,
  smoothK = 3,
  smoothD = 3,
): { k: Array<number | null>; d: Array<number | null> } {
  const k = clampSeries(
    smaSeriesOf(rawStochastic(closes, highs, lows, period), smoothK),
    0,
    100,
  );
  return { k, d: clampSeries(smaSeriesOf(k, smoothD), 0, 100) };
}

export function cciSeries(
  closes: number[],
  highs: number[],
  lows: number[],
  period = 20,
): Array<number | null> {
  const typical = closes.map((c, i) => (highs[i]! + lows[i]! + c) / 3);
  const avg = smaSeriesOf(typical, period);
  const out = nulls(closes.length);
  for (let i = period - 1; i < closes.length; i++) {
    const mean = avg[i];
    if (mean == null) continue;
    let deviation = 0;
    for (let j = i - period + 1; j <= i; j++) deviation += Math.abs(typical[j]! - mean);
    deviation /= period;
    out[i] = deviation === 0 ? 0 : (typical[i]! - mean) / (0.015 * deviation);
  }
  return out;
}

export function adxSeries(
  closes: number[],
  highs: number[],
  lows: number[],
  period = 14,
): { adx: Array<number | null>; plusDi: Array<number | null>; minusDi: Array<number | null> } {
  const n = closes.length;
  const trueRange = nulls(n);
  const plusDm = nulls(n);
  const minusDm = nulls(n);

  for (let i = 1; i < n; i++) {
    const upMove = highs[i]! - highs[i - 1]!;
    const downMove = lows[i - 1]! - lows[i]!;
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    trueRange[i] = Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!),
    );
  }

  const smoothTr = rmaSeriesOf(trueRange, period);
  const smoothPlus = rmaSeriesOf(plusDm, period);
  const smoothMinus = rmaSeriesOf(minusDm, period);

  const plusDi = nulls(n);
  const minusDi = nulls(n);
  const dx = nulls(n);
  for (let i = 0; i < n; i++) {
    const tr = smoothTr[i];
    const p = smoothPlus[i];
    const m = smoothMinus[i];
    if (tr == null || p == null || m == null || tr === 0) continue;
    const pd = (p / tr) * 100;
    const md = (m / tr) * 100;
    plusDi[i] = pd;
    minusDi[i] = md;
    const sum = pd + md;
    dx[i] = sum === 0 ? 0 : (Math.abs(pd - md) / sum) * 100;
  }

  return { adx: rmaSeriesOf(dx, period), plusDi, minusDi };
}

export function awesomeOscillatorSeries(
  highs: number[],
  lows: number[],
  fast = 5,
  slow = 34,
): Array<number | null> {
  const median = highs.map((h, i) => (h + lows[i]!) / 2);
  const fastMa = smaSeriesOf(median, fast);
  const slowMa = smaSeriesOf(median, slow);
  return fastMa.map((f, i) => {
    const s = slowMa[i];
    return f == null || s == null ? null : f - s;
  });
}

export function momentumSeries(closes: number[], period = 10): Array<number | null> {
  const out = nulls(closes.length);
  for (let i = period; i < closes.length; i++) out[i] = closes[i]! - closes[i - period]!;
  return out;
}

export function macdSeries(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: Array<number | null>; signal: Array<number | null>; histogram: Array<number | null> } {
  const fastEma = emaSeriesOf(closes, fast);
  const slowEma = emaSeriesOf(closes, slow);
  const macd = fastEma.map((f, i) => {
    const s = slowEma[i];
    return f == null || s == null ? null : f - s;
  });
  const signalLine = emaSeriesOf(macd, signal);
  const histogram = macd.map((m, i) => {
    const s = signalLine[i];
    return m == null || s == null ? null : m - s;
  });
  return { macd, signal: signalLine, histogram };
}

export function stochasticRsiSeries(
  closes: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
  smoothK = 3,
  smoothD = 3,
): { k: Array<number | null>; d: Array<number | null> } {
  const rsi = rsiSeries(closes, rsiPeriod);
  const out = nulls(closes.length);
  for (let i = 0; i < rsi.length; i++) {
    if (rsi[i] == null) continue;
    let high = -Infinity;
    let low = Infinity;
    let count = 0;
    for (let j = i; j >= 0 && count < stochPeriod; j--) {
      const v = rsi[j];
      if (v == null) break;
      if (v > high) high = v;
      if (v < low) low = v;
      count += 1;
    }
    if (count < stochPeriod) continue;
    out[i] = high === low ? 50 : clamp(((rsi[i]! - low) / (high - low)) * 100, 0, 100);
  }
  const k = clampSeries(smaSeriesOf(out, smoothK), 0, 100);
  return { k, d: clampSeries(smaSeriesOf(k, smoothD), 0, 100) };
}

export function williamsRSeries(
  closes: number[],
  highs: number[],
  lows: number[],
  period = 14,
): Array<number | null> {
  const hh = rollingExtreme(highs, period, "max");
  const ll = rollingExtreme(lows, period, "min");
  const out = nulls(closes.length);
  for (let i = 0; i < closes.length; i++) {
    const high = hh[i];
    const low = ll[i];
    if (high == null || low == null) continue;
    out[i] =
      high === low ? -50 : clamp(((high - closes[i]!) / (high - low)) * -100, -100, 0);
  }
  return out;
}

export function bullBearPowerSeries(
  closes: number[],
  highs: number[],
  lows: number[],
  period = 13,
): { power: Array<number | null>; bull: Array<number | null>; bear: Array<number | null>; ema: Array<number | null> } {
  const ema = emaSeriesOf(closes, period);
  const bull = nulls(closes.length);
  const bear = nulls(closes.length);
  const power = nulls(closes.length);
  for (let i = 0; i < closes.length; i++) {
    const e = ema[i];
    if (e == null) continue;
    bull[i] = highs[i]! - e;
    bear[i] = lows[i]! - e;
    power[i] = bull[i]! + bear[i]!;
  }
  return { power, bull, bear, ema };
}

export function ultimateOscillatorSeries(
  closes: number[],
  highs: number[],
  lows: number[],
  short = 7,
  medium = 14,
  long = 28,
): Array<number | null> {
  const n = closes.length;
  const buyingPressure = nulls(n);
  const trueRange = nulls(n);
  for (let i = 1; i < n; i++) {
    const prevClose = closes[i - 1]!;
    const trueLow = Math.min(lows[i]!, prevClose);
    const trueHigh = Math.max(highs[i]!, prevClose);
    buyingPressure[i] = closes[i]! - trueLow;
    trueRange[i] = trueHigh - trueLow;
  }

  const windowAverage = (end: number, period: number): number | null => {
    let bp = 0;
    let tr = 0;
    for (let j = end - period + 1; j <= end; j++) {
      if (j < 1) return null;
      const b = buyingPressure[j];
      const t = trueRange[j];
      if (b == null || t == null) return null;
      bp += b;
      tr += t;
    }
    return tr === 0 ? null : bp / tr;
  };

  const out = nulls(n);
  for (let i = long; i < n; i++) {
    const a1 = windowAverage(i, short);
    const a2 = windowAverage(i, medium);
    const a3 = windowAverage(i, long);
    if (a1 == null || a2 == null || a3 == null) continue;
    out[i] = (100 * (4 * a1 + 2 * a2 + a3)) / 7;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Moving averages
// ---------------------------------------------------------------------------

export function vwmaSeries(closes: number[], volumes: number[], period = 20): Array<number | null> {
  const out = nulls(closes.length);
  for (let i = period - 1; i < closes.length; i++) {
    let pv = 0;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) {
      pv += closes[j]! * volumes[j]!;
      v += volumes[j]!;
    }
    // Without volume this would silently degrade to an unweighted average.
    if (v > 0) out[i] = pv / v;
  }
  return out;
}

export function hullMaSeries(closes: number[], period = 9): Array<number | null> {
  const half = Math.max(1, Math.round(period / 2));
  const sqrt = Math.max(1, Math.round(Math.sqrt(period)));
  const wmaHalf = wmaSeriesOf(closes, half);
  const wmaFull = wmaSeriesOf(closes, period);
  const raw = wmaHalf.map((h, i) => {
    const f = wmaFull[i];
    return h == null || f == null ? null : 2 * h - f;
  });
  return wmaSeriesOf(raw, sqrt);
}

export function ichimokuSeries(
  highs: number[],
  lows: number[],
  conversionPeriod = 9,
  basePeriod = 26,
  spanPeriod = 52,
): {
  conversion: Array<number | null>;
  base: Array<number | null>;
  leadingSpanA: Array<number | null>;
  leadingSpanB: Array<number | null>;
} {
  const midpoint = (period: number): Array<number | null> => {
    const hh = rollingExtreme(highs, period, "max");
    const ll = rollingExtreme(lows, period, "min");
    return hh.map((h, i) => {
      const l = ll[i];
      return h == null || l == null ? null : (h + l) / 2;
    });
  };
  const conversion = midpoint(conversionPeriod);
  const base = midpoint(basePeriod);
  const leadingSpanA = conversion.map((c, i) => {
    const b = base[i];
    return c == null || b == null ? null : (c + b) / 2;
  });
  return { conversion, base, leadingSpanA, leadingSpanB: midpoint(spanPeriod) };
}

// ---------------------------------------------------------------------------
// Series catalogue
// ---------------------------------------------------------------------------

export const MA_PERIODS = [10, 20, 30, 50, 100, 200] as const;

/**
 * All indicator series for a symbol, in the order they are displayed.
 * The Ichimoku cloud spans are kept unshifted here; the rating rule reads them at
 * the displacement offset, which is where the plotted cloud comes from.
 */
export function computeIndicatorSeries(bars: IndicatorBar[]): IndicatorSeries[] {
  const closes = closesOf(bars);
  const highs = highsOf(bars);
  const lows = lowsOf(bars);
  const volumes = volumesOf(bars);

  const stoch = stochasticSeries(closes, highs, lows, 14, 3, 3);
  const adx = adxSeries(closes, highs, lows, 14);
  const macd = macdSeries(closes, 12, 26, 9);
  const stochRsi = stochasticRsiSeries(closes, 14, 14, 3, 3);
  const bbp = bullBearPowerSeries(closes, highs, lows, 13);
  const ichimoku = ichimokuSeries(highs, lows, 9, 26, 52);

  const oscillators: IndicatorSeries[] = [
    {
      id: "rsi_14",
      name: "Relative Strength Index (14)",
      group: "oscillator",
      values: rsiSeries(closes, 14),
      lines: [],
      levels: [
        { value: 70, label: "Overbought", kind: "threshold" },
        { value: 30, label: "Oversold", kind: "threshold" },
      ],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "stoch_k",
      name: "Stochastic %K (14, 3, 3)",
      group: "oscillator",
      values: stoch.k,
      lines: [{ id: "stoch_d", name: "%D", values: stoch.d, color: LINE_SECONDARY }],
      levels: [
        { value: 80, label: "Overbought", kind: "threshold" },
        { value: 20, label: "Oversold", kind: "threshold" },
      ],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "cci_20",
      name: "Commodity Channel Index (20)",
      group: "oscillator",
      values: cciSeries(closes, highs, lows, 20),
      lines: [],
      levels: [
        { value: 100, label: "Overbought", kind: "threshold" },
        { value: -100, label: "Oversold", kind: "threshold" },
      ],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "adx_14",
      name: "Average Directional Index (14)",
      group: "oscillator",
      values: adx.adx,
      lines: [
        { id: "di_plus", name: "+DI", values: adx.plusDi, color: "#22c55e" },
        { id: "di_minus", name: "−DI", values: adx.minusDi, color: "#ef4444" },
      ],
      levels: [{ value: 20, label: "Defined trend", kind: "threshold" }],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "awesome",
      name: "Awesome Oscillator",
      group: "oscillator",
      values: awesomeOscillatorSeries(highs, lows, 5, 34),
      lines: [],
      levels: [{ value: 0, kind: "zero" }],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "momentum_10",
      name: "Momentum (10)",
      group: "oscillator",
      values: momentumSeries(closes, 10),
      lines: [],
      levels: [{ value: 0, kind: "zero" }],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "macd",
      name: "MACD (12, 26)",
      group: "oscillator",
      values: macd.macd,
      lines: [{ id: "macd_signal", name: "Signal (9)", values: macd.signal, color: LINE_SECONDARY }],
      levels: [{ value: 0, kind: "zero" }],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "stoch_rsi",
      name: "Stochastic RSI Fast (3, 3, 14, 14)",
      group: "oscillator",
      values: stochRsi.k,
      lines: [{ id: "stoch_rsi_d", name: "%D", values: stochRsi.d, color: LINE_SECONDARY }],
      levels: [
        { value: 80, label: "Overbought", kind: "threshold" },
        { value: 20, label: "Oversold", kind: "threshold" },
      ],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "williams_r",
      name: "Williams Percent Range (14)",
      group: "oscillator",
      values: williamsRSeries(closes, highs, lows, 14),
      lines: [],
      levels: [
        { value: -20, label: "Overbought", kind: "threshold" },
        { value: -80, label: "Oversold", kind: "threshold" },
      ],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "bull_bear_power",
      name: "Bull Bear Power",
      group: "oscillator",
      values: bbp.power,
      lines: [
        { id: "bull_power", name: "Bull Power", values: bbp.bull, color: "#22c55e" },
        { id: "bear_power", name: "Bear Power", values: bbp.bear, color: "#ef4444" },
      ],
      levels: [{ value: 0, kind: "zero" }],
      pane: "separate",
      decimals: 2,
    },
    {
      id: "ultimate",
      name: "Ultimate Oscillator (7, 14, 28)",
      group: "oscillator",
      values: ultimateOscillatorSeries(closes, highs, lows, 7, 14, 28),
      lines: [],
      levels: [
        { value: 70, label: "Overbought", kind: "threshold" },
        { value: 30, label: "Oversold", kind: "threshold" },
      ],
      pane: "separate",
      decimals: 2,
    },
  ];

  const movingAverages: IndicatorSeries[] = [];
  for (const period of MA_PERIODS) {
    movingAverages.push({
      id: `ema_${period}`,
      name: `Exponential Moving Average (${period})`,
      group: "moving_average",
      values: emaSeriesOf(closes, period),
      lines: [],
      levels: [],
      pane: "price",
      decimals: 2,
    });
    movingAverages.push({
      id: `sma_${period}`,
      name: `Simple Moving Average (${period})`,
      group: "moving_average",
      values: smaSeriesOf(closes, period),
      lines: [],
      levels: [],
      pane: "price",
      decimals: 2,
    });
  }

  movingAverages.push({
    id: "ichimoku_base",
    name: "Ichimoku Base Line (9, 26, 52, 26)",
    group: "moving_average",
    values: ichimoku.base,
    lines: [
      {
        id: "ichimoku_conversion",
        name: "Conversion Line",
        values: ichimoku.conversion,
        color: LINE_TERTIARY,
      },
    ],
    levels: [],
    pane: "price",
    decimals: 2,
  });
  movingAverages.push({
    id: "vwma_20",
    name: "Volume Weighted Moving Average (20)",
    group: "moving_average",
    values: vwmaSeries(closes, volumes, 20),
    lines: [],
    levels: [],
    pane: "price",
    decimals: 2,
  });
  movingAverages.push({
    id: "hull_ma_9",
    name: "Hull Moving Average (9)",
    group: "moving_average",
    values: hullMaSeries(closes, 9),
    lines: [],
    levels: [],
    pane: "price",
    decimals: 2,
  });

  return [...oscillators, ...movingAverages];
}

export function indicatorPrimaryColor(): string {
  return LINE_PRIMARY;
}

/** Ichimoku spans are plotted `displacement` bars ahead of the bar that produced them. */
export const ICHIMOKU_DISPLACEMENT = 26;

export function ichimokuCloudAt(
  bars: IndicatorBar[],
  index: number,
): { spanA: number | null; spanB: number | null } {
  const highs = highsOf(bars);
  const lows = lowsOf(bars);
  const { leadingSpanA, leadingSpanB } = ichimokuSeries(highs, lows, 9, 26, 52);
  const source = index - ICHIMOKU_DISPLACEMENT;
  if (source < 0) return { spanA: null, spanB: null };
  return { spanA: leadingSpanA[source] ?? null, spanB: leadingSpanB[source] ?? null };
}
