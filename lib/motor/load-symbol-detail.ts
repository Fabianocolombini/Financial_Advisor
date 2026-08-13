import { ASSET_CLASS_TABS } from "@/lib/catalog/asset-classes";
import { CATALOG_INSTRUMENTS } from "@/lib/catalog/instruments";
import {
  mergeIndicatorPools,
  normalizeIndicatorSnapshot,
  regimeComponentsToIndicators,
} from "@/lib/motor/normalize-indicators";
import { buildClassDataEquation } from "@/lib/motor/class-data-equation";
import { computeDecisionReliability } from "@/lib/motor/reliability-audit";
import { computeTechnicalSummary } from "@/lib/market/technical-summary";
import { perfHorizonsFromBars } from "@/lib/market/perf-horizons";
import { fetchYahooChart } from "@/lib/market/yahoo";
import { buildPriceForecast } from "@/lib/market/forecast-model";
import { fetchYahooQuoteSummaryCached } from "@/lib/market/yahoo-quote";
import { loadSymbolFinancialsCached } from "@/lib/market/load-symbol-financials";
import { loadMotorDashboardSnapshot } from "@/lib/motor/load-snapshot";
import type {
  MotorClassSnapshot,
  MotorIndicatorSnapshot,
  MotorTickerSnapshot,
  SymbolDetailView,
  SymbolMotorContext,
} from "@/lib/motor/snapshot-types";
import { prisma } from "@/lib/prisma";

const CLASS_LABEL: Record<string, string> = Object.fromEntries(
  ASSET_CLASS_TABS.filter((t) => t.id !== "all").map((t) => [t.id, t.label]),
);

const CHART_REVALIDATE_SEC = 300;
const TWO_YEARS_SEC = 730 * 86400;

function findCatalogSymbol(symbol: string) {
  const sym = symbol.toUpperCase();
  return CATALOG_INSTRUMENTS.find((i) => i.symbol.toUpperCase() === sym);
}

function labelForClass(
  classId: string,
  snapshot: Awaited<ReturnType<typeof loadMotorDashboardSnapshot>>,
): string {
  if (snapshot?.classes[classId]?.label) return snapshot.classes[classId].label;
  return CLASS_LABEL[classId] ?? classId;
}

function pickAllIndicators(
  snap: MotorClassSnapshot | MotorTickerSnapshot | null,
): MotorIndicatorSnapshot[] {
  if (!snap) return [];
  return snap.allIndicators ?? snap.indicators ?? [];
}

function topDrivers(
  classInds: MotorIndicatorSnapshot[],
  tickerInds: MotorIndicatorSnapshot[],
): MotorIndicatorSnapshot[] {
  const seen = new Set<string>();
  const merged: MotorIndicatorSnapshot[] = [];
  for (const ind of [...tickerInds, ...classInds]) {
    if (seen.has(ind.id)) continue;
    seen.add(ind.id);
    merged.push(ind);
    if (merged.length >= 8) break;
  }
  return merged;
}

function buildMotorContext(
  symbol: string,
  classId: string,
  snapshot: Awaited<ReturnType<typeof loadMotorDashboardSnapshot>>,
): SymbolMotorContext {
  const sym = symbol.toUpperCase();
  const tick: MotorTickerSnapshot | null = snapshot?.tickers[sym] ?? null;
  const classSnap: MotorClassSnapshot | null =
    snapshot?.classes[classId] ?? snapshot?.classes[tick?.classId ?? ""] ?? null;

  const hasTickerMotor = Boolean(tick?.score != null && tick?.data);
  const hasClassMotor = Boolean(classSnap?.score != null && classSnap?.data);
  const motorScope: SymbolMotorContext["motorScope"] = hasTickerMotor
    ? "ticker"
    : hasClassMotor
      ? "class"
      : "none";

  const classIndicators = mergeIndicatorPools([
    pickAllIndicators(classSnap).map((i) => normalizeIndicatorSnapshot(i)),
    regimeComponentsToIndicators(classSnap?.regimeModel?.components),
  ]);
  const tickerIndicators = pickAllIndicators(tick).map((i) =>
    normalizeIndicatorSnapshot(i),
  );
  const indicators = topDrivers(classIndicators, tickerIndicators);

  return {
    classId,
    hasTickerMotor,
    hasClassMotor,
    motorScope,
    ticker: tick,
    classSnap,
    score: tick?.score ?? classSnap?.score ?? null,
    // The allocation action is derived from the live regime score, so prefer it
    // over the persisted series to keep the number consistent with the action.
    classScore: classSnap?.allocationScore ?? classSnap?.score ?? null,
    stageLabel: hasTickerMotor
      ? tick!.stageLabel ?? "Hold"
      : hasClassMotor
        ? classSnap!.stageLabel ?? "Hold"
        : "Analyzing",
    classStageLabel: classSnap?.stageLabel ?? "Analyzing",
    stage: tick?.stage ?? classSnap?.stage ?? null,
    entryValidated: hasTickerMotor
      ? tick!.entryValidated ?? false
      : hasClassMotor
        ? classSnap!.entryValidated ?? false
        : false,
    classEntryValidated: classSnap?.entryValidated ?? false,
    divergesFromClass: tick?.divergesFromClass ?? false,
    dominantIndicator:
      tick?.dominantIndicator ?? classSnap?.dominantIndicator ?? null,
    classDominantIndicator: classSnap?.dominantIndicator ?? null,
    rationale: tick?.rationale ?? classSnap?.rationale ?? [],
    classRationale: classSnap?.rationale ?? [],
    indicators,
    classIndicators,
    tickerIndicators,
    classScoreHistory: classSnap?.scoreHistory ?? [],
    tickerScoreHistory: tick?.scoreHistory ?? [],
    decision: {
      scoreDomain: tick?.scoreDomain ?? classSnap?.scoreDomain,
      allocationAction: classSnap?.allocationAction ?? tick?.allocationAction,
      instrumentQuality: tick?.instrumentQuality,
      entryTiming: tick?.entryTiming,
      entryReasons: tick?.entryReasons ?? [],
      peerMedian: tick?.peerMedian,
    },
    perf1dPct: tick?.perf1dPct ?? null,
    perf7dPct: tick?.perf7dPct ?? null,
    perf15dPct: tick?.perf15dPct ?? null,
    perf1mPct: tick?.perf1mPct ?? null,
  };
}

