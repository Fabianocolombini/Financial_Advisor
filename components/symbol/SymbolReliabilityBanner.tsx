import type { DecisionReliabilitySummary } from "@/lib/motor/snapshot-types";

function gradeClass(grade: DecisionReliabilitySummary["grade"]): string {
  switch (grade) {
    case "strong":
      return "text-emerald-400 ring-emerald-500/30";
    case "adequate":
      return "text-amber-300 ring-amber-500/30";
    case "weak":
      return "text-orange-400 ring-orange-500/30";
    default:
      return "text-red-400 ring-red-500/30";
  }
}

export function SymbolReliabilityBanner({
  reliability,
}: {
  reliability: DecisionReliabilitySummary;
}) {
  const { score, meetsTarget, target, grade, summary, factors } = reliability;

  return (
    <section
      className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 space-y-3"
      aria-label="Auditoria de confiabilidade para decisão"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-white">Confiabilidade para decisão</h2>
          <p className="mt-1 text-xs text-zinc-500">{summary}</p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-2 ring-1 ring-inset ${gradeClass(grade)}`}
        >
          <span className="text-3xl font-semibold tabular-nums">{score.toFixed(1)}</span>
          <div className="text-left text-[11px]">
            <p>/ 10</p>
            <p>{meetsTarget ? `≥ ${target} OK` : `< ${target} weak`}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {factors.map((f) => (
          <div
            key={f.id}
            className="rounded border border-zinc-800/80 bg-black/40 px-3 py-2"
          >
            <div className="flex justify-between gap-2 text-[11px]">
              <span className="text-zinc-400">{f.label}</span>
              <span className="tabular-nums text-zinc-300">
                {f.score}/{f.max}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">{f.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
