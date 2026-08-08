"use client";

import { useState } from "react";

export function SymbolAbout({ summary }: { summary: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!summary?.trim()) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-white">About</h3>
        <p className="text-sm text-zinc-500">Descrição da empresa não disponível.</p>
      </section>
    );
  }

  const preview = summary.length > 280 ? summary.slice(0, 280).trimEnd() + "…" : summary;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-white">About</h3>
      <p className="text-sm leading-relaxed text-zinc-400">
        {expanded ? summary : preview}
        {summary.length > 280 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 text-sky-400 hover:text-sky-300"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </p>
    </section>
  );
}
