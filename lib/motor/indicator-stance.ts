/**
 * Glanceable band for each Security Score ingredient.
 *
 * The table used to print the raw reading (volume ratio, σ20, |Δ50z|). Those
 * numbers do not share a scale, so a 0.000 vol and a 1.82 z-score could not be
 * compared by eye. The motor already turns every ingredient into a directed
 * 0–1 peer rank (0.5 = median). This module is the UI map of that rank onto
 * three bands: helping the score, sitting at the median, or dragging it down.
 */

import type { MotorIndicatorSnapshot } from "./snapshot-types";
import type { ScoreIngredient } from "./score-recipes";
import { toneBadgeClass, type PlainLabel } from "./plain-language";

export const STANCE_HELPING = 0.65;
export const STANCE_DRAGGING = 0.35;

export type IndicatorStanceKind = "helping" | "neutral" | "dragging" | "unknown";

export type IndicatorStance = {
  kind: IndicatorStanceKind;
  label: string;
  hint: string;
  tone: PlainLabel["tone"];
};

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Directed percentile that actually enters the weighted score. */
export function scoringPercentile(
  ind: MotorIndicatorSnapshot | undefined,
  weight?: number | null,
): number | null {
  if (!ind) return null;
  if (ind.percentile != null && Number.isFinite(ind.percentile)) {
    return clamp01(ind.percentile);
  }
  const w = ind.weight ?? weight;
  if (
    ind.contribution != null &&
    Number.isFinite(ind.contribution) &&
    w != null &&
    Number.isFinite(w) &&
    w > 0
  ) {
    return clamp01(ind.contribution / w);
  }
  return null;
}

export function findRecipeIndicator(
  indicators: MotorIndicatorSnapshot[],
  ingredient: ScoreIngredient,
): MotorIndicatorSnapshot | undefined {
  const ids = new Set([ingredient.id, ...(ingredient.aliases ?? [])]);
  return indicators.find((row) => ids.has(row.id));
}

export function indicatorStance(percentile: number | null | undefined): IndicatorStance {
  if (percentile == null || !Number.isFinite(percentile)) {
    return {
      kind: "unknown",
      label: "—",
      hint: "This ingredient was not scored for this name on the snapshot date.",
      tone: "unknown",
    };
  }
  if (percentile >= STANCE_HELPING) {
    return {
      kind: "helping",
      label: "Adds",
      hint: `Above ${STANCE_HELPING.toFixed(2)} vs peers — this pillar is adding to the name's score.`,
      tone: "positive",
    };
  }
  if (percentile < STANCE_DRAGGING) {
    return {
      kind: "dragging",
      label: "Drags",
      hint: `Below ${STANCE_DRAGGING.toFixed(2)} vs peers — this is where the name is failing the rank.`,
      tone: "negative",
    };
  }
  return {
    kind: "neutral",
    label: "Neutral",
    hint: "Near the class median (0.50). Neither a strength nor the reason the score is weak.",
    tone: "neutral",
  };
}

export function stanceBadgeClass(kind: IndicatorStanceKind): string {
  return toneBadgeClass(
    kind === "helping"
      ? "positive"
      : kind === "dragging"
        ? "negative"
        : kind === "neutral"
          ? "neutral"
          : "unknown",
  );
}
