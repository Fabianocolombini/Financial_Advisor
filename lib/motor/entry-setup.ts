/**
 * Quantifies the New money column: peer upside vs sleeve headwind.
 *
 * The motor's entryTiming is still the eligibility call (Buy / Wait / Avoid /
 * Neutral). A high Security Score can still be Avoid when the class is
 * reducing — that is not a bug, it is two layers answering different questions.
 * These two numbers make that split readable without changing the motor:
 *
 *   Gain  = name's peer rank, 0–100 (the Security Score).
 *   Risk  = 70% sleeve climate + 30% how weak the name is vs peers.
 */

import {
  plainNewMoney,
  plainTrend,
  type PlainLabel,
} from "./plain-language";

export type EntrySetup = PlainLabel & {
  /** Peer rank as 0–100. Higher = better vehicle inside the class. */
  gain: number | null;
  /** Combined headwind as 0–100. Higher = worse climate for new money. */
  risk: number | null;
  sleeveRisk: number | null;
  nameRisk: number | null;
};

const SLEEVE_RISK_BY_LABEL: Record<string, number> = {
  Increase: 18,
  Hold: 42,
  Reduce: 72,
  "Reduce hard": 90,
};

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function sleeveRiskFromStage(
  classStageLabel: string | null | undefined,
): number | null {
  if (!classStageLabel) return null;
  const direct = SLEEVE_RISK_BY_LABEL[classStageLabel];
  if (direct != null) return direct;
  const mapped = plainTrend(classStageLabel);
  if (mapped.tone === "unknown") return null;
  return SLEEVE_RISK_BY_LABEL[mapped.label] ?? null;
}

export function entrySetup(input: {
  score: number | null;
  classStageLabel: string | null | undefined;
  entryTiming?: string | null;
  entryValidated: boolean;
  hasMotorData: boolean;
  motorScope?: "ticker" | "class" | "none";
}): EntrySetup {
  const verdict = plainNewMoney(input);
  const gain =
    input.score != null && Number.isFinite(input.score)
      ? clamp100(input.score * 100)
      : null;
  const sleeveRisk = sleeveRiskFromStage(input.classStageLabel);
  const nameRisk = gain != null ? 100 - gain : null;
  const risk =
    sleeveRisk != null && nameRisk != null
      ? clamp100(0.7 * sleeveRisk + 0.3 * nameRisk)
      : sleeveRisk;

  return {
    ...verdict,
    gain,
    risk,
    sleeveRisk,
    nameRisk,
    hint: setupHint(verdict, gain, risk, sleeveRisk),
  };
}

function setupHint(
  verdict: PlainLabel,
  gain: number | null,
  risk: number | null,
  sleeveRisk: number | null,
): string {
  const numbers =
    gain != null && risk != null
      ? `Gain ${gain} is the name vs its peers (100 = best of the class). Risk ${risk} mixes the sleeve climate${
          sleeveRisk != null ? ` (${sleeveRisk})` : ""
        } with how weak the name is.`
      : "";

  if (!numbers) return verdict.hint;

  if (verdict.label === "Do not add" && gain != null && gain >= 50) {
    return `${numbers} A mid or high Gain can still be Do not add: new money would fight a class that is reducing.`;
  }
  if (verdict.label === "Indifferent") {
    return `${numbers} Cash has no good or bad entry moment — the numbers compare the vehicle, not a buy window.`;
  }
  return `${numbers} ${verdict.hint}`;
}
