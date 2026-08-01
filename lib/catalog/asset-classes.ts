import type { AssetClassTab } from "./types";

/** Tabs aligned with motor taxonomy (`motor/config/fontes_manifest.json`). */
export const ASSET_CLASS_TABS: AssetClassTab[] = [
  { id: "all", label: "All" },
  { id: "cash_equivalents", label: "Cash" },
  { id: "fi_treasury", label: "Treasuries" },
  { id: "fi_ig", label: "IG Bonds" },
  { id: "fi_hy", label: "High Yield" },
  { id: "fi_tips", label: "TIPS" },
  { id: "fi_preferred", label: "Preferred" },
  { id: "us_equity", label: "US Equity" },
  { id: "intl_equity", label: "Intl" },
  { id: "em_equity", label: "Emerging" },
  { id: "real_estate", label: "REITs" },
  { id: "commodities_precious", label: "Metals" },
  { id: "commodities_energy", label: "Energy" },
  { id: "energy_mlp", label: "MLP" },
  { id: "healthcare_biotech", label: "Biotech" },
  { id: "alt_bdc", label: "BDC" },
  { id: "alt_infrastructure", label: "Infra" },
  { id: "currencies", label: "FX" },
];

export const MOTOR_CLASS_IDS = ASSET_CLASS_TABS
  .map((t) => t.id)
  .filter((id) => id !== "all");
