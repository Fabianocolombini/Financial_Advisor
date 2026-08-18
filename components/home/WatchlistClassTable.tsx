"use client";

import { useRouter } from "next/navigation";
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
  newMoneyGlyph,
  plainQuality,
  plainTrend,
  toneBadgeClass,
  trendGlyph,
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

function shortFactorName(
  classId: string,
  dominant: { id: string; name: string } | null,
): string {
  if (!dominant) return "—";
  const recipe = scoreRecipeFor(classId);
  const match = recipe?.ingredients.find(
    (ing) => ing.id === dominant.id || ing.aliases?.includes(dominant.id),
  );
  const label = match?.shortLabel ?? dominant.name;
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

function Glyph({
  glyph,
  label,
  tone,
}: {
  glyph: string;
  label: string;
  tone: ReturnType<typeof plainTrend>["tone"];
}) {
  return (
    <span
      aria-label={label}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset ${toneBadgeClass(
        tone,
      )}`}
    >
      {glyph}
    </span>
  );
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
    <td className="w-[3.5rem] px-1.5 py-1.5" title={title}>
      <div className="flex flex-col items-start leading-tight">
        <span className="tabular-nums text-xs text-white">
          {percentile != null ? percentile.toFixed(2) : "—"}
        </span>
        <span
          className={`mt-0.5 inline-flex rounded px-1 py-px text-[9px] font-medium ring-1 ring-inset ${stanceBadgeClass(
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
      <td className="py-1.5 pl-1 pr-1.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 max-w-[11.5rem] items-start gap-1">
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
            className="min-w-0 flex-1 text-left"
            onClick={() => router.push(`/markets/${row.symbol}`)}
          >
            <div className="flex items-center gap-1">
              <span className="rounded bg-zinc-800 px-1 py-px font-mono text-[11px] text-white">
                {row.symbol}
              </span>
              {row.divergesFromClass ? (
                <span
                  className="text-[9px] text-amber-400"
                  title="This name is moving in the opposite direction of the class."
                >
                  vs class
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-zinc-500">
              {row.name}
            </p>
          </button>
        </div>
      </td>
      <td className="px-1.5 py-1.5 text-sm text-white" title={quality.hint}>
        <div className="tabular-nums">{formatScore(row.score)}</div>
        <div className="text-[10px] text-zinc-500">{quality.label}</div>
      </td>
      <td
        className="px-1.5 py-1.5 text-sm text-zinc-300"
        title={`Average shares traded per day over the last ${VOLUME_SESSIONS} sessions, and how much that is of the class volume.`}
      >
        <div className="tabular-nums">
          {formatShareVolumeCompact(row.avgVolumeShares)}
        </div>
        <div className="text-[10px] text-zinc-500">
          {row.volumeSharePct != null
            ? `${row.volumeSharePct.toFixed(0)}%`
            : "—"}
        </div>
      </td>
      <td className={`px-1.5 py-1.5 tabular-nums text-sm ${perfClass(row.perf1dPct)}`}>
        {formatPerf(row.perf1dPct)}
      </td>
      <td className={`px-1.5 py-1.5 tabular-nums text-sm ${perfClass(row.perf7dPct)}`}>
        {formatPerf(row.perf7dPct)}
      </td>
      <td className={`px-1.5 py-1.5 tabular-nums text-sm ${perfClass(row.perf15dPct)}`}>
        {formatPerf(row.perf15dPct)}
      </td>
      <td
        className="px-1.5 py-1.5"
        title={`${trend.hint} This is the name's own stage from its score, not the sleeve.`}
      >
        <Glyph glyph={trendGlyph(trend.label)} label={trend.label} tone={trend.tone} />
      </td>
      <td className="px-1.5 py-1.5" title={setup.hint}>
        <div className="flex flex-col items-start gap-0.5">
          <Glyph
            glyph={newMoneyGlyph(setup.label)}
            label={setup.label}
            tone={setup.tone}
          />
          <div className="flex flex-col text-[9px] leading-tight tabular-nums">
            <span className="text-emerald-400/90">
              Gain {setup.gain != null ? setup.gain : "—"}
            </span>
            <span className="text-red-400/90">
              Risk {setup.risk != null ? setup.risk : "—"}
            </span>
          </div>
        </div>
      </td>
      <td
        className="max-w-[4.5rem] truncate px-1.5 py-1.5 text-[10px] text-zinc-400"
        title={row.dominantIndicator?.name ?? undefined}
      >
        {shortFactorName(row.classId, row.dominantIndicator)}
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
        · Adds ≥0.65 · Neutral · Drags &lt;0.35
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
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950/90 text-[11px] text-zinc-500">
            <tr>
              <th className="py-2 pl-1 pr-1.5 font-medium">Name</th>
              <th
                className="px-1.5 py-2 font-medium"
                title="Where the name sits in its own class ranking, from 0 to 1. It does not compare different classes."
              >
                Score
              </th>
              <th
                className="px-1.5 py-2 font-medium"
                title={`Average shares traded per day over the last ${VOLUME_SESSIONS} sessions — K thousand, M million, B billion.`}
              >
                Vol {VOLUME_SESSIONS}d
              </th>
              <th className="px-1.5 py-2 font-medium">1D</th>
              <th className="px-1.5 py-2 font-medium">7D</th>
              <th className="px-1.5 py-2 font-medium">15D</th>
              <th
                className="px-1.5 py-2 font-medium"
                title="This name's own stage from its Security Score, not the sleeve. ↑ add, ● hold, ↓ reduce. The sleeve is the line above the table."
              >
                Trend
              </th>
              <th
                className="px-1.5 py-2 font-medium"
                title="Symbol is the entry call (+ add, × don't, … wait). Gain is the name vs peers (0–100). Risk mixes the sleeve climate with how weak the name is."
              >
                Money
              </th>
              <th
                className="px-1.5 py-2 font-medium"
                title="The ingredient that weighed most on this name's score today."
              >
                Factor
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="px-1.5 py-2 font-medium"
                  title={`${col.label} (${(col.weight * 100).toFixed(0)}% of the score). ${col.meaning} Number is the 0–1 peer rank; Adds ≥0.65, Drags <0.35.`}
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
