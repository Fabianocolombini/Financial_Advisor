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
    return "Motor e técnica neutros — nenhum dos dois lados pede ação agora.";
  }
  if (technicalSignal === "neutral") {
    return motorSignal === "positive"
      ? "O motor está positivo e a técnica está neutra — sem gatilho de preço, entradas podem ser graduais."
      : motorSignal === "negative"
        ? "O motor está negativo e a técnica está neutra — o preço ainda não confirma fraqueza, mas o contexto pede cautela."
        : "Leitura neutra dos dois lados.";
  }
  if (motorSignal === "neutral") {
    return technicalSignal === "positive"
      ? "A técnica melhora enquanto o motor permanece neutro — movimento de preço sem suporte quantitativo."
      : "A técnica piora enquanto o motor permanece neutro — atenção a deterioração de preço.";
  }
  if (motorSignal === "negative" && technicalSignal === "negative") {
    return "O motor está negativo e a técnica confirma fraqueza — priorize redução de risco.";
  }
  if (motorSignal === "positive" && technicalSignal === "positive") {
    return entryValidated
      ? "Motor e técnica alinhados positivamente com entrada validada."
      : "Sinais positivos, mas aguarde validação de entrada antes de aumentar exposição.";
  }
  if (motorSignal === "positive" && technicalSignal === "negative") {
    return "O motor está positivo, mas a técnica ainda não confirma ponto de entrada.";
  }
  return "Técnica melhora enquanto o motor permanece negativo — possível repique com cautela.";
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
    rsi_14: "stochastic_rsi",
    stoch_k: "stochastic_fast",
    macd: "macd_level",
    sma_20: "moving_averages",
    sma_50: "moving_averages",
    sma_100: "moving_averages",
    sma_200: "moving_averages",
  };
  return map[id] ?? null;
}
