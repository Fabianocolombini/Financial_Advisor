import type { IndicatorAction } from "@/lib/motor/format-scores";
import { countIndicatorActions } from "@/lib/motor/format-scores";
import { countTaActions } from "@/lib/market/technical-summary";
import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";
import type {
  MotorIndicatorSnapshot,
  SymbolMotorContext,
} from "@/lib/motor/snapshot-types";
import { classScoreProfile } from "@/lib/motor/score-domain";

export type ConvergenceSignal = "positive" | "neutral" | "negative";

/**
 * Maps a motor score to a Buy/Neutral/Sell reading using the thresholds of the
 * class's own score domain. A cash rank of 0.4 is *below* its peer median, so it
 * must not read as "Buy" just because it is above zero.
 */
export function scoreToSignal(
  score: number | null | undefined,
  classId?: string | null,
): IndicatorAction {
  if (score == null || !Number.isFinite(score)) return "Neutral";
  const { domain, security } = classScoreProfile(classId);
  if (domain === "unit") {
    if (score >= security.strong) return "Buy";
    if (score < security.weak) return "Sell";
    return "Neutral";
  }
  if (score > 0.1) return "Buy";
  if (score < -0.1) return "Sell";
  return "Neutral";
}

export function scoreToConvergence(
  score: number | null | undefined,
  classId?: string | null,
): ConvergenceSignal {
  if (score == null || !Number.isFinite(score)) return "neutral";
  const signal = scoreToSignal(score, classId);
  if (signal === "Buy") return "positive";
  if (signal === "Sell") return "negative";
  return "neutral";
}

/**
 * A tie between buy and sell counts is genuinely neutral. Forcing it to negative
 * is what made flat-NAV instruments report "técnica negativa" without any
 * underlying weakness.
 */
export function technicalConvergenceSignal(
  rows: TechnicalIndicatorRow[],
): ConvergenceSignal {
  if (rows.length === 0) return "neutral";
  const { buy, sell } = countTaActions(rows);
  if (buy > sell) return "positive";
  if (sell > buy) return "negative";
  return "neutral";
}

export function buildConvergenceSummary(
  motorSignal: ConvergenceSignal,
  technicalSignal: ConvergenceSignal,
  entryValidated: boolean,
): string {
  if (motorSignal === "neutral" && technicalSignal === "neutral") {
    return "Motor and technicals are both neutral — neither side calls for action now.";
  }
  if (technicalSignal === "neutral") {
    return motorSignal === "positive"
      ? "The motor is positive and technicals are neutral — with no price trigger, entries can be gradual."
      : motorSignal === "negative"
        ? "The motor is negative and technicals are neutral — price has not confirmed weakness yet, but the backdrop calls for caution."
        : "Neutral reading on both sides.";
  }
  if (motorSignal === "neutral") {
    return technicalSignal === "positive"
      ? "Technicals are improving while the motor stays neutral — a price move without quantitative support."
      : "Technicals are worsening while the motor stays neutral — watch for price deterioration.";
  }
  if (motorSignal === "negative" && technicalSignal === "negative") {
    return "The motor is negative and technicals confirm weakness — prioritize reducing risk.";
  }
  if (motorSignal === "positive" && technicalSignal === "positive") {
    return entryValidated
      ? "Motor and technicals aligned positively with validated entry."
      : "Positive signals, but wait for entry validation before increasing exposure.";
  }
  if (motorSignal === "positive" && technicalSignal === "negative") {
    return "The motor is positive, but technicals have not confirmed an entry point yet.";
  }
  return "Technicals are improving while the motor stays negative — a possible bounce, with caution.";
}

export function motorLayerCounts(motor: SymbolMotorContext): {
  motor: IndicatorAction;
  motorCounts: ReturnType<typeof countIndicatorActions>;
} {
  const pool = [...motor.tickerIndicators, ...motor.classIndicators];
  return {
    motor: scoreToSignal(motor.score, motor.classId),
    motorCounts: countIndicatorActions(pool),
  };
}

export function macroLayerSignal(motor: SymbolMotorContext): IndicatorAction {
  const classScore = motor.classScore;
  const regimeAction = motor.classSnap?.regimeModel?.action;
  if (regimeAction) {
    const a = regimeAction.toLowerCase();
    if (a.includes("buy") || a.includes("accum") || a.includes("overweight")) return "Buy";
    if (a.includes("sell") || a.includes("reduce")) return "Sell";
    if (a.includes("hold")) return "Neutral";
  }
  return scoreToSignal(classScore, motor.classId);
}

export function macroIndicators(
  classIndicators: MotorIndicatorSnapshot[],
): MotorIndicatorSnapshot[] {
  const macroIds = /spread|yield|fred|regime|curve|oas|term.?premium|cpi|inflation|credit/i;
  return classIndicators.filter(
    (i) => macroIds.test(i.id) || macroIds.test(i.name),
  );
}

export function detectMaCross(rows: TechnicalIndicatorRow[]): "golden" | "death" | null {
  const sma50 = rows.find((r) => r.id === "sma_50")?.value;
  const sma200 = rows.find((r) => r.id === "sma_200")?.value;
  if (sma50 == null || sma200 == null) return null;
  if (sma50 > sma200) return "golden";
  if (sma50 < sma200) return "death";
  return null;
}

export function glossaryTermForIndicator(id: string): string | null {
  const map: Record<string, string> = {
    rsi_14: "rsi",
    stoch_k: "stochastic_fast",
    cci_20: "cci",
    adx_14: "adx",
    awesome: "awesome_oscillator",
    momentum_10: "momentum",
    macd: "macd_level",
    stoch_rsi: "stochastic_rsi",
    williams_r: "williams_r",
    bull_bear_power: "bull_bear_power",
    ultimate: "ultimate_oscillator",
    ichimoku_base: "ichimoku",
    vwma_20: "vwma",
    hull_ma_9: "hull_ma",
  };
  if (map[id]) return map[id]!;
  if (id.startsWith("sma_") || id.startsWith("ema_")) return "moving_averages";
  return null;
}
