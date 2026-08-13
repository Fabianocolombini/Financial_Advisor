"use client";

import { useRouter } from "next/navigation";
import { SymbolAvatar } from "@/components/catalog/SymbolAvatar";
import { WatchlistStarButton } from "@/components/home/WatchlistStarButton";
import { WalletBuyButton } from "@/components/wallet/WalletBuyButton";
import { formatShareVolumeCompact, formatPerf, perfClass } from "@/lib/format-market";
import { formatIndicatorValue, formatScore } from "@/lib/motor/format-scores";
import {
  plainNewMoney,
  plainQuality,
  plainTrend,
  toneBadgeClass,
} from "@/lib/motor/plain-language";
import { VOLUME_SESSIONS } from "@/lib/motor/enrich-yahoo-perf";
import type { WatchlistClassGroup, WatchlistRow } from "@/lib/motor/snapshot-types";
import { ClassScoreLegend } from "./ClassScoreLegend";

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
  const router = useRouter();
  const indMap = new Map(row.indicators.map((i) => [i.id, i]));
  const trend = plainTrend(row.stageLabel);
  const newMoney = plainNewMoney({
    entryTiming: row.entryTiming,
    entryValidated: row.entryValidated,
    hasMotorData: row.hasMotorData,
    motorScope: row.motorScope,
  });
  const quality = plainQuality({
    instrumentQuality: row.instrumentQuality,
    score: row.score,
  });

  return (
    <tr
      className="border-b border-zinc-800/80 cursor-pointer hover:bg-zinc-950/50"
      onClick={() => router.push(`/mercado/${row.symbol}`)}
    >
      <td className="py-2 pl-2 pr-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-[13rem] items-center gap-2">
          <WatchlistStarButton symbol={row.symbol} />
          <WalletBuyButton
            symbol={row.symbol}
            classId={row.classId}
            name={row.name}
            exchange={row.exchange}
            kind={row.kind}
          />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => router.push(`/mercado/${row.symbol}`)}
          >
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
                  <span
                    className="text-[10px] text-amber-400"
                    title="This name is moving in the opposite direction of the class."
                  >
                    against the class
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-zinc-500">{row.name}</p>
            </div>
          </button>
        </div>
      </td>
      <td className="px-2 py-2 text-sm text-white" title={quality.hint}>
        <div className="tabular-nums">{formatScore(row.score)}</div>
        <div className="text-[10px] text-zinc-500">{quality.label}</div>
      </td>
      <td
        className="px-2 py-2 text-sm text-zinc-300"
        title={`Average shares traded per day over the last ${VOLUME_SESSIONS} sessions, and how much that is of the class volume.`}
      >
        <div className="tabular-nums">
          {formatShareVolumeCompact(row.avgVolumeShares)}
        </div>
        <div className="text-[10px] text-zinc-500">
          {row.volumeSharePct != null
            ? `${row.volumeSharePct.toFixed(0)}% of class`
            : "—"}
        </div>
      </td>
      <td className={`px-2 py-2 tabular-nums text-sm ${perfClass(row.perf1dPct)}`}>
        {formatPerf(row.perf1dPct)}
      </td>
      <td className={`px-2 py-2 tabular-nums text-sm ${perfClass(row.perf7dPct)}`}>
        {formatPerf(row.perf7dPct)}
      </td>
      <td className={`px-2 py-2 tabular-nums text-sm ${perfClass(row.perf15dPct)}`}>
        {formatPerf(row.perf15dPct)}
      </td>
      <td className="px-2 py-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${toneBadgeClass(
            trend.tone,
          )}`}
          title={trend.hint}
        >
          {trend.label}
        </span>
      </td>
      <td className="px-2 py-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${toneBadgeClass(
            newMoney.tone,
          )}`}
          title={newMoney.hint}
        >
          {newMoney.label}
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
  const classTrend = plainTrend(group.classStageLabel);

  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="font-title text-base text-white">{group.label}</h2>
        {group.classStageLabel ? (
          <p className="text-[11px] text-zinc-500" title={classTrend.hint}>
            The whole class:{" "}
            <span className="text-zinc-300">{classTrend.label}</span>
            {group.classDominantIndicator?.name
              ? ` · driven by ${group.classDominantIndicator.name}`
              : ""}
          </p>
        ) : (
          <p className="text-[11px] text-zinc-600">Class not scored yet.</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-black">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950/90 text-[11px] text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th
                className="px-2 py-2 font-medium"
                title="Where the name sits in its own class ranking, from 0 to 1. It does not compare different classes."
              >
                Score
              </th>
              <th
                className="px-2 py-2 font-medium"
                title={`Average shares traded per day over the last ${VOLUME_SESSIONS} sessions — K thousand, M million, B billion.`}
              >
                Volume {VOLUME_SESSIONS}d
              </th>
              <th className="px-2 py-2 font-medium">1D</th>
              <th className="px-2 py-2 font-medium">7D</th>
              <th className="px-2 py-2 font-medium">15D</th>
              <th
                className="px-2 py-2 font-medium"
                title="Where the class is heading: increase, hold, or reduce."
              >
                Trend
              </th>
              <th
                className="px-2 py-2 font-medium"
                title="Whether the model allows new money in this name now."
              >
                New money
              </th>
              <th
                className="px-2 py-2 font-medium"
                title="The ingredient that weighed most on this name's score today."
              >
                Main factor
              </th>
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

      <ClassScoreLegend classId={group.classId} label={group.label} />
    </section>
  );
}
