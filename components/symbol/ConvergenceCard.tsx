"use client";

import type { ConvergenceSignal } from "@/lib/motor/motor-technicals-summary";
import { InfoTooltip } from "./InfoTooltip";

export type { ConvergenceSignal };

type ConvergenceRow = {
  motor: ConvergenceSignal;
  technical: ConvergenceSignal;
  icon: string;
  reading: string;
  explanation: string;
};

const ROWS: ConvergenceRow[] = [
  {
    motor: "positive",
    technical: "positive",
    icon: "✅",
    reading: "Sinal forte",
    explanation: "Motor e técnica alinhados positivamente — contexto favorável para manter ou aumentar exposição.",
  },
  {
    motor: "positive",
    technical: "negative",
    icon: "⏳",
    reading: "Esperar confirmação",
    explanation: "O motor está positivo, mas a técnica ainda não confirma — aguardar melhor ponto de entrada.",
  },
  {
    motor: "negative",
    technical: "positive",
    icon: "⚠️",
    reading: "Possível rebound — cautela",
    explanation: "Técnica melhora enquanto o motor permanece negativo — possível repique, mas com risco elevado.",
  },
  {
    motor: "negative",
    technical: "negative",
    icon: "🔻",
    reading: "Reduzir / evitar",
    explanation: "Motor e técnica negativos — priorizar redução de risco ou evitar novas entradas.",
  },
];

function findRow(motor: ConvergenceSignal, technical: ConvergenceSignal): ConvergenceRow {
  return (
    ROWS.find((r) => r.motor === motor && r.technical === technical) ?? ROWS[3]!
  );
}

export function signalFromScore(score: number | null | undefined): ConvergenceSignal {
  if (score == null || !Number.isFinite(score)) return "negative";
  return score >= 0 ? "positive" : "negative";
}

export function ConvergenceCard({
  motorSignal,
  technicalSignal,
}: {
  motorSignal: ConvergenceSignal;
  technicalSignal: ConvergenceSignal;
}) {
  const row = findRow(motorSignal, technicalSignal);
  const motorLabel = motorSignal === "positive" ? "Positivo" : "Negativo";
  const technicalLabel = technicalSignal === "positive" ? "Positivo" : "Negativo";

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
          <p className="text-sm font-medium text-white">
            {row.reading}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Motor: <span className="text-zinc-300">{motorLabel}</span>
            {" · "}
            Técnica: <span className="text-zinc-300">{technicalLabel}</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-zinc-400">{row.explanation}</p>
    </section>
  );
}
