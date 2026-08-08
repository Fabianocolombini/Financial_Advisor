"use client";

import { useState } from "react";
import type { PerfHorizonId } from "@/lib/market/perf-horizons";
import { PERF_HORIZON_LABELS } from "@/lib/market/perf-horizons";
import { formatPerf, perfClass } from "@/lib/format-market";

const ORDER: PerfHorizonId[] = ["1d", "5d", "1m", "2y"];

export function SymbolPerfTiles({
  horizons,
}: {
  horizons: Record<PerfHorizonId, number | null>;
}) {
  const [active, setActive] = useState<PerfHorizonId>("1d");

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ORDER.map((id) => {
        const pct = horizons[id];
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              isActive
                ? "border-zinc-600 bg-zinc-900"
                : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
            }`}
          >
            <p className="text-[11px] text-zinc-500">{PERF_HORIZON_LABELS[id]}</p>
            <p className={`text-lg font-medium tabular-nums ${perfClass(pct)}`}>
              {formatPerf(pct)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
