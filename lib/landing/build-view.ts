import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";
import { LANDING_GROUPS, type LandingGroupId } from "./taxonomy";

export type LandingIndexRow = {
  id: string;
  label: string;
  symbol: string;
  changePercent: number | null;
};

export type LandingGroupCard = {
  id: LandingGroupId;
  label: string;
  changePercent: number | null;
  sparkline: number[];
  regimeLabel: string | null;
  available: boolean;
};

export type LandingMover = {
  id: LandingGroupId;
  label: string;
  changePercent: number;
};

export type LandingViewModel = {
  asOf: string | null;
  indices: LandingIndexRow[];
  groups: LandingGroupCard[];
  movers: LandingMover[];
};

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function regimeLabel(action: string | null | undefined): string | null {
  switch (action) {
    case "Overweight":
    case "Accumulate":
    case "Ascendente":
      return "Aumentar";
    case "Hold":
    case "Maduro":
      return "Hold";
    case "Reduce":
    case "Descendente":
      return "Reduce";
    case "Strong Reduce":
    case "ForteDescendente":
      return "Reduce";
    default:
      return null;
  }
}

function modeRegime(labels: string[]): string | null {
  if (!labels.length) return null;
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [label, n] of counts) {
    if (n > bestN) {
      best = label;
      bestN = n;
    }
  }
  return best;
}

function sparklineFromHistories(
  histories: Array<Array<{ date: string; score: number }>>,
): number[] {
  const byDate = new Map<string, number[]>();
  for (const series of histories) {
    for (const point of series) {
      if (!Number.isFinite(point.score)) continue;
      const bucket = byDate.get(point.date) ?? [];
      bucket.push(point.score);
      byDate.set(point.date, bucket);
    }
  }
  const dates = [...byDate.keys()].sort();
  const last = dates.slice(-30);
  const out: number[] = [];
  for (const date of last) {
    const avg = mean(byDate.get(date) ?? []);
    if (avg != null) out.push(avg);
  }
  return out;
}

export function buildLandingGroups(snapshot: MotorDashboardSnapshot | null): {
  groups: LandingGroupCard[];
  movers: LandingMover[];
} {
  const groups: LandingGroupCard[] = LANDING_GROUPS.map((group) => {
    const changeParts: number[] = [];
    const histories: Array<Array<{ date: string; score: number }>> = [];
    const regimes: string[] = [];

    for (const classId of group.classIds) {
      const klass = snapshot?.classes[classId];
      if (klass) {
        const action = klass.allocationAction ?? klass.stageLabel ?? klass.stage;
        const label = regimeLabel(action);
        if (label) regimes.push(label);
        if (klass.scoreHistory?.length) histories.push(klass.scoreHistory);
      }

      if (!snapshot) continue;
      for (const tick of Object.values(snapshot.tickers)) {
        if (tick.classId !== classId) continue;
        if (tick.perf1dPct != null && Number.isFinite(tick.perf1dPct)) {
          changeParts.push(tick.perf1dPct);
        }
      }
    }

    const changePercent = mean(changeParts);
    const sparkline = sparklineFromHistories(histories);
    const regime = modeRegime(regimes);
    const available = changePercent != null || sparkline.length >= 2 || regime != null;

    return {
      id: group.id,
      label: group.label,
      changePercent,
      sparkline,
      regimeLabel: regime,
      available,
    };
  });

  const movers = groups
    .filter((g): g is LandingGroupCard & { changePercent: number } => g.changePercent != null)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 3)
    .map((g) => ({
      id: g.id,
      label: g.label,
      changePercent: g.changePercent,
    }));

  return { groups, movers };
}
