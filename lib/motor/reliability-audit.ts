import type {
  MotorDashboardSnapshot,
  MotorIndicatorSnapshot,
  SymbolMotorContext,
} from "./snapshot-types";
import type { YahooQuoteSummary } from "@/lib/market/yahoo-quote";
import decisionMapJson from "../../motor/config/class_decision_map.json";

export const DECISION_TARGET_SCORE = decisionMapJson.decisionTargetScore ?? 8;

export type ReliabilityFactor = {
  id: string;
  label: string;
  score: number;
  max: number;
  note: string;
};

export type DecisionReliabilityAudit = {
  score: number;
  meetsTarget: boolean;
  target: number;
  grade: "strong" | "adequate" | "weak" | "insufficient";
  factors: ReliabilityFactor[];
  summary: string;
};

function clamp(n: number, lo = 0, hi = 10): number {
  return Math.min(hi, Math.max(lo, n));
}

function indicatorCoverage(indicators: MotorIndicatorSnapshot[]): {
  total: number;
  withValue: number;
  proxyCount: number;
} {
  let withValue = 0;
  let proxyCount = 0;
  for (const ind of indicators) {
    if (ind.value != null && Number.isFinite(ind.value)) withValue += 1;
    if (ind.isProxy) proxyCount += 1;
  }
  return { total: indicators.length, withValue, proxyCount };
}

function gradeFromScore(score: number): DecisionReliabilityAudit["grade"] {
  if (score >= 8) return "strong";
  if (score >= 6) return "adequate";
  if (score >= 4) return "weak";
  return "insufficient";
}

export function computeDecisionReliability(input: {
  motor: SymbolMotorContext;
  snapshot: MotorDashboardSnapshot | null;
  quote: YahooQuoteSummary;
  classId: string;
  yahooWarning?: string;
}): DecisionReliabilityAudit {
  const factors: ReliabilityFactor[] = [];
  const { motor, snapshot, quote, classId, yahooWarning } = input;

  const classInds =
    motor.classSnap?.allIndicators ?? motor.classSnap?.indicators ?? [];
  const tickerInds =
    motor.ticker?.allIndicators ?? motor.ticker?.indicators ?? [];
  const classCov = indicatorCoverage(classInds);
  const tickerCov = indicatorCoverage(tickerInds);

  // Sleeve macro present (0–2)
  let sleevePts = 0;
  if (motor.hasClassMotor) sleevePts += 1;
  if (classCov.total >= 5 && classCov.withValue >= Math.ceil(classCov.total * 0.7)) {
    sleevePts += 1;
  }
  factors.push({
    id: "sleeve_macro",
    label: "Sleeve macro (class score + indicators)",
    score: sleevePts,
    max: 2,
    note: motor.hasClassMotor
      ? `${classCov.withValue}/${classCov.total} class indicators with values`
      : "No class macro in snapshot",
  });

  // Security motor (0–2)
  let securityPts = 0;
  if (motor.hasTickerMotor) securityPts += 1;
  if (tickerCov.total >= 4 && tickerCov.withValue >= 4) securityPts += 1;
  factors.push({
    id: "security_motor",
    label: "Security motor (ticker technicals)",
    score: securityPts,
    max: 2,
    note: motor.hasTickerMotor
      ? `${tickerCov.withValue}/${tickerCov.total} ticker indicators`
      : "Using class fallback only",
  });

  // Data directness — proxy penalty (0–2)
  const allInds = [...classInds, ...tickerInds];
  const allCov = indicatorCoverage(allInds);
  const proxyRatio =
    allCov.total > 0 ? allCov.proxyCount / allCov.total : 0;
  let directPts = 2;
  if (proxyRatio > 0.5) directPts = 0;
  else if (proxyRatio > 0.25) directPts = 1;
  factors.push({
    id: "directness",
    label: "Direct data (low proxy share)",
    score: directPts,
    max: 2,
    note: `${allCov.proxyCount} proxies of ${allCov.total} indicators (${Math.round(proxyRatio * 100)}%)`,
  });

  // Freshness (0–2)
  let freshPts = 2;
  if (snapshot?.quality?.stale) freshPts = 0;
  else if (snapshot?.quality?.issues?.length) freshPts = 1;
  factors.push({
    id: "freshness",
    label: "Snapshot freshness",
    score: freshPts,
    max: 2,
    note: snapshot?.asOf
      ? `As of ${snapshot.asOf}${snapshot.quality?.stale ? " (stale)" : ""}`
      : "No snapshot date",
  });

  // Models overlay (0–1)
  const regime = snapshot?.models?.regime;
  let modelPts = 0;
  if (regime) {
    modelPts = regime.calibrated ? 1 : 0.5;
  }
  factors.push({
    id: "models",
    label: "Regime / vol models",
    score: modelPts,
    max: 1,
    note: regime
      ? regime.calibrated
        ? "Regime logit calibrated"
        : "Regime present but not calibrated"
      : "Models block missing",
  });

  // Market enrich (0–1)
  let marketPts = 0;
  if (quote.price != null && !quote.error) marketPts += 0.5;
  if (!yahooWarning) marketPts += 0.5;
  factors.push({
    id: "market_enrich",
    label: "Live price / Yahoo enrich",
    score: marketPts,
    max: 1,
    note: quote.error
      ? `Yahoo: ${quote.error}`
      : yahooWarning
        ? yahooWarning.slice(0, 80)
        : "Price + quote OK",
  });

  // Decision map coverage for class (0–1)
  const classDef = decisionMapJson.classes[classId as keyof typeof decisionMapJson.classes];
  let mapPts = 0;
  if (classDef) {
    const mappedIds = new Set<string>();
    for (const ids of Object.values(classDef.indicators)) {
      for (const id of ids as string[]) mappedIds.add(id);
    }
    const present = [...mappedIds].filter((id) =>
      classInds.some((i) => i.id === id && i.value != null),
    );
    mapPts = mappedIds.size > 0 ? present.length / mappedIds.size : 0;
  }
  factors.push({
    id: "decision_map",
    label: "Class decision map coverage",
    score: Math.round(mapPts * 10) / 10,
    max: 1,
    note: classDef
      ? "Mapped free indicators answering timing/role/forecast"
      : "No decision map for class",
  });

  const rawSum = factors.reduce((a, f) => a + f.score, 0);
  const maxSum = factors.reduce((a, f) => a + f.max, 0);
  const score = clamp(Math.round((rawSum / maxSum) * 10 * 10) / 10);

  const meetsTarget = score >= DECISION_TARGET_SCORE;
  const grade = gradeFromScore(score);

  let summary: string;
  if (meetsTarget) {
    summary =
      "Free data stack is sufficient for sleeve-aware decisions — motor macro + security signals aligned.";
  } else if (grade === "adequate") {
    summary =
      "Usable but incomplete — review proxies, missing sleeve indicators, or stale snapshot before sizing.";
  } else {
    summary =
      "Weak for decision-making — rely on motor reports or wait for Motor Daily; do not treat click as full analysis.";
  }

  return {
    score,
    meetsTarget,
    target: DECISION_TARGET_SCORE,
    grade,
    factors,
    summary,
  };
}
