"use client";

import type { ConvergenceSignal } from "@/lib/motor/motor-technicals-summary";
import { InfoTooltip } from "./InfoTooltip";

export type { ConvergenceSignal };

type ConvergenceRow = {
  icon: string;
  reading: string;
  explanation: string;
};

const SIGNAL_LABELS: Record<ConvergenceSignal, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

const MATRIX: Record<string, ConvergenceRow> = {
  "positive|positive": {
    icon: "✅",
    reading: "Strong signal",
    explanation:
      "Motor and technicals aligned positively — a favorable backdrop to keep or increase exposure.",
  },
  "positive|neutral": {
    icon: "🟡",
    reading: "Motor positive with no price trigger",
    explanation:
      "The motor favors the name, but price is neither stretched nor discounted. There is no contradiction: there simply is no technical trigger now.",
  },
  "positive|negative": {
    icon: "⏳",
    reading: "Wait for confirmation",
    explanation:
      "The motor is positive, but technicals have not confirmed yet — wait for a better entry.",
  },
  "neutral|positive": {
    icon: "🟡",
    reading: "Price improving without motor support",
    explanation:
      "Technicals are improving while the motor stays neutral — a price move still without quantitative confirmation.",
  },
  "neutral|neutral": {
    icon: "⚪",
    reading: "No signal on either side",
    explanation:
      "Motor and technicals are both neutral. Neither side calls for action — neither buy nor sell.",
  },
  "neutral|negative": {
    icon: "🟠",
    reading: "Price deteriorating without a motor signal",
    explanation:
      "Technicals are worsening while the motor stays neutral — watch it, but it is not yet a reduce signal.",
  },
  "negative|positive": {
    icon: "⚠️",
    reading: "Possible rebound — caution",
    explanation:
      "Technicals are improving while the motor stays negative — a possible bounce, but with elevated risk.",
  },
  "negative|neutral": {
    icon: "🟠",
    reading: "Motor negative, price not confirming yet",
    explanation:
      "The motor is negative and price has not confirmed weakness yet. Avoid increasing exposure.",
  },
  "negative|negative": {
    icon: "🔻",
    reading: "Reduce / avoid",
    explanation:
      "Motor and technicals are both negative — prioritize reducing risk or avoid new entries.",
  },
};

function findRow(motor: ConvergenceSignal, technical: ConvergenceSignal): ConvergenceRow {
  return MATRIX[`${motor}|${technical}`] ?? MATRIX["neutral|neutral"]!;
}

export function signalFromScore(score: number | null | undefined): ConvergenceSignal {
  if (score == null || !Number.isFinite(score)) return "neutral";
  return score >= 0 ? "positive" : "negative";
}

export function ConvergenceCard({
  motorSignal,
  technicalSignal,
  motorCaption,
  technicalCaption,
}: {
  motorSignal: ConvergenceSignal;
  technicalSignal: ConvergenceSignal;
  motorCaption?: string;
  technicalCaption?: string;
}) {
  const row = findRow(motorSignal, technicalSignal);

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium text-white">Motor × Technicals convergence</h3>
        <InfoTooltip term="convergence" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {row.icon}
        </span>
        <div>
          <p className="text-sm font-medium text-white">{row.reading}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Motor: <span className="text-zinc-300">{SIGNAL_LABELS[motorSignal]}</span>
            {" · "}
            Technicals: <span className="text-zinc-300">{SIGNAL_LABELS[technicalSignal]}</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-zinc-400">{row.explanation}</p>
      {motorCaption || technicalCaption ? (
        <div className="mt-3 space-y-1 border-t border-zinc-800/80 pt-3 text-[11px] text-zinc-600">
          {motorCaption ? <p>Motor: {motorCaption}</p> : null}
          {technicalCaption ? <p>Technicals: {technicalCaption}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
