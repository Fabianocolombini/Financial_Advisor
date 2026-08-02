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


def load_tecnicos_config() -> dict[str, Any]:
    path = CONFIG_DIR / "indicadores_tecnicos.json"
    return json.loads(path.read_text())


def _formula_series(formula: str) -> set[str]:
    """FRED series IDs required by a calculated formula (not yfinance tickers)."""
    # Named formulas — explicit deps; pe_* and em_gdp use yfinance / World Bank
    named: dict[str, set[str]] = {
        "delta_DFF_90d": {"DFF", "FEDFUNDS"},
        "pe_EFA_div_SPY": set(),
        "pe_EEM_div_SPY": set(),
        "em_gdp_growth": set(),
    }
    if formula in named:
        return set(named[formula])
    if " - " in formula:
        left, right = formula.split(" - ", 1)
        return {left.strip(), right.strip()}
    if " + " in formula:
        return {p.strip() for p in formula.split(" + ")}
    # Bare FRED series id (e.g. DGS10)
    if formula and formula.replace("_", "").isalnum():
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
