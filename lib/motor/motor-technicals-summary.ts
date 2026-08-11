import type { IndicatorAction } from "@/lib/motor/format-scores";
import { countIndicatorActions } from "@/lib/motor/format-scores";
import { countTaActions } from "@/lib/market/technical-summary";
import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";
import type {
  MotorIndicatorSnapshot,
  SymbolMotorContext,
} from "@/lib/motor/snapshot-types";

export type ConvergenceSignal = "positive" | "negative";

export function scoreToSignal(score: number | null | undefined): IndicatorAction {
  if (score == null || !Number.isFinite(score)) return "Neutral";
  if (score > 0.1) return "Buy";
  if (score < -0.1) return "Sell";
  return "Neutral";
}

export function scoreToConvergence(score: number | null | undefined): ConvergenceSignal {
  if (score == null || !Number.isFinite(score)) return "negative";
  return score >= 0 ? "positive" : "negative";
}

export function technicalConvergenceSignal(rows: TechnicalIndicatorRow[]): ConvergenceSignal {
  if (rows.length === 0) return "negative";
  const { buy, sell } = countTaActions(rows);
  if (buy > sell) return "positive";
  if (sell > buy) return "negative";
  return "negative";
}

export function buildConvergenceSummary(
  motorSignal: ConvergenceSignal,
  technicalSignal: ConvergenceSignal,
  entryValidated: boolean,
): string {
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
    motor: scoreToSignal(motor.score),
    motorCounts: countIndicatorActions(pool),
  };
}

export function macroLayerSignal(motor: SymbolMotorContext): IndicatorAction {
  const classScore = motor.classScore;
  const regimeAction = motor.classSnap?.regimeModel?.action;
  if (regimeAction) {
    const a = regimeAction.toLowerCase();
    if (a.includes("buy") || a.includes("accum")) return "Buy";
    if (a.includes("sell") || a.includes("reduce")) return "Sell";
  }
  return scoreToSignal(classScore);
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
