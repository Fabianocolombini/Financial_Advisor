/**
 * Multi-horizon price forecast.
 *
 * The output is a *range* with an empirically measured hit rate, not a point
 * target. A single number would be indefensible with the data available, so the
 * model reports a central scenario, 68% and 95% bands, the technical levels that
 * bound them, and the walk-forward coverage those bands actually achieved.
 *
 * Class-aware: for cash-like instruments the NAV is stable by construction, so
 * the drift comes from realized carry and momentum/Fibonacci inputs are dropped.
 */

import {
  atr,
  bollingerPosition,
  dailyReturns,
  ewmaVol,
  fibonacciLevels,
  realizedVol,
  supportResistance,
  trendState,
  type FibonacciLevel,
  type StructureBar,
} from "./price-structure";
import { classScoreProfile } from "@/lib/motor/score-domain";
import type { MotorIndicatorSnapshot } from "@/lib/motor/snapshot-types";

export type ForecastHorizonId = "5d" | "20d" | "60d";

export const FORECAST_HORIZONS: Array<{
  id: ForecastHorizonId;
  days: number;
  label: string;
}> = [
  { id: "5d", days: 5, label: "5 days" },
  { id: "20d", days: 20, label: "20 days (~1 month)" },
  { id: "60d", days: 60, label: "60 days (~3 months)" },
];

export type ForecastScenario = {
  horizon: ForecastHorizonId;
  horizonDays: number;
  label: string;
  central: number;
  low68: number;
  high68: number;
  low95: number;
  high95: number;
  centralChangePct: number;
  /** P(preço final > preço atual) sob a distribuição usada. */
  probabilityUp: number;
  /** Cobertura empírica da faixa 68% em teste walk-forward. */
  coverage68: number | null;
  coverage95: number | null;
  coverageSamples: number;
};

export type ForecastLevels = {
  supports: number[];
  resistances: number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
  fibonacci: FibonacciLevel[];
  bollingerUpper: number | null;
  bollingerMid: number | null;
  bollingerLower: number | null;
  /** Projeção da largura atual da banda em torno da média móvel. */
  projectedUpper: number | null;
  projectedLower: number | null;
  atr: number | null;
  /** Nível cujo rompimento invalida a leitura direcional. */
  invalidation: number | null;
  invalidationNote: string | null;
};

export type ForecastDriver = {
  id: string;
  label: string;
  value: string;
  effect: "widens" | "narrows" | "pushes up" | "pushes down" | "neutral";
};

export type PriceForecast = {
  asOf: string | null;
  symbol: string;
  classId: string;
  methodology: "statistical_envelope" | "cash_stability";
  methodologyLabel: string;
  current: number | null;
  /** Volatilidade diária usada na projeção. */
  dailyVol: number | null;
  annualizedVolPct: number | null;
  dailyDrift: number;
  driftSource: string;
  usedAdjustedSeries: boolean;
  scenarios: ForecastScenario[];
  levels: ForecastLevels;
  drivers: ForecastDriver[];
  confidence: number | null;
  dataSufficiency: "ok" | "thin" | "insufficient";
  explanations: string[];
  disclaimer: string;
};

const DISCLAIMER =
  "Educational statistical projection from volatility and price structure. Ranges, not forecasts — price can leave them.";

/** Normal CDF via Abramowitz-Stegun erf approximation. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Signal series: prefers adjusted closes so that distributions are not read as
 * price drops. Rescaled so the last point equals the last raw close, keeping all
 * projected levels on the quoted price scale.
 */
function signalSeries(bars: StructureBar[], adjusted: Array<number | undefined>): {
  values: number[];
  usedAdjusted: boolean;
} {
  const hasAdjusted =
    adjusted.length === bars.length && adjusted.every((v) => v != null && Number.isFinite(v));
  if (!hasAdjusted) {
    return { values: bars.map((b) => b.value), usedAdjusted: false };
  }
  const adj = adjusted as number[];
  const lastAdj = adj[adj.length - 1]!;
  const lastClose = bars[bars.length - 1]!.value;
  const scale = lastAdj !== 0 ? lastClose / lastAdj : 1;
  return { values: adj.map((v) => v * scale), usedAdjusted: true };
}

