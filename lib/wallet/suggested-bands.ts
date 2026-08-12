/**
 * Next floor and next ceiling for a lot about to enter the wallet.
 *
 * The floor is a single number: the nearest support still below the current
 * price, taken from the same map the Forecast tab already draws (structure,
 * Fibonacci, consensus of pivot methods). The ceiling is the nearest resistance
 * above — it is allowed to be revised upward as price grows, which is why the
 * dock can offer "atualizar teto" later.
 */

import { buildPriceForecast } from "@/lib/market/forecast-model";
import { classScoreProfile } from "@/lib/motor/score-domain";
import { buildPivotTable, pivotTargets } from "@/lib/market/pivot-points";
import type { StructureBar } from "@/lib/market/price-structure";

export type SuggestedBand = {
  price: number;
  source: string;
};

export type SuggestedBands = {
  last: number | null;
  floor: SuggestedBand | null;
  ceiling: SuggestedBand | null;
  note: string | null;
};

type Candidate = SuggestedBand;

function nearestBelow(price: number, candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (c.price >= price) continue;
    if (!best || c.price > best.price) best = c;
  }
  return best;
}

function nearestAbove(price: number, candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (c.price <= price) continue;
    if (!best || c.price < best.price) best = c;
  }
  return best;
}

export function suggestWalletBands(
  bars: StructureBar[],
  classId: string,
  last: number | null,
): SuggestedBands {
  const price = last ?? (bars.length ? bars[bars.length - 1]!.value : null);
  if (price == null || !Number.isFinite(price) || bars.length < 30) {
    return {
      last: price,
      floor: null,
      ceiling: null,
      note: "Histórico insuficiente para sugerir piso e teto.",
    };
  }

  if (classScoreProfile(classId).stabilityFocused) {
    return {
      last: price,
      floor: null,
      ceiling: null,
      note: "Caixa não usa Fibonacci nem pivôs: o NAV não tem piso/teto de preço. Deixe em branco ou informe o seu próprio plano.",
    };
  }

  const forecast = buildPriceForecast({
    symbol: "",
    classId,
    bars,
    motorScore: null,
  });

  const floors: Candidate[] = [];
  const ceilings: Candidate[] = [];

  if (forecast.levels.nearestSupport != null) {
    floors.push({
      price: forecast.levels.nearestSupport,
      source: "suporte da estrutura (forecast)",
    });
  }
  if (forecast.levels.nearestResistance != null) {
    ceilings.push({
      price: forecast.levels.nearestResistance,
      source: "resistência da estrutura (forecast)",
    });
  }
  for (const fib of forecast.levels.fibonacci) {
    const label = `Fibonacci ${fib.label}`;
    if (fib.price < price) floors.push({ price: fib.price, source: label });
    if (fib.price > price) ceilings.push({ price: fib.price, source: label });
  }

  const table = buildPivotTable(bars, "daily");
  if (table) {
    const targets = pivotTargets(table, price);
    if (targets.support) {
      floors.push({
        price: targets.support.price,
        source: `pivô ${targets.support.level} (consenso)`,
      });
    }
    if (targets.resistance) {
      ceilings.push({
        price: targets.resistance.price,
        source: `pivô ${targets.resistance.level} (consenso)`,
      });
    }
  }

  return {
    last: price,
    floor: nearestBelow(price, floors),
    ceiling: nearestAbove(price, ceilings),
    note: null,
  };
}

export function formatBandPrice(value: number): string {
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}
