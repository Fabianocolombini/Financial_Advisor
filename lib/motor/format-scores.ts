import type { MotorIndicatorSnapshot } from "./snapshot-types";

export type MotorRatingLevel =
  | "Strong Buy"
  | "Buy"
  | "Hold"
  | "Sell"
  | "Strong Sell";

export type IndicatorAction = "Buy" | "Sell" | "Neutral";

export function scoreToRating(score: number | null | undefined): MotorRatingLevel {
  if (score == null || !Number.isFinite(score)) return "Hold";
  if (score > 0.5) return "Strong Buy";
  if (score > 0.3) return "Buy";
  if (score < -0.5) return "Strong Sell";
  if (score < -0.3) return "Sell";
  return "Hold";
}

export function ratingIndex(level: MotorRatingLevel): number {
  switch (level) {
    case "Strong Sell":
      return 0;
    case "Sell":
      return 1;
    case "Hold":
      return 2;
    case "Buy":
      return 3;
    case "Strong Buy":
      return 4;
  }
}

export function indicatorActionFromContribution(
  contribution: number | null | undefined,
): IndicatorAction {
  if (contribution == null || !Number.isFinite(contribution)) return "Neutral";
  if (contribution > 0.02) return "Buy";
  if (contribution < -0.02) return "Sell";
  return "Neutral";
}

export function countIndicatorActions(indicators: MotorIndicatorSnapshot[]): {
  buy: number;
  neutral: number;
  sell: number;
} {
  let buy = 0;
  let neutral = 0;
  let sell = 0;
  for (const ind of indicators) {
    const action = indicatorActionFromContribution(ind.contribution);
    if (action === "Buy") buy += 1;
    else if (action === "Sell") sell += 1;
    else neutral += 1;
  }
  return { buy, neutral, sell };
}

export function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return score.toFixed(3);
}

export function formatIndicatorValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

export function stageBadgeClass(stageLabel: string): string {
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

export function entryBadgeClass(validated: boolean, hasMotorData: boolean): string {
  if (!hasMotorData) return "bg-zinc-900 text-zinc-500 ring-zinc-800";
  if (validated) return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/25";
  return "bg-zinc-800 text-zinc-400 ring-zinc-700";
}

export function ratingBadgeClass(level: MotorRatingLevel): string {
  switch (level) {
    case "Strong Buy":
    case "Buy":
      return "text-sky-400";
    case "Strong Sell":
    case "Sell":
      return "text-red-400";
    default:
      return "text-zinc-400";
  }
}

export function actionClass(action: IndicatorAction): string {
  switch (action) {
    case "Buy":
      return "text-sky-400";
    case "Sell":
      return "text-red-400";
    default:
      return "text-zinc-400";
  }
}
