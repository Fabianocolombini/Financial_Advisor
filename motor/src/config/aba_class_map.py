"""Motor aba id → catalog classId (watchlist / Home grouping)."""

ABA_TO_CLASS: dict[str, str] = {
    "taxas": "fi_treasury",
    "credito_alternativo": "alt_bdc",
    "cash_equivalents": "cash_equivalents",
    "fi_ig": "fi_ig",
    "fi_hy": "fi_hy",
    "reits": "real_estate",
    "us_equity": "us_equity",
}

CLASS_LABELS: dict[str, str] = {
    "fi_treasury": "Treasuries",
    "alt_bdc": "Alternative Credit (BDC)",
    "fi_ig": "IG Bonds",
    "fi_hy": "High Yield",
    "real_estate": "REITs",
    "us_equity": "US Equity",
    "cash_equivalents": "Cash",
    "fi_tips": "TIPS",
    "fi_preferred": "Preferred",
    "intl_equity": "Intl Equity",
    "em_equity": "Emerging Markets",
    "commodities_precious": "Precious Metals",
    "commodities_energy": "Energy",
    "energy_mlp": "MLP",
    "healthcare_biotech": "Biotech",
    "alt_infrastructure": "Infrastructure",
    "currencies": "FX",
    "unclassified": "Other",
}
