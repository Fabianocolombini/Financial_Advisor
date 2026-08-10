"""Load aba JSON configs."""

from __future__ import annotations

import json
from typing import Any

from motor.src.paths import aba_config_path, CONFIG_DIR
from motor.src.config.aba_class_map import ABA_LEGACY_ALIASES


def resolve_aba_config_id(aba_id: str) -> str:
    if aba_config_path(aba_id).is_file():
        return aba_id
    legacy = ABA_LEGACY_ALIASES.get(aba_id)
    if legacy and aba_config_path(legacy).is_file():
        return legacy
    return aba_id


def load_aba_config(aba_id: str) -> dict[str, Any]:
    resolved = resolve_aba_config_id(aba_id)
    path = aba_config_path(resolved)
    if not path.is_file():
        raise FileNotFoundError(f"Config aba não encontrada: {path}")
    return json.loads(path.read_text())


def load_fred_manifest() -> list[dict[str, str]]:
    path = CONFIG_DIR / "fred_series.json"
    return json.loads(path.read_text())


_CASH_TECNICOS_ABAS = frozenset({"cash_equivalents"})
_TREASURY_ABAS = frozenset({"fi_treasury"})
_IG_ABAS = frozenset({"fi_ig"})
_HY_ABAS = frozenset({"fi_hy"})
_TIPS_ABAS = frozenset({"fi_tips"})
_PREFERRED_ABAS = frozenset({"fi_preferred"})


def load_tecnicos_config(aba_id: str | None = None) -> dict[str, Any]:
    if aba_id and resolve_aba_config_id(aba_id) in _CASH_TECNICOS_ABAS:
        cash_path = CONFIG_DIR / "indicadores_tecnicos_cash.json"
        if cash_path.is_file():
            return json.loads(cash_path.read_text())
    path = CONFIG_DIR / "indicadores_tecnicos.json"
    return json.loads(path.read_text())


def is_cash_aba(aba_id: str) -> bool:
    return resolve_aba_config_id(aba_id) in _CASH_TECNICOS_ABAS


def is_treasury_aba(aba_id: str) -> bool:
    return resolve_aba_config_id(aba_id) in _TREASURY_ABAS


def is_ig_aba(aba_id: str) -> bool:
    return resolve_aba_config_id(aba_id) in _IG_ABAS


def is_hy_aba(aba_id: str) -> bool:
    return resolve_aba_config_id(aba_id) in _HY_ABAS


def is_tips_aba(aba_id: str) -> bool:
    return resolve_aba_config_id(aba_id) in _TIPS_ABAS


def is_preferred_aba(aba_id: str) -> bool:
    return resolve_aba_config_id(aba_id) in _PREFERRED_ABAS


def is_class_model_aba(aba_id: str) -> bool:
    return (
        is_cash_aba(aba_id)
        or is_treasury_aba(aba_id)
        or is_ig_aba(aba_id)
        or is_hy_aba(aba_id)
        or is_tips_aba(aba_id)
        or is_preferred_aba(aba_id)
    )


def _formula_series(formula: str) -> set[str]:
    """FRED series IDs required by a calculated formula (not yfinance tickers)."""
    named: dict[str, set[str]] = {
        "delta_DFF_90d": {"DFF", "FEDFUNDS"},
        "pe_EFA_div_SPY": set(),
        "pe_EEM_div_SPY": set(),
        "em_gdp_growth": set(),
        "preferred_spread": {"DGS10"},
        "breakeven_spot": {"DGS10", "DFII10"},
        "cpi_core_momentum_3m": {"CPILFESL"},
        "cpi_breakeven_gap": {"CPILFESL", "DGS10", "DFII10"},
        "kre_vs_spy_60d": set(),
        "delta_preferred_spread_20d": {"DGS10"},
        "tips_liquidity_proxy": set(),
        "embi_spread": {"DGS10"},
        "distribution_yield_spread": {"DGS10"},
        "rate_differential": {"DFF"},
        "real_yield_curve": {"DFII5", "DFII10", "DFII30"},
        "nareit_yield_spread": {"DGS10"},
        "hy_distress_proxy_score": {"BAMLH0A3HYC"},
        "bond_vol_proxy": set(),
        "reit_valuation_percentile": set(),
        "risk_reversal_proxy": set(),
        "private_funding_proxy": set(),
        "earnings_revision_proxy": set(),
        "delta_yield_real_20d": {"DFII10"},
        "delta_ig_spread_20d": {"BAMLC0A0CM"},
        "delta_hy_spread_20d": {"BAMLH0A0HYM2"},
        "hy_quality_ratio": {"BAMLH0A3HYC", "BAMLH0A0HYM2"},
    }
    if formula in named:
        return set(named[formula])
    if " - " in formula:
        left, right = formula.split(" - ", 1)
        return {left.strip(), right.strip()}
    if " + " in formula:
        return {p.strip() for p in formula.split(" + ")}
    # Bare FRED series id (e.g. DGS10) — uppercase tokens only
    if formula and formula.isupper() and formula.replace("_", "").isalnum():
        return {formula}
    return set()


def series_for_aba(aba: dict[str, Any]) -> set[str]:
    """Collect FRED series IDs referenced by aba indicators and formulas."""
    series: set[str] = set()
    for ind in aba.get("indicadores", []):
        if ind.get("fonte") == "fred" and ind.get("serie"):
            series.add(ind["serie"])
        if ind.get("fonte") == "calculado" and ind.get("formula"):
            series.update(_formula_series(ind["formula"]))
    return series
