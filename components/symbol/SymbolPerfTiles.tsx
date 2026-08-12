"use client";

import type { PerfHorizonId, PerfHorizons } from "@/lib/market/perf-horizons";
import { PERF_HORIZON_LABELS, PERF_HORIZON_ORDER } from "@/lib/market/perf-horizons";
import { formatPerf, perfClass } from "@/lib/format-market";

export function SymbolPerfTiles({
  horizons,
  active,
  onSelect,
}: {
  horizons: PerfHorizons;
  active?: PerfHorizonId;
  onSelect?: (id: PerfHorizonId) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {PERF_HORIZON_ORDER.map((id) => {
        const pct = horizons[id];
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect?.(id)}
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
