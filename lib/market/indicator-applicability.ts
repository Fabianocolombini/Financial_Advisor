/**
 * Which generic technical indicators are meaningful for a given asset class.
 *
 * The motor already encodes this for cash in `motor/config/indicadores_tecnicos_cash.json`
 * ("Cash não usa RSI — NAV monotônico contamina momentum") and enforces it in
 * `motor/scripts/audit_models.py`. The UI used to compute and display RSI for cash
 * anyway, which is why the technical block looked contradictory.
 */

import type { TechnicalIndicatorRow } from "./technical-summary";
import { classScoreProfile } from "@/lib/motor/score-domain";

export type ExcludedIndicator = {
  row: TechnicalIndicatorRow;
  reason: string;
};

export type IndicatorApplicability = {
  rows: TechnicalIndicatorRow[];
  excluded: ExcludedIndicator[];
  /** Class-level note explaining the exclusions, when any apply. */
  note: string | null;
};

const NAV_MONOTONIC_REASON =
  "Oscillators do not apply to cash: NAV is almost monotonic, so momentum and trend strength have nothing to measure, and periodic distributions create artificial drops.";

const DISTRIBUTION_SAWTOOTH_REASON =
  "Moving averages do not apply to cash: NAV rises a few cents a day and drops all at once on the monthly distribution, so price sits almost always below its own averages and the signal would be a sell by construction.";

function exclusionReason(
  row: TechnicalIndicatorRow,
  stabilityFocused: boolean,
): string | null {
  if (!stabilityFocused) return null;
  if (row.group === "oscillator") return NAV_MONOTONIC_REASON;
  return DISTRIBUTION_SAWTOOTH_REASON;
}

export function applicableTechnicalRows(
  rows: TechnicalIndicatorRow[],
  classId: string | null | undefined,
): IndicatorApplicability {
  const { stabilityFocused } = classScoreProfile(classId);

  const applicable: TechnicalIndicatorRow[] = [];
  const excluded: ExcludedIndicator[] = [];

  for (const row of rows) {
    const reason = exclusionReason(row, stabilityFocused);
    if (reason) excluded.push({ row, reason });
    else applicable.push(row);
  }

  return {
    rows: applicable,
    excluded,
    note: excluded.length > 0 ? NAV_MONOTONIC_REASON : null,
  };
}

/**
 * Pivots need a meaningful previous-period range to project from. For cash the
 * daily range is a fraction of a cent, so every method collapses onto the same
 * price and the levels carry no information.
 */
export function pivotsApplicable(classId: string | null | undefined): {
  applicable: boolean;
  reason: string | null;
} {
  const { stabilityFocused } = classScoreProfile(classId);
  if (!stabilityFocused) return { applicable: true, reason: null };
  return {
    applicable: false,
    reason:
      "Pivots do not apply to cash: a session's range is a fraction of a cent, so every method collapses onto the same price and projects no target.",
  };
}

/** Rows whose value could not be computed — surfaced instead of silently hidden. */
export function missingTechnicalRows(
  rows: TechnicalIndicatorRow[],
): TechnicalIndicatorRow[] {
  return rows.filter((r) => r.value == null || !Number.isFinite(r.value));
}
