/**
 * How far a name is from motor Buy — app-layer only.
 *
 * Does not change `_entry_timing`. Never reclassifies Avoid as buyable.
 * Distance is the bottleneck axis (class Overweight vs name Preferred),
 * not the average of the two.
 */

import { classScoreProfile, isStabilityFocusedClass } from "./score-domain";

export type BuyProximityState = "ready" | "open" | "watch" | "blocked" | "unknown";
export type BuyProximityBlockedBy = "regime" | "quality" | null;

export type BuyProximity = {
  state: BuyProximityState;
  /** Bottleneck gap. Null when the tree is blocked, watching, or unknown. */
  distance: number | null;
  blockedBy: BuyProximityBlockedBy;
  regimeGap: number | null;
  qualityGap: number | null;
  /** Short primary cell: "0.15", "0.00", "Blocked", "Watch", "—". */
  value: string;
  /** Short secondary cell: "Class", "Name", "Can add", "Reduce", "Weak", "Diverges". */
  axis: string;
  hint: string;
};

export type BuyProximityInput = {
  classId: string | null | undefined;
  regimeScore: number | null | undefined;
  securityScore: number | null | undefined;
  allocationAction: string | null | undefined;
  instrumentQuality: string | null | undefined;
  divergesFromClass?: boolean | null;
};

const STATE_RANK: Record<BuyProximityState, number> = {
  ready: 0,
  open: 1,
  watch: 2,
  blocked: 3,
  unknown: 4,
};

function finite(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function roundGap(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function displayGap(value: number): string {
  return roundGap(value).toFixed(2);
}

export function normalizeAllocationAction(
  value: string | null | undefined,
): "Overweight" | "Hold" | "Reduce" | "Strong Reduce" | "Unknown" {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("strong reduce") || text.includes("fortedescendente")) {
    return "Strong Reduce";
  }
  if (
    text.includes("overweight") ||
    text.includes("accumulate") ||
    text.includes("ascendente") ||
    text.includes("increase")
  ) {
    return "Overweight";
  }
  if (text.includes("reduce") || text.includes("descendente")) return "Reduce";
  if (text.includes("hold") || text.includes("maduro")) return "Hold";
  return "Unknown";
}

export function normalizeInstrumentQuality(
  value: string | null | undefined,
): "Preferred" | "Competitive" | "Weak" | "Unknown" {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return "Unknown";
  if (text.includes("preferred") || text.includes("forte")) return "Preferred";
  if (text.includes("weak") || text.includes("fraco")) return "Weak";
  if (text.includes("competitive") || text.includes("mediano")) return "Competitive";
  return "Unknown";
}

function make(
  partial: Omit<BuyProximity, "value" | "axis" | "hint"> & {
    value: string;
    axis: string;
    hint: string;
  },
): BuyProximity {
  return partial;
}

function gapToThreshold(
  score: number | null,
  threshold: number,
  alreadyClear: boolean,
): number | null {
  if (score != null) return roundGap(Math.max(0, threshold - score));
  if (alreadyClear) return 0;
  return null;
}

export function buyProximity(input: BuyProximityInput): BuyProximity {
  const profile = classScoreProfile(input.classId);
  const cash = isStabilityFocusedClass(input.classId);
  const allocation = normalizeAllocationAction(input.allocationAction);
  const quality = normalizeInstrumentQuality(input.instrumentQuality);
  const diverge = Boolean(input.divergesFromClass);
  const regimeScore = finite(input.regimeScore);
  const securityScore = finite(input.securityScore);

  if (allocation === "Reduce" || allocation === "Strong Reduce") {
    if (diverge && quality === "Preferred") {
      return make({
        state: "watch",
        distance: null,
        blockedBy: "regime",
        regimeGap: gapToThreshold(regimeScore, profile.regime.overweight, false),
        qualityGap: cash ? 0 : gapToThreshold(securityScore, profile.security.strong, true),
        value: "Watch",
        axis: "Diverges",
        hint: "The class is reducing, but this name diverges and ranks among the best. Not a buy — Watch: it can turn earlier than the rest of the group.",
      });
    }
    return make({
      state: "blocked",
      distance: null,
      blockedBy: "regime",
      regimeGap: gapToThreshold(regimeScore, profile.regime.overweight, false),
      qualityGap: cash ? 0 : gapToThreshold(securityScore, profile.security.strong, quality === "Preferred"),
      value: "Blocked",
      axis: allocation === "Strong Reduce" ? "Reduce hard" : "Reduce",
      hint: "Blocked. The class is reducing. This is not “almost a buy” — new money is closed.",
    });
  }

  if (quality === "Weak") {
    return make({
      state: "blocked",
      distance: null,
      blockedBy: "quality",
      regimeGap: gapToThreshold(regimeScore, profile.regime.overweight, allocation === "Overweight"),
      qualityGap: gapToThreshold(securityScore, profile.security.strong, false),
      value: "Blocked",
      axis: "Weak",
      hint: "Blocked. This name ranks among the weakest in its class. Distance to a buy is not a number.",
    });
  }

  const regimeGap = gapToThreshold(
    regimeScore,
    profile.regime.overweight,
    allocation === "Overweight",
  );
  const qualityGap = cash
    ? 0
    : gapToThreshold(
        securityScore,
        profile.security.strong,
        quality === "Preferred",
      );

  if (regimeGap == null || qualityGap == null) {
    return make({
      state: "unknown",
      distance: null,
      blockedBy: null,
      regimeGap,
      qualityGap,
      value: "—",
      axis: "",
      hint: "Not enough scores yet to measure how close this is to a buy.",
    });
  }

  const distance = roundGap(Math.max(regimeGap, qualityGap));
  if (distance <= 0) {
    return make({
      state: "ready",
      distance: 0,
      blockedBy: null,
      regimeGap,
      qualityGap,
      value: "0.00",
      axis: "Can add",
      hint: cash
        ? "The cash sleeve is already Overweight. Money + is the buy."
        : "Nothing left: the class and the name are both ready. Money + is the buy.",
    });
  }

  const blockedBy: BuyProximityBlockedBy =
    regimeGap >= qualityGap ? "regime" : "quality";
  const otherStillOpen =
    blockedBy === "regime" ? qualityGap > 0 : regimeGap > 0;
  const hint = cash
    ? "The cash sleeve still has to reach Overweight. Name rank does not gate a cash buy."
    : blockedBy === "regime"
      ? otherStillOpen
        ? `The class is further from ready (${displayGap(regimeGap)}) than the name is (${displayGap(qualityGap)}).`
        : "The name is already ready. The class still has to give the entry signal."
      : otherStillOpen
        ? `The name is further from ready (${displayGap(qualityGap)}) than the class is (${displayGap(regimeGap)}).`
        : "The class is already favorable. This name still has to rank better vs its peers.";

  return make({
    state: "open",
    distance,
    blockedBy,
    regimeGap,
    qualityGap,
    value: displayGap(distance),
    axis: blockedBy === "regime" ? "Class" : "Name",
    hint,
  });
}

export function compareBuyProximity(
  a: BuyProximity,
  b: BuyProximity,
  scoreA = 0,
  scoreB = 0,
): number {
  const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
  if (rank !== 0) return rank;
  if (a.state === "open") {
    const da = a.distance ?? Number.POSITIVE_INFINITY;
    const db = b.distance ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
  }
  return scoreB - scoreA;
}
