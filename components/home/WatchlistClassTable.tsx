"use client";

import { SymbolAvatar } from "@/components/catalog/SymbolAvatar";
import { WatchlistStarButton } from "@/components/home/WatchlistStarButton";
import type { WatchlistClassGroup, WatchlistRow } from "@/lib/motor/snapshot-types";

function stageBadgeClass(stageLabel: string): string {
  switch (stageLabel) {
    case "Accumulate":
      return "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30";
    case "Reduce":
      return "bg-red-500/15 text-red-400 ring-red-500/30";
    case "Hold":
      return "bg-zinc-800 text-zinc-300 ring-zinc-700";
    default:
      return "bg-zinc-900 text-zinc-500 ring-zinc-800";
  }
}

function entryBadgeClass(validated: boolean, hasMotorData: boolean): string {
  if (!hasMotorData) return "bg-zinc-900 text-zinc-500 ring-zinc-800";
  if (validated) return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/25";
  return "bg-zinc-800 text-zinc-400 ring-zinc-700";
}

function formatIndicatorValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function formatScore(score: number | null): string {
  if (score == null) return "—";
  return score.toFixed(3);
}

function formatPerf(pct: number | null): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function perfClass(pct: number | null): string {
  if (pct == null) return "text-zinc-500";
  if (pct > 0) return "text-emerald-400";
  if (pct < 0) return "text-red-400";
  return "text-zinc-400";
}

function indicatorColumns(rows: WatchlistRow[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const ind of row.indicators) {
      if (!seen.has(ind.id)) seen.set(ind.id, ind.name);
    }
  }
  return [...seen.entries()].slice(0, 4).map(([id, name]) => ({ id, name }));
}

function SecurityRow({
  row,
  columns,
}: {
  row: WatchlistRow;
  columns: { id: string; name: string }[];
}) {
  const indMap = new Map(row.indicators.map((i) => [i.id, i]));
  const entryLabel = !row.hasMotorData
    ? "Analyzing"
    : row.motorScope === "class"
      ? row.entryValidated
        ? "Class validated"
        : "Class macro"
      : row.entryValidated
        ? "Validated"
        : "Not validated";

  return (
    <tr className="border-b border-zinc-800/80 hover:bg-zinc-950/50">
      <td className="py-2 pl-2 pr-2">
        <div className="flex min-w-[13rem] items-center gap-2">
          <WatchlistStarButton symbol={row.symbol} />
          <SymbolAvatar
            symbol={row.symbol}
            exchange={row.exchange ?? "NYSE"}
            classId={row.classId}
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-white">
                {row.symbol}
              </span>
              {row.divergesFromClass ? (
                <span className="text-[10px] text-amber-400">≠ class</span>
              ) : null}
            </div>
            <p className="truncate text-xs text-zinc-500">{row.name}</p>
          </div>
        </div>
      </td>
      <td className="px-2 py-2 tabular-nums text-sm text-white">
        {formatScore(row.score)}
      </td>
      <td className={`px-2 py-2 tabular-nums text-sm ${perfClass(row.perf1dPct)}`}>
        {formatPerf(row.perf1dPct)}
      </td>
      <td className="px-2 py-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${stageBadgeClass(
            row.stageLabel,
          )}`}
        >
          {row.stageLabel}
        </span>
      </td>
      <td className="px-2 py-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${entryBadgeClass(
            row.entryValidated,
            row.hasMotorData,
          )}`}
        >
          {entryLabel}
        </span>
      </td>
      <td className="max-w-[8rem] truncate px-2 py-2 text-[11px] text-zinc-400">
        {row.dominantIndicator?.name ?? "—"}
      </td>
      {columns.map((col) => (
        <td key={col.id} className="px-2 py-2 tabular-nums text-xs text-zinc-300">
          {formatIndicatorValue(indMap.get(col.id)?.value)}
        </td>
      ))}
    </tr>
  );
}

export function WatchlistClassTable({ group }: { group: WatchlistClassGroup }) {
  const columns = indicatorColumns(group.rows);

  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="font-title text-base text-white">{group.label}</h2>
        {group.classStageLabel ? (
          <p className="text-[11px] text-zinc-500">
            Class: {group.classStageLabel}
            {group.classScore != null ? ` · ${group.classScore.toFixed(2)}` : ""}
            {group.classDominantIndicator?.name
              ? ` · ${group.classDominantIndicator.name}`
              : ""}
          </p>
        ) : (
          <p className="text-[11px] text-zinc-600">Class macro pending</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-black">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950/90 text-[11px] text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-2 py-2 font-medium">Score</th>
              <th className="px-2 py-2 font-medium">1D</th>
              <th className="px-2 py-2 font-medium">Stage</th>
              <th className="px-2 py-2 font-medium">Entry</th>
              <th className="px-2 py-2 font-medium">Driver</th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="max-w-[7rem] truncate px-2 py-2 font-medium"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <SecurityRow key={row.id} row={row} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