/** EWMA daily vol at every index, computed only from prior data (no look-ahead). */
function ewmaVolSeries(returns: number[], lambda = 0.94, seed = 20): Array<number | null> {
  const out: Array<number | null> = new Array(returns.length).fill(null);
  if (returns.length < seed) return out;
  let variance = returns.slice(0, seed).reduce((a, r) => a + r * r, 0) / seed;
  out[seed - 1] = Math.sqrt(variance);
  for (let i = seed; i < returns.length; i++) {
    variance = lambda * variance + (1 - lambda) * returns[i]! ** 2;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export type ForecastCalibration = {
  /** Multipliers applied to the raw σ·√H half-width for the 68% and 95% bands. */
  scale68: number;
  scale95: number;
  /** Coverage measured on the holdout, after calibration. */
  coverage68: number | null;
  coverage95: number | null;
  samples: number;
  holdoutSamples: number;
};

const MIN_CALIBRATION_SAMPLES = 60;
const CALIBRATION_TRAIN_FRACTION = 0.7;

/**
 * Walk-forward calibration.
 *
 * At each historical point we rebuild the forecast using only data available
 * then, and record how far the realized price landed from the central estimate
 * in units of the raw σ·√H half-width. The 68th/95th percentiles of those errors
 * become the band multipliers, which corrects the fact that a plain random walk
 * misses drift uncertainty (badly for cash, where diffusion is tiny but the carry
 * rate moves) and fat tails (for equities).
 *
 * Multipliers are fitted on the earlier 70% of samples and coverage is reported
 * on the remaining 30%, so the displayed number is out-of-sample.
 */
function walkForwardCalibration(
  values: number[],
  returns: number[],
  volSeries: Array<number | null>,
  horizonDays: number,
  driftWindow: number,
): ForecastCalibration {
  const errors: number[] = [];

  // returns[i] is the return into values[i + 1]
  for (let i = driftWindow; i < returns.length - horizonDays; i++) {
    const vol = volSeries[i];
    if (vol == null || vol <= 0) continue;
    const priceIndex = i + 1;
    const price = values[priceIndex];
    const future = values[priceIndex + horizonDays];
    if (price == null || future == null || price <= 0) continue;

    const driftSlice = returns.slice(i - driftWindow + 1, i + 1);
    const drift = median(driftSlice) ?? 0;
    const central = price * (1 + drift * horizonDays);
    const half = vol * Math.sqrt(horizonDays);
    if (half <= 0) continue;

    errors.push(Math.abs(future / central - 1) / half);
  }

  const fallback: ForecastCalibration = {
    scale68: 1,
    scale95: 1.96,
    coverage68: null,
    coverage95: null,
    samples: errors.length,
    holdoutSamples: 0,
  };
  if (errors.length < MIN_CALIBRATION_SAMPLES) return fallback;

  const splitAt = Math.floor(errors.length * CALIBRATION_TRAIN_FRACTION);
  const train = errors.slice(0, splitAt).sort((a, b) => a - b);
  const holdout = errors.slice(splitAt);
  const scale68 = quantile(train, 0.68);
  const scale95 = quantile(train, 0.95);
  if (scale68 == null || scale95 == null || scale68 <= 0) return fallback;

  return {
    scale68,
    scale95: Math.max(scale95, scale68),
    coverage68: holdout.filter((e) => e <= scale68).length / holdout.length,
    coverage95: holdout.filter((e) => e <= scale95).length / holdout.length,
    samples: errors.length,
    holdoutSamples: holdout.length,
  };
}

function motorBias(input: {
  motorScore: number | null;
  classId: string;
  trendDirection: string;
}): { bias: number; source: string } {
  const profile = classScoreProfile(input.classId);
  const parts: number[] = [];
  const sources: string[] = [];

  if (input.motorScore != null && Number.isFinite(input.motorScore)) {
    if (profile.domain === "unit") {
      // Rank 0.5 is neutral; map [0,1] to [-1,1] but keep the pull modest since a
      // peer ranking is not a directional forecast.
      parts.push((input.motorScore - 0.5) * 2 * 0.5);
      sources.push("motor ranking vs peers");
    } else {
      parts.push(Math.max(-1, Math.min(1, input.motorScore)));
      sources.push("motor directional score");
    }
  }

  if (input.trendDirection === "up") {
    parts.push(0.5);
    sources.push("uptrend");
  } else if (input.trendDirection === "down") {
    parts.push(-0.5);
    sources.push("downtrend");
  }

  if (parts.length === 0) return { bias: 0, source: "no directional bias" };
  const bias = parts.reduce((a, b) => a + b, 0) / parts.length;
  return {
    bias: Math.max(-1, Math.min(1, bias)),
    source: sources.join(" + "),
  };
}

function cashDrivers(classIndicators: MotorIndicatorSnapshot[]): ForecastDriver[] {
  const wanted: Array<{ id: string; label: string; up: ForecastDriver["effect"] }> = [
    { id: "yield_real_caixa", label: "Cash real yield", up: "pushes up" },
    { id: "spread_10y_2y", label: "10y-2y spread", up: "neutral" },
    { id: "fed_cut_probability", label: "Fed cut probability (6m)", up: "pushes down" },
  ];
  const drivers: ForecastDriver[] = [];
  for (const w of wanted) {
    const ind = classIndicators.find((i) => i.id === w.id);
    if (!ind || ind.value == null) continue;
    drivers.push({
      id: w.id,
      label: w.label,
      value: ind.value.toFixed(3),
      effect: w.up,
    });
  }
  return drivers;
}

export function buildPriceForecast(input: {
  symbol: string;
  classId: string;
  bars: StructureBar[];
  adjustedCloses?: Array<number | undefined>;
  motorScore: number | null;
  classIndicators?: MotorIndicatorSnapshot[];
  reliabilityScore?: number | null;
}): PriceForecast {
  const { symbol, classId, bars, motorScore } = input;
  const profile = classScoreProfile(classId);
  const stability = profile.stabilityFocused;

  const emptyLevels: ForecastLevels = {
    supports: [],
    resistances: [],
    nearestSupport: null,
    nearestResistance: null,
    fibonacci: [],
    bollingerUpper: null,
    bollingerMid: null,
    bollingerLower: null,
    projectedUpper: null,
    projectedLower: null,
    atr: null,
    invalidation: null,
    invalidationNote: null,
  };

  const base: PriceForecast = {
    asOf: bars.length ? bars[bars.length - 1]!.date : null,
    symbol,
    classId,
    methodology: stability ? "cash_stability" : "statistical_envelope",
    methodologyLabel: stability
      ? "NAV stability range + carry"
      : "Statistical volatility envelope with price structure",
    current: bars.length ? bars[bars.length - 1]!.value : null,
    dailyVol: null,
    annualizedVolPct: null,
    dailyDrift: 0,
    driftSource: "no data",
    usedAdjustedSeries: false,
    scenarios: [],
    levels: emptyLevels,
    drivers: [],
    confidence: null,
    dataSufficiency: "insufficient",
    explanations: [],
    disclaimer: DISCLAIMER,
  };

  if (bars.length < 60) {
    base.explanations.push(
      "Not enough history (fewer than 60 sessions) — no range is projected.",
    );
    return base;
  }

  const { values, usedAdjusted } = signalSeries(bars, input.adjustedCloses ?? []);
  const price = bars[bars.length - 1]!.value;
  const returns = dailyReturns(values);

  const volEwma = ewmaVol(values);
  const volRealized = realizedVol(values, 20);
  const dailyVol = volEwma ?? volRealized;

  if (dailyVol == null || dailyVol <= 0) {
    base.explanations.push("Could not estimate volatility from the series.");
    return base;
  }

  const trend = trendState(values);
  const bollinger = bollingerPosition(values);
  const levelsRaw = supportResistance(bars, price, 180);
  const atrValue = atr(bars, 14);

  const DRIFT_WINDOW = 60;
  const carryDrift = median(returns.slice(-DRIFT_WINDOW)) ?? 0;

  let dailyDrift: number;
  let driftSource: string;
  if (stability) {
    dailyDrift = carryDrift;
    driftSource = `realized carry (median of daily returns over ${DRIFT_WINDOW} sessions)`;
  } else {
    const { bias, source } = motorBias({
      motorScore,
      classId,
      trendDirection: trend.direction,
    });
    // Cap the directional pull at a quarter of a standard deviation per day: a
    // ranking and a moving average are not a return forecast.
    dailyDrift = bias * 0.25 * dailyVol;
    driftSource = `${(bias * 100).toFixed(0)}% bias applied to 0.25σ/day (${source})`;
  }

  const volSeries = ewmaVolSeries(returns);

  const scenarios: ForecastScenario[] = FORECAST_HORIZONS.map((h) => {
    const central = price * (1 + dailyDrift * h.days);
    const calibration = walkForwardCalibration(
      values,
      returns,
      volSeries,
      h.days,
      DRIFT_WINDOW,
    );
    const rawHalf = dailyVol * Math.sqrt(h.days);
    const band68 = rawHalf * calibration.scale68;
    const band95 = rawHalf * calibration.scale95;
    const z = band68 > 0 ? (central / price - 1) / band68 : 0;

    return {
      horizon: h.id,
      horizonDays: h.days,
      label: h.label,
      central,
      low68: central * (1 - band68),
      high68: central * (1 + band68),
      low95: central * (1 - band95),
      high95: central * (1 + band95),
      centralChangePct: (central / price - 1) * 100,
      probabilityUp: normalCdf(z),
      coverage68: calibration.coverage68,
      coverage95: calibration.coverage95,
      coverageSamples: calibration.holdoutSamples || calibration.samples,
    };
  });

  const fib = stability
    ? []
    : fibonacciLevels(
        levelsRaw.lastSwingLow?.price ?? null,
        levelsRaw.lastSwingHigh?.price ?? null,
      );

  const bandWidth =
    bollinger.upper != null && bollinger.lower != null && bollinger.mid
      ? (bollinger.upper - bollinger.lower) / bollinger.mid
      : null;

  const bullish = dailyDrift >= 0;
  const invalidation = bullish ? levelsRaw.nearestSupport : levelsRaw.nearestResistance;

  const levels: ForecastLevels = {
    supports: levelsRaw.supports,
    resistances: levelsRaw.resistances,
    nearestSupport: levelsRaw.nearestSupport,
    nearestResistance: levelsRaw.nearestResistance,
    fibonacci: fib,
    bollingerUpper: bollinger.upper,
    bollingerMid: bollinger.mid,
    bollingerLower: bollinger.lower,
    projectedUpper:
      bollinger.mid != null && bandWidth != null ? bollinger.mid * (1 + bandWidth / 2) : null,
    projectedLower:
      bollinger.mid != null && bandWidth != null ? bollinger.mid * (1 - bandWidth / 2) : null,
    atr: atrValue,
    invalidation,
    invalidationNote:
      invalidation == null
        ? null
        : bullish
          ? "Losing this support invalidates the projection's upside bias."
          : "Breaking this resistance invalidates the projection's downside bias.",
  };

  const drivers: ForecastDriver[] = [];
  drivers.push({
    id: "volatility",
    label: "Daily volatility (EWMA λ=0.94)",
    value: `${(dailyVol * 100).toFixed(2)}%`,
    effect: "widens",
  });
  if (bandWidth != null) {
    drivers.push({
      id: "bollinger_width",
      label: "Bollinger band width",
      value: `${(bandWidth * 100).toFixed(2)}%`,
      effect: bandWidth < 0.05 ? "narrows" : "widens",
    });
  }
  if (!stability) {
    drivers.push({
      id: "trend",
      label: "Trend (MA20 vs MA50)",
      value: trend.label,
      effect:
        trend.direction === "up"
          ? "pushes up"
          : trend.direction === "down"
            ? "pushes down"
            : "neutral",
    });
    if (atrValue != null) {
      drivers.push({
        id: "atr",
        label: "ATR(14)",
        value: atrValue.toFixed(2),
        effect: "widens",
      });
    }
  } else {
    drivers.push({
      id: "carry",
      label: "Realized daily carry",
      value: `${(carryDrift * 100).toFixed(3)}%`,
      effect: carryDrift >= 0 ? "pushes up" : "pushes down",
    });
    drivers.push(...cashDrivers(input.classIndicators ?? []));
  }

  const dataSufficiency: PriceForecast["dataSufficiency"] =
    bars.length >= 252 ? "ok" : "thin";

  const explanations: string[] = [];
  explanations.push(
    stability
      ? "Cash instrument: NAV is stable by construction, so the range measures residual swing and the center follows realized carry, not a price target."
      : "The range comes from recent volatility scaled by the square root of the horizon; the center includes a directional bias capped at 0.25σ per day.",
  );
  if (usedAdjusted) {
    explanations.push(
      "Calculations use the series adjusted for distributions and splits, so periodic payments are not read as a price drop.",
    );
  }
  if (dataSufficiency === "thin") {
    explanations.push(
      `Only ${bars.length} sessions available — calibration is less reliable than with 252 or more.`,
    );
  }
  const withCoverage = scenarios.filter((s) => s.coverage68 != null);
  if (withCoverage.length === 0) {
    explanations.push(
      "Not enough sample to calibrate the ranges in a walk-forward test — width uses the standard normal assumption and the intervals are indicative only.",
    );
  } else {
    explanations.push(
      "Range width is calibrated in a walk-forward test: on each historical date the projection is rebuilt using only data available up to then. The adjustment is estimated on the oldest 70% and the displayed coverage is measured on the following 30%, out of the calibration sample.",
    );
  }
  if (stability) {
    explanations.push(
      "Fibonacci and extension projection are not applied to cash: there is no relevant swing to anchor levels.",
    );
  }

  const confidence = forecastConfidence({
    reliabilityScore: input.reliabilityScore ?? null,
    barCount: bars.length,
    scenarios,
    bandWidth,
  });

  return {
    ...base,
    dailyVol,
    annualizedVolPct: dailyVol * Math.sqrt(252) * 100,
    dailyDrift,
    driftSource,
    usedAdjustedSeries: usedAdjusted,
    scenarios,
    levels,
    drivers,
    confidence,
    dataSufficiency,
    explanations,
  };
}

/**
 * 0–10 confidence in the *forecast*, distinct from data reliability: it rewards
 * bands whose measured coverage matched their nominal level.
 */
function forecastConfidence(input: {
  reliabilityScore: number | null;
  barCount: number;
  scenarios: ForecastScenario[];
  bandWidth: number | null;
}): number | null {
  const parts: Array<{ value: number; weight: number }> = [];

  if (input.reliabilityScore != null && Number.isFinite(input.reliabilityScore)) {
    parts.push({ value: input.reliabilityScore / 10, weight: 0.35 });
  }

  parts.push({
    value: Math.min(1, input.barCount / 252),
    weight: 0.2,
  });

  const coverages = input.scenarios
    .map((s) => s.coverage68)
    .filter((c): c is number => c != null);
  if (coverages.length > 0) {
    const avgError =
      coverages.reduce((a, c) => a + Math.abs(c - 0.68), 0) / coverages.length;
    parts.push({ value: Math.max(0, 1 - avgError / 0.2), weight: 0.35 });
  }

  if (input.bandWidth != null) {
    parts.push({ value: input.bandWidth < 0.1 ? 1 : 0.5, weight: 0.1 });
  }

  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight;
  return Math.round(score * 10 * 10) / 10;
}
