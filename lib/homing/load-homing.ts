import { CATALOG_INSTRUMENTS } from "@/lib/catalog/instruments";
import { ASSET_CLASS_TABS } from "@/lib/catalog/asset-classes";
import { fetchYahooChartCloses } from "@/lib/market/yahoo";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";
import { loadMotorDashboardSnapshot, loadMotorPreviousSnapshot } from "@/lib/motor/load-snapshot";
import { loadWalletView } from "@/lib/wallet/load-wallet-view";
import {
  buildHomingView,
  reconstructBookHistory,
  type HomingNameIndex,
  type HomingPriceBar,
  type HomingViewModel,
} from "./build-homing";

const BOOK_CHART_REVALIDATE_SEC = 3600;
const BOOK_CHART_DAYS = 50;

const CLASS_LABEL = Object.fromEntries(
  ASSET_CLASS_TABS.filter((tab) => tab.id !== "all").map((tab) => [tab.id, tab.label]),
);

const CATALOG_NAME = new Map(
  CATALOG_INSTRUMENTS.map((item) => [item.symbol.toUpperCase(), item.name]),
);

export function homingAppUrl(): string {
  const base = (
    process.env.AUTH_URL?.trim() ||
    "https://financial-advisor-sable.vercel.app"
  ).replace(/\/$/, "");
  return `${base}/homing`;
}

export function homingNames(): HomingNameIndex {
  return {
    name: (symbol) => CATALOG_NAME.get(symbol.toUpperCase()) ?? symbol,
    classLabel: (classId) => CLASS_LABEL[classId] ?? classId,
  };
}

async function loadBookHistoryBars(
  holdings: Array<{ symbol: string }>,
): Promise<Record<string, HomingPriceBar[]>> {
  const unique = [...new Set(holdings.map((row) => row.symbol.toUpperCase()))];
  if (unique.length === 0) return {};
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - BOOK_CHART_DAYS * 86400;
  const entries = await Promise.all(
    unique.map(async (symbol) => {
      try {
        const bars = await fetchYahooChartCloses(
          symbol,
          period1,
          period2,
          BOOK_CHART_REVALIDATE_SEC,
        );
        return [
          symbol,
          bars.map((bar) => ({ date: bar.date, value: bar.value })),
        ] as const;
      } catch {
        return [symbol, [] as HomingPriceBar[]] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export async function loadHomingView(userId: string): Promise<{
  view: HomingViewModel;
  snapshot: MotorDashboardSnapshot | null;
}> {
  const [wallet, current, previous] = await Promise.all([
    loadWalletView(userId),
    loadMotorDashboardSnapshot(),
    loadMotorPreviousSnapshot(),
  ]);
  const barsBySymbol = await loadBookHistoryBars(wallet.holdings);
  return {
    view: buildHomingView({
      holdings: wallet.holdings,
      current,
      previous,
      names: homingNames(),
      bookHistory: reconstructBookHistory(wallet.holdings, barsBySymbol),
    }),
    snapshot: current,
  };
}
