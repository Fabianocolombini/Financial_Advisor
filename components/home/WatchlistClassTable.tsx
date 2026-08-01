"use client";

import { useState } from "react";
import { SymbolAvatar } from "@/components/catalog/SymbolAvatar";
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

function indicatorColumns(rows: WatchlistRow[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const ind of row.indicators) {
      if (!seen.has(ind.id)) seen.set(ind.id, ind.name);
    }
  }
  return [...seen.entries()].slice(0, 5).map(([id, name]) => ({ id, name }));
}

function SecurityRow({
  row,
  columns,
  selected,
  onSelect,
}: {
  row: WatchlistRow;
  columns: { id: string; name: string }[];
  selected: boolean;
  onSelect: () => void;
}) {
  const indMap = new Map(row.indicators.map((i) => [i.id, i]));

  return (
    <tr
      className={`group border-b border-zinc-800/80 transition-colors ${
        selected ? "bg-zinc-900/80" : "hover:bg-zinc-950"
      }`}
      onClick={onSelect}
    >
      <td className="relative py-3 pl-4 pr-2">
        {selected ? (
          <span
            className="absolute left-0 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[6px] border-l-[6px] border-y-transparent border-l-zinc-400"
            aria-hidden
          />
        ) : null}
        <div className="flex min-w-[14rem] items-center gap-3">
          <SymbolAvatar
            symbol={row.symbol}
            exchange={row.exchange ?? "NYSE"}
            classId={row.classId}
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
            <p className="truncate text-sm text-zinc-400">{row.name}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 tabular-nums text-sm text-white">
        {formatScore(row.score)}
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${stageBadgeClass(
            row.stageLabel,
          )}`}
        >
          {row.stageLabel}
        </span>
      </td>
      {columns.map((col) => (
        <td key={col.id} className="px-3 py-3 tabular-nums text-sm text-zinc-300">
          {formatIndicatorValue(indMap.get(col.id)?.value)}
        </td>
      ))}
    </tr>
  );
}

export function WatchlistClassTable({ group }: { group: WatchlistClassGroup }) {
  const columns = indicatorColumns(group.rows);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(
    group.rows[0]?.symbol ?? null,
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-title text-lg text-white">{group.label}</h2>
          {group.classStageLabel ? (
            <p className="mt-1 text-xs text-zinc-500">
              Class stage:{" "}
              <span className="text-zinc-300">{group.classStageLabel}</span>
              {group.classScore != null ? (
                <span className="text-zinc-500">
                  {" "}
                  · score {group.classScore.toFixed(3)}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-zinc-600">
          Ranked by composite score (higher = more attractive to add)
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-black">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950/80 text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-3 py-3 font-medium">Score</th>
              <th className="px-3 py-3 font-medium">Stage</th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="max-w-[8rem] truncate px-3 py-3 font-medium"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <SecurityRow
                key={row.id}
                row={row}
                columns={columns}
                selected={selectedSymbol === row.symbol}
                onSelect={() => setSelectedSymbol(row.symbol)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-600">
        Detailed chart view coming soon. Educational use only — not investment advice.
      </p>
    </section>
  );
}
