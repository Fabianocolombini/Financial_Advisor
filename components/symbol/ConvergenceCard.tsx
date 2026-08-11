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
  positive: "Positivo",
  neutral: "Neutro",
  negative: "Negativo",
};

const MATRIX: Record<string, ConvergenceRow> = {
  "positive|positive": {
    icon: "✅",
    reading: "Sinal forte",
    explanation:
      "Motor e técnica alinhados positivamente — contexto favorável para manter ou aumentar exposição.",
  },
  "positive|neutral": {
    icon: "🟡",
    reading: "Motor positivo sem gatilho de preço",
    explanation:
      "O motor favorece o papel, mas o preço não está nem esticado nem descontado. Não há contradição: simplesmente não existe gatilho técnico agora.",
  },
  "positive|negative": {
    icon: "⏳",
    reading: "Esperar confirmação",
    explanation:
      "O motor está positivo, mas a técnica ainda não confirma — aguardar melhor ponto de entrada.",
  },
  "neutral|positive": {
    icon: "🟡",
    reading: "Preço melhora sem suporte do motor",
    explanation:
      "A técnica melhora enquanto o motor permanece neutro — movimento de preço ainda sem confirmação quantitativa.",
  },
  "neutral|neutral": {
    icon: "⚪",
    reading: "Sem sinal dos dois lados",
    explanation:
      "Motor e técnica neutros. Nenhum dos dois lados pede ação — nem compra nem venda.",
  },
  "neutral|negative": {
    icon: "🟠",
    reading: "Deterioração de preço sem sinal do motor",
    explanation:
      "A técnica piora enquanto o motor permanece neutro — acompanhe, mas ainda não é sinal de redução.",
  },
  "negative|positive": {
    icon: "⚠️",
    reading: "Possível rebound — cautela",
    explanation:
      "Técnica melhora enquanto o motor permanece negativo — possível repique, mas com risco elevado.",
  },
  "negative|neutral": {
    icon: "🟠",
    reading: "Motor negativo, preço ainda sem confirmar",
    explanation:
      "O motor está negativo e o preço ainda não confirmou fraqueza. Evite aumentar exposição.",
  },
  "negative|negative": {
    icon: "🔻",
    reading: "Reduzir / evitar",
    explanation:
      "Motor e técnica negativos — priorizar redução de risco ou evitar novas entradas.",
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
        <h3 className="text-sm font-medium text-white">Convergência Motor × Técnica</h3>
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
            Técnica: <span className="text-zinc-300">{SIGNAL_LABELS[technicalSignal]}</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-zinc-400">{row.explanation}</p>
      {motorCaption || technicalCaption ? (
        <div className="mt-3 space-y-1 border-t border-zinc-800/80 pt-3 text-[11px] text-zinc-600">
          {motorCaption ? <p>Motor: {motorCaption}</p> : null}
          {technicalCaption ? <p>Técnica: {technicalCaption}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
