import { CATALOG_INSTRUMENTS } from "@/lib/catalog/instruments";
import { ASSET_CLASS_TABS } from "@/lib/catalog/asset-classes";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";
import { loadMotorDashboardSnapshot, loadMotorPreviousSnapshot } from "@/lib/motor/load-snapshot";
import { loadWalletView } from "@/lib/wallet/load-wallet-view";
import {
  buildHomingView,
  type HomingNameIndex,
  type HomingViewModel,
} from "./build-homing";

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

export async function loadHomingView(userId: string): Promise<{
  view: HomingViewModel;
  snapshot: MotorDashboardSnapshot | null;
}> {
  const [wallet, current, previous] = await Promise.all([
    loadWalletView(userId),
    loadMotorDashboardSnapshot(),
    loadMotorPreviousSnapshot(),
  ]);
  return {
    view: buildHomingView({
      holdings: wallet.holdings,
      current,
      previous,
      names: homingNames(),
    }),
    snapshot: current,
  };
}
