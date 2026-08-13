/**
 * Pivot points — the five standard methods.
 *
 * Pivots turn the previous period's range into a price map for the next one: P is
 * the equilibrium level, R1..R3 are progressively harder ceilings and S1..S3 are
 * progressively firmer floors. They are useful as *targets* precisely because they
 * are known in advance and widely watched, unlike levels fitted to past price.
 *
 * All methods are computed from the previous completed period (day, week or month),
 * never from the period in progress, which would make them repaint intraday.
 */

export type PivotMethodId = "classic" | "fibonacci" | "camarilla" | "woodie" | "demark";

export type PivotLevelId = "R3" | "R2" | "R1" | "P" | "S1" | "S2" | "S3";

export const PIVOT_LEVEL_ORDER: PivotLevelId[] = ["R3", "R2", "R1", "P", "S1", "S2", "S3"];

export const PIVOT_METHODS: Array<{ id: PivotMethodId; label: string; description: string }> = [
  {
    id: "classic",
    label: "Classic",
    description:
      "Average of high, low, and close, with bands adding the period's range. It is the most widely used method, so it tends to attract orders.",
  },
  {
    id: "fibonacci",
    label: "Fibonacci",
    description:
      "The same central pivot, with bands at 38.2%, 61.8%, and 100% of the range. Often gives closer targets in low-volatility markets.",
  },
  {
    id: "camarilla",
    label: "Camarilla",
    description:
      "Narrow bands from the range multiplied by 1.1/12, 1.1/6, and 1.1/4, measured from the close (not the pivot). Designed for mean reversion, not breakout — so its levels can all sit above or below P.",
  },
  {
    id: "woodie",
    label: "Woodie",
    description:
      "Gives double weight to the close in the pivot calculation, which pulls the levels toward the last traded price.",
  },
  {
    id: "demark",
    label: "DeMark",
    description:
      "Conditional on the relationship between open and close; projects only one support and one resistance, leaving R2/R3 and S2/S3 undefined.",
  },
];

export type PivotSet = {
  method: PivotMethodId;
  levels: Record<PivotLevelId, number | null>;
};

export type PivotPeriodId = "daily" | "weekly" | "monthly";

export const PIVOT_PERIODS: Array<{ id: PivotPeriodId; label: string; caption: string }> = [
  { id: "daily", label: "Daily", caption: "previous session" },
  { id: "weekly", label: "Weekly", caption: "previous week" },
  { id: "monthly", label: "Monthly", caption: "previous month" },
];

export type PivotSourceBar = {
  date: string;
  value: number;
  open?: number;
  high?: number;
  low?: number;
};

export type PivotPeriodSummary = {
  open: number;
  high: number;
  low: number;
  close: number;
  from: string;
  to: string;
};

function barHigh(bar: PivotSourceBar): number {
  return bar.high != null && Number.isFinite(bar.high) ? bar.high : bar.value;
}

function barLow(bar: PivotSourceBar): number {
  return bar.low != null && Number.isFinite(bar.low) ? bar.low : bar.value;
}

