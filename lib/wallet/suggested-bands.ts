/**
 * Next floor, next ceiling, and the three resistances ahead of price.
 *
 * Levels come from the same map the Forecast tab already draws (structure,
 * Fibonacci, consensus of pivot methods). Cash skips Fibonacci and pivots —
 * the NAV barely swings — but still uses structure when the series has one.
 */

import { classScoreProfile } from "@/lib/motor/score-domain";
import {
  buildPivotTable,
  PIVOT_LEVEL_ORDER,
  type PivotLevelId,
} from "@/lib/market/pivot-points";
import {
  fibonacciLevels,
  supportResistance,
  type StructureBar,
} from "@/lib/market/price-structure";

export type SuggestedBand = {
  price: number;
  source: string;
};

export type SuggestedBands = {
  last: number | null;
  floor: SuggestedBand | null;
  ceiling: SuggestedBand | null;
  supports: SuggestedBand[];
  resistances: SuggestedBand[];
  note: string | null;
};

type Candidate = SuggestedBand;

function clusterKeepNearest(items: Candidate[], tolerancePct = 0.2): Candidate[] {
  const out: Candidate[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.price !== 0 &&
      (Math.abs(item.price - prev.price) / prev.price) * 100 < tolerancePct
    ) {
      continue;
    }
    out.push(item);
  }
  return out;
}

function nearestBelow(price: number, candidates: Candidate[], n: number): Candidate[] {
  const ranked = candidates
    .filter((c) => c.price < price && Number.isFinite(c.price))
    .sort((a, b) => b.price - a.price);
  return clusterKeepNearest(ranked).slice(0, n);
}

function nearestAbove(price: number, candidates: Candidate[], n: number): Candidate[] {
  const ranked = candidates
    .filter((c) => c.price > price && Number.isFinite(c.price))
    .sort((a, b) => a.price - b.price);
  return clusterKeepNearest(ranked).slice(0, n);
}

function pivotConsensusLevel(
  table: NonNullable<ReturnType<typeof buildPivotTable>>,
  level: PivotLevelId,
): number | null {
  const values = table.sets
    .map((s) => s.levels[level])
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function suggestWalletBands(
  bars: StructureBar[],
  classId: string,
  last: number | null,
): SuggestedBands {
  const empty = (note: string | null, price: number | null): SuggestedBands => ({
    last: price,
    floor: null,
    ceiling: null,
    supports: [],
    resistances: [],
    note,
  });

  const price = last ?? (bars.length ? bars[bars.length - 1]!.value : null);
  if (price == null || !Number.isFinite(price) || bars.length < 20) {
    return empty("Not enough history to suggest a floor and ceiling.", price);
  }

  const stability = classScoreProfile(classId).stabilityFocused;
  const structure = supportResistance(bars, price, 180);

  const floors: Candidate[] = structure.supports.map((value) => ({
    price: value,
    source: "structure support",
  }));
  const ceilings: Candidate[] = structure.resistances.map((value) => ({
    price: value,
    source: "structure resistance",
  }));

  if (!stability) {
    const fib = fibonacciLevels(
      structure.lastSwingLow?.price ?? null,
      structure.lastSwingHigh?.price ?? null,
    );
    for (const level of fib) {
      const label = `Fibonacci ${level.label}`;
      if (level.price < price) floors.push({ price: level.price, source: label });
      if (level.price > price) ceilings.push({ price: level.price, source: label });
    }
  }

  const table = buildPivotTable(bars, "daily");
  if (table) {
    for (const level of PIVOT_LEVEL_ORDER) {
      const value = pivotConsensusLevel(table, level);
      if (value == null) continue;
      if (level.startsWith("S") && value < price) {
        floors.push({ price: value, source: `pivot ${level} (consensus)` });
      }
      if (level.startsWith("R") && value > price) {
        ceilings.push({ price: value, source: `pivot ${level} (consensus)` });
      }
    }
  }

  const supports = nearestBelow(price, floors, 3);
  const resistances = nearestAbove(price, ceilings, 3);

  let note: string | null = null;
  if (stability) {
    note =
      supports.length || resistances.length
        ? "Cash: floor, ceiling, and resistances come from NAV structure and pivots (no Fibonacci)."
        : "Cash: NAV barely swings — no structure floor/ceiling. Enter your plan or leave blank.";
  }

  return {
    last: price,
    floor: supports[0] ?? null,
    ceiling: resistances[0] ?? null,
    supports,
    resistances,
    note,
  };
}

export function formatBandPrice(value: number): string {
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}
