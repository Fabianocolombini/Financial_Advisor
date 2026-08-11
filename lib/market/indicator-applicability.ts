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
  "Osciladores não se aplicam a caixa: o NAV é quase monotônico, então momentum e força de tendência não têm o que medir, e as distribuições periódicas criam quedas artificiais.";

const DISTRIBUTION_SAWTOOTH_REASON =
  "Médias móveis não se aplicam a caixa: o NAV sobe alguns centavos por dia e cai de uma vez na distribuição mensal, então o preço fica quase sempre abaixo das próprias médias e o sinal seria vendedor por construção.";

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
      "Pivôs não se aplicam a caixa: a amplitude de um pregão é de frações de centavo, então todos os métodos colapsam sobre o mesmo preço e não projetam alvo algum.",
  };
}

/** Rows whose value could not be computed — surfaced instead of silently hidden. */
export function missingTechnicalRows(
  rows: TechnicalIndicatorRow[],
): TechnicalIndicatorRow[] {
  return rows.filter((r) => r.value == null || !Number.isFinite(r.value));
}
