"""Motor aba id → catalog classId (watchlist / Home grouping)."""

ABA_TO_CLASS: dict[str, str] = {
    "fi_treasury": "fi_treasury",
    "credito_alternativo": "alt_bdc",
    "cash_equivalents": "cash_equivalents",
    "fi_ig": "fi_ig",
    "fi_hy": "fi_hy",
    "reits": "real_estate",
    "us_equity": "us_equity",
    "fi_tips": "fi_tips",
    "healthcare_biotech": "healthcare_biotech",
    "commodities_precious": "commodities_precious",
    "commodities_energy": "commodities_energy",
    "currencies": "currencies",
    "fi_preferred": "fi_preferred",
    "intl_equity": "intl_equity",
    "em_equity": "em_equity",
    "alt_infrastructure": "alt_infrastructure",
}

# SQLite rows written before rename taxas → fi_treasury
ABA_LEGACY_ALIASES: dict[str, str] = {
    "taxas": "fi_treasury",
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
    "intl_equity": "International",
    "em_equity": "Emerging Markets",
    "commodities_precious": "Precious Metals",
    "commodities_energy": "Energy",
    "energy_mlp": "MLP",
    "healthcare_biotech": "Biotech",
    "alt_infrastructure": "Infrastructure",
    "currencies": "FX",
    "unclassified": "Other",
}

CLASS_TO_ABA: dict[str, str] = {class_id: aba_id for aba_id, class_id in ABA_TO_CLASS.items()}

# Sector benchmarks for technical score (relative strength within sleeve).
CLASS_BENCHMARK: dict[str, str] = {
    "fi_treasury": "AGG",
    "fi_ig": "AGG",
    "fi_hy": "AGG",
    "fi_tips": "AGG",
    "fi_preferred": "AGG",
    "cash_equivalents": "AGG",
    "alt_bdc": "HYG",
    "real_estate": "VNQ",
    "us_equity": "SPY",
    "intl_equity": "SPY",
    "em_equity": "SPY",
    "healthcare_biotech": "SPY",
    "commodities_precious": "GLD",
    "commodities_energy": "USO",
    "energy_mlp": "AMLP",
    "alt_infrastructure": "IGF",
    "currencies": "UUP",
}


def class_id_for_aba(aba_id: str) -> str:
    """Resolve motor aba_id to catalog classId (handles legacy names)."""
    if aba_id in ABA_TO_CLASS:
        return ABA_TO_CLASS[aba_id]
    if aba_id in ABA_LEGACY_ALIASES:
        return ABA_LEGACY_ALIASES[aba_id]
    return aba_id


def resolve_aba_id(class_id: str) -> str | None:
    """Map catalog classId to motor aba config id."""
    if class_id in CLASS_TO_ABA:
        return CLASS_TO_ABA[class_id]
    from motor.src.paths import aba_config_path

    if aba_config_path(class_id).is_file():
        return class_id
    return None


def benchmark_for_class(class_id: str) -> str:
    return CLASS_BENCHMARK.get(class_id, "AGG")
