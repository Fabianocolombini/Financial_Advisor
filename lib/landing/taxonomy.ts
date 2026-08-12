/**
 * Macro-groups for the public landing. The 17 motor classes stay intact in
 * Markets; the capa only shows five cards so a visitor can scan the book.
 */

export const LANDING_GROUPS = [
  {
    id: "fixed_income",
    label: "Renda Fixa",
    classIds: [
      "cash_equivalents",
      "fi_treasury",
      "fi_ig",
      "fi_hy",
      "fi_tips",
      "fi_preferred",
    ],
  },
  {
    id: "equities",
    label: "Renda Variável",
    classIds: ["us_equity", "intl_equity", "em_equity", "healthcare_biotech"],
  },
  {
    id: "commodities",
    label: "Commodities",
    classIds: ["commodities_precious", "commodities_energy", "energy_mlp"],
  },
  {
    id: "real_assets",
    label: "Real Assets",
    classIds: ["real_estate"],
  },
  {
    id: "alternatives",
    label: "Moedas / Alternativos",
    classIds: ["currencies", "alt_bdc", "alt_infrastructure"],
  },
] as const;

export type LandingGroupId = (typeof LANDING_GROUPS)[number]["id"];

/** Benchmarks already available via yfinance — no new vendor. */
export const LANDING_INDICES = [
  { id: "spx", label: "S&P 500", symbol: "^GSPC" },
  { id: "ndx", label: "Nasdaq 100", symbol: "^NDX" },
  { id: "dji", label: "Dow Jones", symbol: "^DJI" },
  { id: "vix", label: "VIX", symbol: "^VIX" },
  { id: "dxy", label: "DXY", symbol: "DX-Y.NYB" },
  { id: "us10y", label: "US10Y", symbol: "^TNX" },
] as const;
