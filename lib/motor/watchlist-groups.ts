import { ASSET_CLASS_TABS } from "@/lib/catalog/asset-classes";
import type {
  MotorDashboardSnapshot,
  WatchlistClassGroup,
  WatchlistRow,
} from "./snapshot-types";
import type { SymbolMarketEnrichment } from "./enrich-yahoo-perf";

const CLASS_LABEL: Record<string, string> = Object.fromEntries(
  ASSET_CLASS_TABS.filter((t) => t.id !== "all").map((t) => [t.id, t.label]),
);

const CLASS_ORDER = ASSET_CLASS_TABS.map((t) => t.id).filter((id) => id !== "all");

type WatchlistItem = {
  id: string;
  symbol: string;
  classId: string;
  name: string;
  exchange: string | null;
  kind: string | null;
};

function labelForClass(classId: string, snapshot: MotorDashboardSnapshot | null): string {
  if (snapshot?.classes[classId]?.label) return snapshot.classes[classId].label;
  return CLASS_LABEL[classId] ?? classId;
}

export function buildWatchlistGroups(
  items: WatchlistItem[],
  snapshot: MotorDashboardSnapshot | null,
  yahooMarketBySymbol?: Map<string, SymbolMarketEnrichment>,
): WatchlistClassGroup[] {
  if (items.length === 0) return [];

  const byClass = new Map<string, WatchlistItem[]>();
  for (const item of items) {
    const list = byClass.get(item.classId) ?? [];
    list.push(item);
    byClass.set(item.classId, list);
  }

  const classIds = [
    ...CLASS_ORDER.filter((id) => byClass.has(id)),
    ...[...byClass.keys()].filter((id) => !CLASS_ORDER.includes(id)),
  ];

  const groups: WatchlistClassGroup[] = [];

  for (const classId of classIds) {
    const classItems = byClass.get(classId) ?? [];
    const classSnap = snapshot?.classes[classId];

    const rows: WatchlistRow[] = classItems.map((item) => {
      const sym = item.symbol.toUpperCase();
      const tick = snapshot?.tickers[sym];
      const hasTickerMotor = Boolean(tick?.score != null && tick?.data);
      const hasClassMotor = Boolean(
        classSnap?.score != null && classSnap?.data,
      );
      const hasMotorData = hasTickerMotor || hasClassMotor;
      const yahooMarket = yahooMarketBySymbol?.get(sym);

      const tickerInds = tick?.allIndicators ?? tick?.indicators ?? [];
      const classInds = classSnap?.allIndicators ?? classSnap?.indicators ?? [];
      const indicators = tickerInds.length > 0 ? tickerInds : classInds;

      const entryValidated = hasTickerMotor
        ? tick!.entryValidated ?? false
        : hasClassMotor
          ? classSnap!.entryValidated ?? false
          : false;

      const stageLabel = hasTickerMotor
        ? tick!.stageLabel ?? "Hold"
        : hasClassMotor
          ? classSnap!.stageLabel ?? "Hold"
          : "Analyzing";

      return {
        id: item.id,
        symbol: item.symbol,
        classId: item.classId,
        name: item.name,
        exchange: item.exchange,
        kind: item.kind,
        score: tick?.score ?? classSnap?.score ?? null,
        stage: tick?.stage ?? classSnap?.stage ?? null,
        stageLabel,
        divergesFromClass: tick?.divergesFromClass ?? false,
        entryValidated,
        entryTiming: hasTickerMotor
          ? tick!.entryTiming ?? null
          : (classSnap?.entryTiming ?? null),
        instrumentQuality: hasTickerMotor ? tick!.instrumentQuality ?? null : null,
        dominantIndicator:
          tick?.dominantIndicator ?? classSnap?.dominantIndicator ?? null,
        rationale: tick?.rationale ?? classSnap?.rationale ?? [],
        perf1dPct: tick?.perf1dPct ?? yahooMarket?.perf1dPct ?? null,
        perf7dPct: tick?.perf7dPct ?? yahooMarket?.perf7dPct ?? null,
        perf15dPct: tick?.perf15dPct ?? yahooMarket?.perf15dPct ?? null,
        perf1mPct: tick?.perf1mPct ?? null,
        avgVolumeShares: yahooMarket?.avgVolumeShares ?? null,
        volumeSharePct: null,
        indicators,
        hasMotorData,
        motorScope: hasTickerMotor ? "ticker" : hasClassMotor ? "class" : "none",
      };
    });

    rows.sort((a, b) => {
      const sa = a.score ?? -999;
      const sb = b.score ?? -999;
      return sb - sa;
    });

    const totalClassVolume = rows.reduce(
      (sum, row) => sum + (row.avgVolumeShares ?? 0),
      0,
    );
    if (totalClassVolume > 0) {
      for (const row of rows) {
        row.volumeSharePct =
          row.avgVolumeShares != null
            ? (row.avgVolumeShares / totalClassVolume) * 100
            : null;
      }
    }

    groups.push({
      classId,
      label: labelForClass(classId, snapshot),
      classScore: classSnap?.score ?? null,
      classStageLabel: classSnap?.stageLabel ?? null,
      classAllocationScore:
        classSnap?.allocationScore ??
        classSnap?.regimeModel?.score ??
        classSnap?.score ??
        null,
      classAllocationAction:
        classSnap?.allocationAction ??
        classSnap?.regimeModel?.action ??
        classSnap?.stageLabel ??
        null,
      classEntryValidated: classSnap?.entryValidated ?? null,
      classDominantIndicator: classSnap?.dominantIndicator ?? null,
      classIndicators: classSnap?.indicators ?? [],
      rows,
    });
  }

  return groups;
}