function periodKey(date: string, period: PivotPeriodId): string {
  if (period === "monthly") return date.slice(0, 7);
  if (period === "daily") return date;
  // ISO week key: Thursday of the same week identifies the ISO year and week.
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * OHLC of the last *completed* period. The period currently in progress is
 * excluded, so the levels stay fixed until it closes.
 */
export function previousPeriodOhlc(
  bars: PivotSourceBar[],
  period: PivotPeriodId,
): PivotPeriodSummary | null {
  if (bars.length < 2) return null;

  const groups: Array<{ key: string; bars: PivotSourceBar[] }> = [];
  for (const bar of bars) {
    const key = periodKey(bar.date, period);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.bars.push(bar);
    else groups.push({ key, bars: [bar] });
  }
  if (groups.length < 2) return null;

  const target = groups[groups.length - 2]!.bars;
  if (!target.length) return null;

  let high = -Infinity;
  let low = Infinity;
  for (const bar of target) {
    high = Math.max(high, barHigh(bar));
    low = Math.min(low, barLow(bar));
  }
  const first = target[0]!;
  const last = target[target.length - 1]!;
  return {
    open: first.open ?? first.value,
    high,
    low,
    close: last.value,
    from: first.date,
    to: last.date,
  };
}

function emptyLevels(): Record<PivotLevelId, number | null> {
  return { R3: null, R2: null, R1: null, P: null, S1: null, S2: null, S3: null };
}

export function computePivotSet(method: PivotMethodId, ohlc: PivotPeriodSummary): PivotSet {
  const { open, high, low, close } = ohlc;
  const range = high - low;
  const levels = emptyLevels();

  if (method === "classic") {
    const p = (high + low + close) / 3;
    levels.P = p;
    levels.R1 = 2 * p - low;
    levels.S1 = 2 * p - high;
    levels.R2 = p + range;
    levels.S2 = p - range;
    levels.R3 = high + 2 * (p - low);
    levels.S3 = low - 2 * (high - p);
  } else if (method === "fibonacci") {
    const p = (high + low + close) / 3;
    levels.P = p;
    levels.R1 = p + 0.382 * range;
    levels.R2 = p + 0.618 * range;
    levels.R3 = p + range;
    levels.S1 = p - 0.382 * range;
    levels.S2 = p - 0.618 * range;
    levels.S3 = p - range;
  } else if (method === "camarilla") {
    const p = (high + low + close) / 3;
    levels.P = p;
    levels.R1 = close + (range * 1.1) / 12;
    levels.R2 = close + (range * 1.1) / 6;
    levels.R3 = close + (range * 1.1) / 4;
    levels.S1 = close - (range * 1.1) / 12;
    levels.S2 = close - (range * 1.1) / 6;
    levels.S3 = close - (range * 1.1) / 4;
  } else if (method === "woodie") {
    const p = (high + low + 2 * close) / 4;
    levels.P = p;
    levels.R1 = 2 * p - low;
    levels.S1 = 2 * p - high;
    levels.R2 = p + range;
    levels.S2 = p - range;
    levels.R3 = high + 2 * (p - low);
    levels.S3 = low - 2 * (high - p);
  } else {
    // DeMark: the base depends on where the period closed relative to its open.
    let x: number;
    if (close < open) x = high + 2 * low + close;
    else if (close > open) x = 2 * high + low + close;
    else x = high + low + 2 * close;
    levels.P = x / 4;
    levels.R1 = x / 2 - low;
    levels.S1 = x / 2 - high;
  }

  return { method, levels };
}

export type PivotTable = {
  period: PivotPeriodId;
  source: PivotPeriodSummary;
  sets: PivotSet[];
};

export function buildPivotTable(
  bars: PivotSourceBar[],
  period: PivotPeriodId = "daily",
): PivotTable | null {
  const source = previousPeriodOhlc(bars, period);
  if (!source || !Number.isFinite(source.high) || !Number.isFinite(source.low)) return null;
  return {
    period,
    source,
    sets: PIVOT_METHODS.map((m) => computePivotSet(m.id, source)),
  };
}

export type PivotTarget = {
  level: PivotLevelId;
  price: number;
  distancePct: number;
};

/**
 * Nearest pivot above and below the current price, averaged across the methods
 * that define each level. Used as the "next target" in the forecast: consensus
 * across methods is more robust than any single method's level.
 */
export function pivotTargets(
  table: PivotTable,
  price: number,
): { resistance: PivotTarget | null; support: PivotTarget | null } {
  const consensus = new Map<PivotLevelId, number>();
  for (const level of PIVOT_LEVEL_ORDER) {
    const values = table.sets
      .map((s) => s.levels[level])
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (values.length) {
      consensus.set(level, values.reduce((a, b) => a + b, 0) / values.length);
    }
  }

  let resistance: PivotTarget | null = null;
  let support: PivotTarget | null = null;
  for (const [level, value] of consensus) {
    const distancePct = ((value - price) / price) * 100;
    if (value > price && (!resistance || value < resistance.price)) {
      resistance = { level, price: value, distancePct };
    }
    if (value < price && (!support || value > support.price)) {
      support = { level, price: value, distancePct };
    }
  }
  return { resistance, support };
}
