"use client";

import { useRouter } from "next/navigation";
import { SymbolAvatar } from "@/components/catalog/SymbolAvatar";
import { WatchlistStarButton } from "@/components/home/WatchlistStarButton";
import { WalletBuyButton } from "@/components/wallet/WalletBuyButton";
import { formatShareVolumeCompact, formatPerf, perfClass } from "@/lib/format-market";
import { formatScore } from "@/lib/motor/format-scores";
import { entrySetup } from "@/lib/motor/entry-setup";
import {
  findRecipeIndicator,
  indicatorStance,
  scoringPercentile,
  stanceBadgeClass,
} from "@/lib/motor/indicator-stance";
import {
  plainQuality,
  plainTrend,
  toneBadgeClass,
} from "@/lib/motor/plain-language";
import { VOLUME_SESSIONS } from "@/lib/motor/enrich-yahoo-perf";
import {
  scoreRecipeFor,
  type ScoreIngredient,
} from "@/lib/motor/score-recipes";
import type { WatchlistClassGroup, WatchlistRow } from "@/lib/motor/snapshot-types";
import { ClassScoreLegend } from "./ClassScoreLegend";

function fallbackIndicatorColumns(rows: WatchlistRow[]): ScoreIngredient[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const ind of row.indicators) {
      if (!seen.has(ind.id)) seen.set(ind.id, ind.name);
    }
  }
  return [...seen.entries()].slice(0, 6).map(([id, name]) => ({
    id,
    shortLabel: name,
    label: name,
    weight: 0,
    meaning: name,
  }));
}

function recipeColumns(classId: string, rows: WatchlistRow[]): ScoreIngredient[] {
  return scoreRecipeFor(classId)?.ingredients ?? fallbackIndicatorColumns(rows);
}

function IndicatorCell({
  row,
  ingredient,
}: {
  row: WatchlistRow;
  ingredient: ScoreIngredient;
}) {
  const ind = findRecipeIndicator(row.indicators, ingredient);
  const percentile = scoringPercentile(ind, ingredient.weight || ind?.weight);
  const stance = indicatorStance(percentile);
  const weightPct = ingredient.weight > 0 ? `${(ingredient.weight * 100).toFixed(0)}%` : "";
  const title = [
    ingredient.label,
    weightPct ? `${weightPct} of the score` : null,
    ingredient.meaning,
    stance.hint,
    ind?.value != null ? `Raw reading ${ind.value}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <td className="px-2 py-2" title={title}>
      <div className="flex items-center gap-1.5">
        <span className="tabular-nums text-xs text-white">
          {percentile != null ? percentile.toFixed(2) : "—"}
        </span>
        <span
          className={`inline-flex rounded px-1 py-px text-[9px] font-medium ring-1 ring-inset ${stanceBadgeClass(
            stance.kind,
          )}`}
        >
          {stance.label}
        </span>
      </div>
    </td>
  );
}

function SecurityRow({
  row,
  columns,
  classStageLabel,
}: {
  row: WatchlistRow;
  columns: ScoreIngredient[];
  classStageLabel: string | null;
}) {
  const router = useRouter();
  const trend = plainTrend(row.stageLabel);
  const setup = entrySetup({
    score: row.score,
    classStageLabel,
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
      onClick={() => router.push(`/markets/${row.symbol}`)}
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
            onClick={() => router.push(`/markets/${row.symbol}`)}
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
      <td
        className="px-2 py-2"
        title={`${trend.hint} This is the name's own stage from its score, not the sleeve.`}
      >
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${toneBadgeClass(
            trend.tone,
          )}`}
        >
          {trend.label}
        </span>
      </td>
      <td className="px-2 py-2" title={setup.hint}>
        <div className="flex gap-2 text-[10px] tabular-nums">
          <span className="text-emerald-400/90">
            Gain {setup.gain != null ? setup.gain : "—"}
          </span>
          <span className="text-red-400/90">
            Risk {setup.risk != null ? setup.risk : "—"}
          </span>
        </div>
        <span
          className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${toneBadgeClass(
            setup.tone,
          )}`}
        >
          {setup.label}
        </span>
      </td>
      <td className="max-w-[8rem] truncate px-2 py-2 text-[11px] text-zinc-400">
        {row.dominantIndicator?.name ?? "—"}
      </td>
      {columns.map((ingredient) => (
        <IndicatorCell key={ingredient.id} row={row} ingredient={ingredient} />
      ))}
    </tr>
  );
}

function ScoreMixBar({ classId }: { classId: string }) {
  const recipe = scoreRecipeFor(classId);
  if (!recipe) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-zinc-500">
      <span className="text-zinc-600">Score mix</span>
      {recipe.ingredients.map((ing) => (
        <span key={ing.id} className="tabular-nums" title={ing.meaning}>
          <span className="text-zinc-400">{(ing.weight * 100).toFixed(0)}%</span>{" "}
          <span className="text-zinc-300">{ing.shortLabel}</span>
        </span>
      ))}
      <span className="text-zinc-600">
        · Helping ≥0.65 · Neutral · Dragging &lt;0.35
      </span>
    </div>
  );
}

export function WatchlistClassTable({ group }: { group: WatchlistClassGroup }) {
  const columns = recipeColumns(group.classId, group.rows);
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

      <ScoreMixBar classId={group.classId} />

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
                title="This name's own stage from its Security Score, not the sleeve. The sleeve is the line above the table."
              >
                Name trend
              </th>
              <th
                className="px-2 py-2 font-medium"
                title="Gain is the name vs peers (0–100). Risk mixes the sleeve climate with how weak the name is. The badge is the motor's entry call — a high Gain can still be Do not add when the class is reducing."
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
                  className="px-2 py-2 font-medium"
                  title={`${col.label} (${(col.weight * 100).toFixed(0)}% of the score). ${col.meaning} Number is the 0–1 peer rank; Helping ≥0.65, Dragging <0.35.`}
                >
                  <div className="truncate">{col.shortLabel}</div>
                  {col.weight > 0 ? (
                    <div className="text-[10px] font-normal tabular-nums text-zinc-600">
                      {(col.weight * 100).toFixed(0)}%
                    </div>
                  ) : null}
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
                classStageLabel={group.classStageLabel}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ClassScoreLegend classId={group.classId} label={group.label} />
    </section>
  );
}
