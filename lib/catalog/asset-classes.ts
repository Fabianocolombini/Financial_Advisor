import type { AssetClassTab } from "./types";

/** Abas alinhadas à taxonomia do motor (`motor/config/fontes_manifest.json`). */
export const ASSET_CLASS_TABS: AssetClassTab[] = [
  { id: "all", label: "Todos" },
  { id: "cash_equivalents", label: "Caixa" },
  { id: "fi_treasury", label: "Treasuries" },
  { id: "fi_ig", label: "RF IG" },
  { id: "fi_hy", label: "High Yield" },
  { id: "fi_tips", label: "TIPS" },
  { id: "fi_preferred", label: "Preferred" },
  { id: "us_equity", label: "Ações US" },
  { id: "intl_equity", label: "Intl" },
  { id: "em_equity", label: "Emergentes" },
  { id: "real_estate", label: "REITs" },
  { id: "commodities_precious", label: "Metais" },
  { id: "commodities_energy", label: "Energia" },
  { id: "energy_mlp", label: "MLP" },
  { id: "healthcare_biotech", label: "Biotech" },
  { id: "alt_bdc", label: "BDC" },
  { id: "alt_infrastructure", label: "Infra" },
  { id: "currencies", label: "FX" },
];

export const MOTOR_CLASS_IDS = ASSET_CLASS_TABS
  .map((t) => t.id)
  .filter((id) => id !== "all");
