"use client";

import glossary from "@/lib/motor/indicator-glossary.json";

export type GlossaryTerm = keyof typeof glossary;

export function InfoTooltip({
  term,
  className = "",
}: {
  term: GlossaryTerm;
  className?: string;
}) {
  const text = glossary[term];
  if (!text) return null;

  return (
    <span className={`group relative inline-flex ${className}`}>
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[10px] leading-none text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-200"
        aria-label={`Information: ${term.replace(/_/g, " ")}`}
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-56 -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-[11px] leading-snug text-zinc-300 shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
