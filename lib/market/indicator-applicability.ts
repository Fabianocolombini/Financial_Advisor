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
  "Osciladores de momentum não se aplicam a caixa: o NAV é quase monotônico e as distribuições periódicas criam quedas artificiais.";

const LONG_MA_REASON =
  "Média de 200 períodos excluída pelo motor para caixa — a série de NAV não produz sinal de tendência longa útil.";

function exclusionReason(
  row: TechnicalIndicatorRow,
  stabilityFocused: boolean,
): string | null {
  if (!stabilityFocused) return null;
  if (row.group === "oscillator") return NAV_MONOTONIC_REASON;
  if (row.id === "sma_200" || row.id === "ema_200") return LONG_MA_REASON;
  return null;
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

/** Rows whose value could not be computed — surfaced instead of silently hidden. */
export function missingTechnicalRows(
  rows: TechnicalIndicatorRow[],
): TechnicalIndicatorRow[] {
  return rows.filter((r) => r.value == null || !Number.isFinite(r.value));
}
