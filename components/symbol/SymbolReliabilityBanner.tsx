"use client";

import { useState } from "react";
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

function gradeWord(grade: DecisionReliabilitySummary["grade"]): string {
  switch (grade) {
    case "strong":
      return "high";
    case "adequate":
      return "adequate";
    case "weak":
      return "weak";
    default:
      return "insufficient";
  }
}

export function SymbolReliabilityBanner({
  reliability,
}: {
  reliability: DecisionReliabilitySummary;
}) {
  const [open, setOpen] = useState(false);
  const { score, meetsTarget, target, grade, summary, factors } = reliability;

  return (
    <section
      className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3"
      aria-label="Data reliability audit"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className={`rounded px-2 py-0.5 text-sm ring-1 ring-inset ${gradeClass(grade)}`}>
            Data quality: {gradeWord(grade)} ({score.toFixed(1)}/10)
          </span>
          <span className="text-[11px] text-zinc-500">
            measures coverage and freshness of the information, not hit-rate probability
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          aria-expanded={open}
        >
          {open ? "Hide details" : "Show details"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
          <p className="text-xs text-zinc-500">
            {summary} {meetsTarget ? `Target ≥ ${target} met.` : `Below the target of ${target}.`}
          </p>
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
        </div>
      ) : null}
    </section>
  );
}
