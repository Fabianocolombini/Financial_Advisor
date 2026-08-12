"use client";

import type {
  AllocationStance,
  DecisionSummary,
  EntryTiming,
  InstrumentQuality,
  NarrativeSection,
} from "@/lib/motor/decision-summary";
import { InfoTooltip } from "./InfoTooltip";
import type { GlossaryTerm } from "./InfoTooltip";

function allocationTone(stance: AllocationStance): string {
  switch (stance) {
    case "Overweight":
      return "text-emerald-400";
    case "Reduce":
      return "text-orange-400";
    case "Strong Reduce":
      return "text-red-400";
    case "Hold":
      return "text-zinc-200";
    default:
      return "text-zinc-500";
  }
}

function qualityTone(quality: InstrumentQuality): string {
  switch (quality) {
    case "Preferred":
      return "text-emerald-400";
    case "Competitive":
      return "text-zinc-200";
    case "Weak":
      return "text-orange-400";
    default:
      return "text-zinc-500";
  }
}

function entryTone(timing: EntryTiming): string {
  switch (timing) {
    case "Buy":
      return "text-emerald-400";
    case "Avoid":
      return "text-red-400";
    case "Wait":
      return "text-amber-300";
    case "Neutral":
      return "text-zinc-200";
    default:
      return "text-zinc-500";
  }
}

function DecisionCard({
  title,
  term,
  question,
  value,
  tone,
  detail,
  children,
}: {
  title: string;
  term: GlossaryTerm;
  question: string;
  value: string;
  tone: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {title}
        </h3>
        <InfoTooltip term={term} />
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">{question}</p>
      <p className={`mt-2 text-base font-medium ${tone}`}>{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{detail}</p>
      {children}
    </section>
  );
}

export function DecisionSummaryCards({
  decision,
  classLabel,
}: {
  decision: DecisionSummary;
  classLabel: string;
}) {
  const { allocation, instrument, entry } = decision;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Leitura principal</p>
        <p className="mt-1 text-lg font-medium text-white">{decision.headline}</p>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <DecisionCard
          title="Alocação da classe"
          term="allocation_stance"
          question={`Quanto carregar de ${classLabel}?`}
          value={allocation.label}
          tone={allocationTone(allocation.stance)}
          detail={allocation.explanation}
        />
        <DecisionCard
          title="Instrumento vs pares"
          term="instrument_quality"
          question="Este papel é o melhor da classe?"
          value={instrument.label}
          tone={qualityTone(instrument.quality)}
          detail={instrument.explanation}
        />
        <DecisionCard
          title="Entrada agora"
          term="entry_timing"
          question="Este é um bom momento de compra?"
          value={entry.label}
          tone={entryTone(entry.timing)}
          detail={entry.explanation}
        >
          {entry.reasons.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-zinc-800/80 pt-2 text-[11px] text-zinc-500">
              {entry.reasons.map((reason) => (
                <li key={reason}>· {reason}</li>
              ))}
            </ul>
          ) : null}
        </DecisionCard>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-zinc-800 bg-black/40 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">Dinheiro novo</p>
          <p className="mt-1 text-sm text-zinc-300">{decision.position.newMoney}</p>
        </div>
        <div className="rounded border border-zinc-800 bg-black/40 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">Posição existente</p>
          <p className="mt-1 text-sm text-zinc-300">{decision.position.existing}</p>
        </div>
      </div>
    </div>
  );
}

export function DecisionNarrative({ sections }: { sections: NarrativeSection[] }) {
  return (
    <section className="h-full rounded-lg border border-zinc-800 bg-black p-4">
      <h3 className="text-sm font-medium text-white">Leitura qualitativa</h3>
      <div className="mt-3 space-y-3">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="text-xs font-medium text-zinc-300">{section.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{section.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
