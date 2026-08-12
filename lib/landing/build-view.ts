import type { MotorDashboardSnapshot, MotorTickerSnapshot } from "@/lib/motor/snapshot-types";
import { CATALOG_INSTRUMENTS, getCatalogInstrumentsByClass } from "@/lib/catalog/instruments";
import { LANDING_CLASS_ORDER, landingFeaturedCount } from "./taxonomy";

export type LandingIndexRow = {
  id: string;
  label: string;
  symbol: string;
  changePercent: number | null;
};

export type LandingTicker = {
  symbol: string;
  name: string;
  classId: string;
  classLabel: string;
  changePercent: number | null;
};

export type LandingClassCard = {
  classId: string;
  label: string;
  changePercent: number | null;
  featured: LandingTicker[];
  available: boolean;
};

export type LandingViewModel = {
  asOf: string | null;
  indices: LandingIndexRow[];
  tape: LandingTicker[];
  classes: LandingClassCard[];
  top10: LandingTicker[];
};

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const NAME_BY_SYMBOL = new Map(
  CATALOG_INSTRUMENTS.map((i) => [i.symbol, i.name] as const),
);

function catalogName(symbol: string): string {
  return NAME_BY_SYMBOL.get(symbol) ?? NAME_BY_SYMBOL.get(symbol.toUpperCase()) ?? symbol;
}

function classLabel(classId: string): string {
  return LANDING_CLASS_ORDER.find((t) => t.id === classId)?.label ?? classId;
}

function tickerChange(
  snapshot: MotorDashboardSnapshot | null,
  symbol: string,
): number | null {
  if (!snapshot) return null;
  const row =
    snapshot.tickers[symbol] ?? snapshot.tickers[symbol.toUpperCase()];
  const v = row?.perf1dPct;
  return v != null && Number.isFinite(v) ? v : null;
}

function toLandingTicker(
  symbol: string,
  classId: string,
  changePercent: number | null,
  name?: string,
): LandingTicker {
  return {
    symbol,
    name: name ?? catalogName(symbol),
    classId,
    classLabel: classLabel(classId),
    changePercent,
  };
}

export function buildLandingBook(snapshot: MotorDashboardSnapshot | null): {
  classes: LandingClassCard[];
  tape: LandingTicker[];
  top10: LandingTicker[];
} {
  const classes: LandingClassCard[] = LANDING_CLASS_ORDER.map((tab) => {
    const featuredInst = getCatalogInstrumentsByClass(tab.id).slice(
      0,
      landingFeaturedCount(tab.id),
    );
    const featured = featuredInst.map((inst) =>
      toLandingTicker(inst.symbol, tab.id, tickerChange(snapshot, inst.symbol), inst.name),
    );

    const classMoves: number[] = [];
    if (snapshot) {
      for (const tick of Object.values(snapshot.tickers) as MotorTickerSnapshot[]) {
        if (tick.classId !== tab.id) continue;
        if (tick.perf1dPct != null && Number.isFinite(tick.perf1dPct)) {
          classMoves.push(tick.perf1dPct);
        }
      }
    }
    const fromFeatured = featured
      .map((f) => f.changePercent)
      .filter((v): v is number => v != null);
    const changePercent = mean(classMoves) ?? mean(fromFeatured);
    const available = changePercent != null || featured.some((f) => f.changePercent != null);

    return {
      classId: tab.id,
      label: tab.label,
      changePercent,
      featured,
      available,
    };
  });

  const tape: LandingTicker[] = [];
  if (snapshot) {
    for (const tick of Object.values(snapshot.tickers) as MotorTickerSnapshot[]) {
      if (tick.perf1dPct == null || !Number.isFinite(tick.perf1dPct)) continue;
      tape.push(toLandingTicker(tick.symbol, tick.classId, tick.perf1dPct));
    }
    tape.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  const top10 = [...tape]
    .sort(
      (a, b) =>
        Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
    )
    .slice(0, 10);

  return { classes, tape, top10 };
}
