"""Load aba JSON configs."""

from __future__ import annotations

import json
from typing import Any

from motor.src.paths import aba_config_path, CONFIG_DIR


def load_aba_config(aba_id: str) -> dict[str, Any]:
    path = aba_config_path(aba_id)
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
    import re

    if formula.startswith("delta_"):
        base = formula.replace("delta_", "").replace("_90d", "")
        return {base}
    return set(re.findall(r"[A-Z][A-Z0-9]+", formula))


def series_for_aba(aba: dict[str, Any]) -> set[str]:
    """Collect FRED series IDs referenced by aba indicators and formulas."""
    series: set[str] = set()
    for ind in aba.get("indicadores", []):
        if ind.get("fonte") == "fred" and ind.get("serie"):
            series.add(ind["serie"])
        if ind.get("fonte") == "calculado" and ind.get("formula"):
            series.update(_formula_series(ind["formula"]))
    return series
