import type { MotorIndicatorSnapshot } from "./snapshot-types";
import decisionMapJson from "../../motor/config/class_decision_map.json";

export type DecisionQuestionId =
  | "timing"
  | "role"
  | "projection"
  | "investability"
  | "forecast";

export type QuestionAnswerRow = {
  questionId: DecisionQuestionId;
  label: string;
  description: string;
  indicators: Array<{
    id: string;
    name: string;
    value: number | null;
    contribution?: number | null;
    isProxy?: boolean;
    proxyRationale?: string;
    status: "ok" | "missing" | "proxy";
  }>;
  coveragePct: number;
};

export type ClassDataEquation = {
  classId: string;
  role: string;
  questions: QuestionAnswerRow[];
  overallCoveragePct: number;
};

function findIndicator(
  id: string,
  pool: MotorIndicatorSnapshot[],
): MotorIndicatorSnapshot | undefined {
  return pool.find((i) => i.id === id);
}

export function buildClassDataEquation(
  classId: string,
  classIndicators: MotorIndicatorSnapshot[],
  tickerIndicators: MotorIndicatorSnapshot[],
): ClassDataEquation {
  const classDef = decisionMapJson.classes[
    classId as keyof typeof decisionMapJson.classes
  ];
  const tickerDef = decisionMapJson.tickerTechnicals;

  const role = classDef?.role ?? tickerDef?.role ?? "Asset class context";
  const questions: QuestionAnswerRow[] = [];

  const questionIds = Object.keys(decisionMapJson.questions) as DecisionQuestionId[];

  for (const qId of questionIds) {
    const qMeta = decisionMapJson.questions[qId];
    const classIds = (classDef?.indicators?.[qId] as string[] | undefined) ?? [];
    const tickerIds =
      (tickerDef?.indicators?.[qId] as string[] | undefined) ?? [];
    const ids = [...classIds, ...tickerIds];

    const indicators = ids.map((id) => {
      const ind =
        findIndicator(id, classIndicators) ?? findIndicator(id, tickerIndicators);
      if (!ind) {
        return {
          id,
          name: id,
          value: null,
          status: "missing" as const,
        };
      }
      const status: "ok" | "missing" | "proxy" = ind.isProxy
        ? "proxy"
        : ind.value != null
          ? "ok"
          : "missing";
      return {
        id: ind.id,
        name: ind.name,
        value: ind.value,
        contribution: ind.contribution,
        isProxy: ind.isProxy,
        proxyRationale: ind.proxyRationale,
        status,
      };
    });

    const ok = indicators.filter((i) => i.status === "ok" || i.status === "proxy").length;
    const coveragePct = ids.length > 0 ? Math.round((ok / ids.length) * 100) : 0;

    questions.push({
      questionId: qId,
      label: qMeta.label,
      description: qMeta.description,
      indicators,
      coveragePct,
    });
  }

  const overallOk = questions.reduce((a, q) => a + q.coveragePct, 0);
  const overallCoveragePct =
    questions.length > 0 ? Math.round(overallOk / questions.length) : 0;

  return {
    classId,
    role,
    questions,
    overallCoveragePct,
  };
}
