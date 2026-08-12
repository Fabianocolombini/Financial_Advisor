import { ASSET_CLASS_TABS } from "@/lib/catalog/asset-classes";

/** How many “most important” names to pin on the capa for each class. */
export function landingFeaturedCount(classId: string): number {
  if (
    classId === "us_equity" ||
    classId === "intl_equity" ||
    classId === "em_equity"
  ) {
    return 5;
  }
  return 3;
}

export const LANDING_CLASS_ORDER = ASSET_CLASS_TABS.filter((t) => t.id !== "all");

/** Benchmarks already available via yfinance — no new vendor. */
export const LANDING_INDICES = [
  { id: "spx", label: "S&P 500", symbol: "^GSPC" },
  { id: "ndx", label: "Nasdaq 100", symbol: "^NDX" },
  { id: "dji", label: "Dow Jones", symbol: "^DJI" },
  { id: "vix", label: "VIX", symbol: "^VIX" },
  { id: "dxy", label: "DXY", symbol: "DX-Y.NYB" },
  { id: "us10y", label: "US10Y", symbol: "^TNX" },
] as const;