export async function loadSymbolDetailView(
  userId: string,
  symbol: string,
): Promise<SymbolDetailView | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const [watchlistItem, snapshot] = await Promise.all([
    prisma.userWatchlistItem.findFirst({
      where: { userId, symbol: sym },
    }),
    loadMotorDashboardSnapshot(),
  ]);

  const catalog = findCatalogSymbol(sym);
  const classId =
    watchlistItem?.classId ??
    catalog?.classId ??
    snapshot?.tickers[sym]?.classId ??
    "us_equity";
  const name = watchlistItem?.name ?? catalog?.name ?? sym;
  const exchange = watchlistItem?.exchange ?? catalog?.exchange ?? null;
  const kind = watchlistItem?.kind ?? catalog?.kind ?? null;

  const motor = buildMotorContext(sym, classId, snapshot);

  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - TWO_YEARS_SEC;

  let bars: Awaited<ReturnType<typeof fetchYahooChart>>["bars"] = [];
  let distributions: Awaited<ReturnType<typeof fetchYahooChart>>["distributions"] = [];
  const [quote, financials] = await Promise.all([
    fetchYahooQuoteSummaryCached(sym),
    loadSymbolFinancialsCached(sym),
  ]);
  let yahooWarning: string | undefined;

  try {
    const chart = await fetchYahooChart(sym, period1, period2, CHART_REVALIDATE_SEC);
    bars = chart.bars;
    distributions = chart.distributions;
  } catch (err) {
    yahooWarning =
      err instanceof Error ? err.message : "Failed to fetch price history.";
  }

  if (quote.error) {
    yahooWarning = yahooWarning
      ? `${yahooWarning}; ${quote.error}`
      : quote.error;
  }

  if (financials.warnings.length) {
    const finWarn = financials.warnings.join("; ");
    yahooWarning = yahooWarning ? `${yahooWarning}; ${finWarn}` : finWarn;
  }

  const perfHorizons = perfHorizonsFromBars(bars);
  const technicalRows = computeTechnicalSummary(bars);

  const reliability = computeDecisionReliability({
    motor,
    snapshot,
    quote,
    classId,
    yahooWarning,
  });

  const dataEquation = buildClassDataEquation(
    classId,
    motor.classIndicators,
    motor.tickerIndicators,
  );

  const forecast = buildPriceForecast({
    symbol: sym,
    classId,
    bars,
    adjustedCloses: bars.map((b) => b.adjClose),
    motorScore: motor.score,
    classIndicators: motor.classIndicators,
    reliabilityScore: reliability.score,
  });

  return {
    symbol: sym,
    name,
    classId,
    classLabel: labelForClass(classId, snapshot),
    exchange,
    kind,
    inWatchlist: Boolean(watchlistItem),
    snapshot,
    motor,
    bars: bars.map((b) => ({
      date: b.date,
      value: b.value,
      volume: b.volume,
      high: b.high,
      low: b.low,
      adjClose: b.adjClose,
    })),
    distributions,
    perfHorizons,
    quote,
    financials,
    technicalRows,
    forecast,
    yahooWarning,
    reliability,
    dataEquation,
  };
}
