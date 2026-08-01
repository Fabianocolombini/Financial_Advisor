"""Motor aba id → catalog classId (watchlist / Home grouping)."""

ABA_TO_CLASS: dict[str, str] = {
    "taxas": "fi_treasury",
    "credito_alternativo": "alt_bdc",
    "cash_equivalents": "cash_equivalents",
    "fi_ig": "fi_ig",
    "fi_hy": "fi_hy",
    "reits": "real_estate",
    "us_equity": "us_equity",
    "fi_tips": "fi_tips",
    "healthcare_biotech": "healthcare_biotech",
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

CLASS_TO_ABA: dict[str, str] = {class_id: aba_id for aba_id, class_id in ABA_TO_CLASS.items()}

# Default benchmark for on-demand ticker scoring (EOD technical layer).
CLASS_BENCHMARK: dict[str, str] = {
    "fi_treasury": "AGG",
    "fi_ig": "AGG",
    "fi_hy": "AGG",
    "fi_tips": "AGG",
    "fi_preferred": "AGG",
    "cash_equivalents": "AGG",
    "alt_bdc": "AGG",
    "real_estate": "AGG",
    "us_equity": "SPY",
    "intl_equity": "SPY",
    "em_equity": "SPY",
    "healthcare_biotech": "SPY",
    "commodities_precious": "GLD",
    "commodities_energy": "USO",
    "energy_mlp": "SPY",
    "alt_infrastructure": "SPY",
    "currencies": "UUP",
}


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
