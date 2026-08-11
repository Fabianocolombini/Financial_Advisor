"use client";

import type { IndicatorAction } from "@/lib/motor/format-scores";
import { actionClass } from "@/lib/motor/format-scores";

export type SignalCounts = {
  sell: number;
  neutral: number;
  buy: number;
};

function dominantFromCounts(counts: SignalCounts): IndicatorAction {
  if (counts.sell >= counts.buy && counts.sell >= counts.neutral) return "Sell";
  if (counts.buy >= counts.sell && counts.buy >= counts.neutral) return "Buy";
  return "Neutral";
}

export function SignalCountCard({
  label,
  counts,
  weight,
  dominantSignal,
  expanded = false,
  onExpand,
}: {
  label: string;
  counts?: SignalCounts;
  weight?: string;
  dominantSignal?: IndicatorAction;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const dominant = dominantSignal ?? (counts ? dominantFromCounts(counts) : "Neutral");
  const isSummaryOnly = !counts;

  return (
    <button
      type="button"
      onClick={onExpand}
      disabled={!onExpand}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        expanded
          ? "border-zinc-600 bg-zinc-900"
          : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
      } ${onExpand ? "cursor-pointer" : "cursor-default"}`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${actionClass(dominant)}`}>{dominant}</p>
      {weight ? <p className="text-[10px] text-zinc-600">peso: {weight}</p> : null}
      {counts && !isSummaryOnly ? (
        <div className="mt-2 space-y-0.5 text-xs">
          <p className="text-red-400">Sell: {counts.sell}</p>
          <p className="text-zinc-400">Neutral: {counts.neutral}</p>
          <p className="text-emerald-400">Buy: {counts.buy}</p>
        </div>
      ) : null}
    </button>
  );
}
