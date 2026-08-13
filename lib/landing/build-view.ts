import type {
  MotorClassSnapshot,
  MotorDashboardSnapshot,
  MotorTickerSnapshot,
} from "@/lib/motor/snapshot-types";
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
  /** Share of the names shown on this class card (0–100). */
  shareOfGroupPct: number | null;
  entryOpportunity: boolean;
};

export type LandingClassCard = {
  classId: string;
  label: string;
  chartSymbol: string | null;
  changePercent: number | null;
  change5d: number | null;
  /** Share of the Atlas mix across the 17 sleeves (0–100). */
  shareOfMixPct: number | null;
  entryOpportunity: boolean;
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
  extra?: {
    name?: string;
    exchange?: string;
    shareOfGroupPct?: number | null;
    entryOpportunity?: boolean;
  },
): LandingTicker {
  return {
    symbol,
    name: extra?.name ?? catalogName(symbol),
    classId,
    classLabel: classLabel(classId),
    exchange: extra?.exchange ?? catalogExchange(symbol),
    changePercent,
    change5d,
    shareOfGroupPct: extra?.shareOfGroupPct ?? null,
    entryOpportunity: extra?.entryOpportunity ?? false,
  };
}

/** Relative sleeve size from the motor's allocation stance. */
export function sleeveWeight(
  action?: string | null,
  stageLabel?: string | null,
): number {
  const raw = `${action ?? ""} ${stageLabel ?? ""}`.toLowerCase();
  if (raw.includes("strong reduce") || raw.includes("fortedescendente")) return 0.25;
  if (
    raw.includes("overweight") ||
    raw.includes("accumulate") ||
    raw.includes("ascendente")
  ) {
    return 1.5;
  }
  if (raw.includes("reduce") || raw.includes("descendente")) return 0.5;
  return 1;
}

export function normalizeShares(weights: Array<number | null>): Array<number | null> {
  const positive = weights.map((w) =>
    w != null && Number.isFinite(w) && w > 0 ? w : null,
  );
  const sum = positive.reduce<number>((acc, w) => acc + (w ?? 0), 0);
  if (sum <= 0) {
    const n = weights.length;
    if (n === 0) return [];
    return weights.map(() => 100 / n);
  }
  return positive.map((w) => (w == null ? null : (w / sum) * 100));
}

export function isEntryOpportunity(opts: {
  entryTiming?: string | null;
  entryValidated?: boolean;
  stageLabel?: string | null;
}): boolean {
  if (opts.entryTiming === "Buy") return true;
  if (opts.entryTiming === "Avoid" || opts.entryTiming === "Wait") return false;
  if (opts.entryValidated) return true;
  return opts.stageLabel === "Accumulate" || opts.stageLabel === "Ascendente";
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
    const classSnap: MotorClassSnapshot | undefined = snapshot?.classes[tab.id];
    const featuredWeights = featuredInst.map((inst) => {
      const row =
        snapshot?.tickers[inst.symbol] ??
        snapshot?.tickers[inst.symbol.toUpperCase()];
      const s = row?.score;
      return s != null && Number.isFinite(s) && s > 0 ? s : 1;
    });
    const featuredShares = normalizeShares(featuredWeights);

    const featured = featuredInst.map((inst, i) => {
      const row =
        snapshot?.tickers[inst.symbol] ??
        snapshot?.tickers[inst.symbol.toUpperCase()];
      return toLandingTicker(
        inst.symbol,
        tab.id,
        tickerChange(snapshot, inst.symbol, "perf1dPct"),
        tickerChange(snapshot, inst.symbol, "perf7dPct"),
        {
          name: inst.name,
          exchange: inst.exchange,
          shareOfGroupPct: featuredShares[i] ?? null,
          entryOpportunity: isEntryOpportunity({
            entryTiming: row?.entryTiming,
            entryValidated: row?.entryValidated,
            stageLabel: row?.stageLabel,
          }),
        },
      );
    });

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
      shareOfMixPct: null,
      entryOpportunity: isEntryOpportunity({
        entryTiming: classSnap?.entryTiming,
        entryValidated: classSnap?.entryValidated,
        stageLabel: classSnap?.stageLabel,
      }),
      featured,
      available,
    };
  });

  const mixShares = normalizeShares(
    classes.map((card) => {
      const classSnap = snapshot?.classes[card.classId];
      return sleeveWeight(classSnap?.allocationAction, classSnap?.stageLabel);
    }),
  );
  for (let i = 0; i < classes.length; i++) {
    classes[i]!.shareOfMixPct = mixShares[i] ?? null;
  }

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
          {
            entryOpportunity: isEntryOpportunity({
              entryTiming: tick.entryTiming,
              entryValidated: tick.entryValidated,
              stageLabel: tick.stageLabel,
            }),
          },
        ),
      );
    }
    tape.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  const top10 = rankMovers(tape, "1d");

  return { classes, tape, top10 };
}
