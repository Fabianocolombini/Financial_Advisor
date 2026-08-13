"use client";

import { formatPerf, formatPrice, perfClass } from "@/lib/format-market";

export function WalletBandBar({
  cost,
  last,
  low,
  high,
  fraction,
  hitMin,
  hitMax,
  hasUserBands,
}: {
  cost: number;
  last: number | null;
  low: number;
  high: number;
  fraction: number;
  hitMin: boolean;
  hitMax: boolean;
  hasUserBands: boolean;
}) {
  const costFrac =
    high === low ? 0.5 : Math.max(0, Math.min(1, (cost - low) / (high - low)));

  return (
    <div className="space-y-1.5">
      <div className="relative h-2 rounded-full bg-zinc-800">
        <div
          className={`absolute top-0 h-2 rounded-full ${
            hitMin || hitMax ? "bg-red-500/70" : "bg-emerald-500/50"
          }`}
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
        <span
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-zinc-300"
          style={{ left: `${Math.round(costFrac * 100)}%` }}
          title={`Cost ${formatPrice(cost)}`}
        />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-600">
        <span className={hitMin ? "text-red-400" : undefined}>
          {hasUserBands ? "Floor" : "−15%"} {formatPrice(low)}
        </span>
        <span className="text-zinc-400">
          Cost {formatPrice(cost)}
          {last != null ? ` · now ${formatPrice(last)}` : ""}
        </span>
        <span className={hitMax ? "text-red-400" : undefined}>
          {hasUserBands ? "Ceiling" : "+15%"} {formatPrice(high)}
        </span>
      </div>
    </div>
  );
}

export function WalletPnl({
  pnlAbs,
  pnlPct,
  currency,
}: {
  pnlAbs: number | null;
  pnlPct: number | null;
  currency: string | null;
}) {
  return (
    <span className={`tabular-nums ${perfClass(pnlPct)}`}>
      {pnlAbs == null
        ? "—"
        : `${pnlAbs >= 0 ? "+" : ""}${formatPrice(pnlAbs)} ${currency ?? "USD"}`}
      {pnlPct != null ? (
        <span className="ml-1 text-[11px]">({formatPerf(pnlPct)})</span>
      ) : null}
    </span>
  );
}
