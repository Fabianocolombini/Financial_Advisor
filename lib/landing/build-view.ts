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
  exchange: string;
  changePercent: number | null;
  change5d: number | null;
};

export type LandingClassCard = {
  classId: string;
  label: string;
  chartSymbol: string | null;
  changePercent: number | null;
  change5d: number | null;
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
const EXCHANGE_BY_SYMBOL = new Map(
  CATALOG_INSTRUMENTS.map((i) => [i.symbol, i.exchange] as const),
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
  field: "perf1dPct" | "perf7dPct",
): number | null {
  if (!snapshot) return null;
  const row =
    snapshot.tickers[symbol] ?? snapshot.tickers[symbol.toUpperCase()];
  const v = row?.[field];
  return v != null && Number.isFinite(v) ? v : null;
}

function catalogExchange(symbol: string): string {
  return (
    EXCHANGE_BY_SYMBOL.get(symbol) ??
    EXCHANGE_BY_SYMBOL.get(symbol.toUpperCase()) ??
    "NYSE"
  );
}

function toLandingTicker(
  symbol: string,
  classId: string,
  changePercent: number | null,
  change5d: number | null,
  name?: string,
  exchange?: string,
): LandingTicker {
  return {
    symbol,
    name: name ?? catalogName(symbol),
    classId,
    classLabel: classLabel(classId),
    exchange: exchange ?? catalogExchange(symbol),
    changePercent,
    change5d,
  };
}

export function rankMovers(
  tickers: LandingTicker[],
  horizon: "1d" | "5d",
  n = 10,
): LandingTicker[] {
  const key = horizon === "5d" ? "change5d" : "changePercent";
  return [...tickers]
    .filter((t) => t[key] != null)
    .sort((a, b) => Math.abs(b[key] ?? 0) - Math.abs(a[key] ?? 0))
    .slice(0, n);
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
      toLandingTicker(
        inst.symbol,
        tab.id,
        tickerChange(snapshot, inst.symbol, "perf1dPct"),
        tickerChange(snapshot, inst.symbol, "perf7dPct"),
        inst.name,
        inst.exchange,
      ),
    );

    const classMoves1d: number[] = [];
    const classMoves5d: number[] = [];
    if (snapshot) {
      for (const tick of Object.values(snapshot.tickers) as MotorTickerSnapshot[]) {
        if (tick.classId !== tab.id) continue;
        if (tick.perf1dPct != null && Number.isFinite(tick.perf1dPct)) {
          classMoves1d.push(tick.perf1dPct);
        }
        if (tick.perf7dPct != null && Number.isFinite(tick.perf7dPct)) {
          classMoves5d.push(tick.perf7dPct);
        }
      }
    }
    const fromFeatured1d = featured
      .map((f) => f.changePercent)
      .filter((v): v is number => v != null);
    const fromFeatured5d = featured
      .map((f) => f.change5d)
      .filter((v): v is number => v != null);
    const changePercent = mean(classMoves1d) ?? mean(fromFeatured1d);
    const change5d = mean(classMoves5d) ?? mean(fromFeatured5d);
    const available = changePercent != null || featured.some((f) => f.changePercent != null);

    return {
      classId: tab.id,
      label: tab.label,
      chartSymbol: featured[0]?.symbol ?? null,
      changePercent,
      change5d,
      featured,
      available,
    };
  });

  const tape: LandingTicker[] = [];
  if (snapshot) {
    for (const tick of Object.values(snapshot.tickers) as MotorTickerSnapshot[]) {
      if (
        (tick.perf1dPct == null || !Number.isFinite(tick.perf1dPct)) &&
        (tick.perf7dPct == null || !Number.isFinite(tick.perf7dPct))
      ) {
        continue;
      }
      tape.push(
        toLandingTicker(
          tick.symbol,
          tick.classId,
          tick.perf1dPct != null && Number.isFinite(tick.perf1dPct)
            ? tick.perf1dPct
            : null,
          tick.perf7dPct != null && Number.isFinite(tick.perf7dPct)
            ? tick.perf7dPct
            : null,
        ),
      );
    }
    tape.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  const top10 = rankMovers(tape, "1d");

  return { classes, tape, top10 };
}
