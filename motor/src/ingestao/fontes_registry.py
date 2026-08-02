"""Load and query fontes_manifest.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from motor.src.paths import CONFIG_DIR

_MANIFEST_PATH = CONFIG_DIR / "fontes_manifest.json"


def load_manifest() -> dict[str, Any]:
    return json.loads(_MANIFEST_PATH.read_text())


def all_fred_series(manifest: dict[str, Any] | None = None) -> set[str]:
    m = manifest or load_manifest()
    series: set[str] = set()
    # Base series needed for calculations
    series.update({"DGS10", "DGS2", "CPIAUCSL"})
    for cls in m.get("classes", []):
        for ind in cls.get("indicadores", []):
            if ind.get("fonte") == "fred" and ind.get("serie"):
                series.add(ind["serie"])
            if ind.get("fonte") == "calculado" and ind.get("formula"):
                series.update(_formula_deps(ind["formula"]))
    return series


def _formula_deps(formula: str) -> set[str]:
    import re

    if formula in ("pe_EFA_div_SPY", "pe_EEM_div_SPY", "em_gdp_growth"):
        return set()
    if formula.startswith("delta_"):
        return {formula.replace("delta_", "").replace("_90d", "")}
    return set(re.findall(r"[A-Z][A-Z0-9]+", formula))


def all_yfinance_tickers(manifest: dict[str, Any] | None = None) -> set[str]:
    m = manifest or load_manifest()
    tickers: set[str] = set(m.get("tickers_teste", {}).keys())
    for cls in m.get("classes", []):
        for ind in cls.get("indicadores", []):
            if ind.get("fonte") == "yfinance" and ind.get("ticker_proxy"):
                tickers.add(ind["ticker_proxy"].upper())
    return tickers


def edgar_tickers(manifest: dict[str, Any] | None = None) -> list[dict[str, str]]:
    m = manifest or load_manifest()
    out: list[dict[str, str]] = []
    for cls in m.get("classes", []):
        for ind in cls.get("indicadores", []):
            if ind.get("fonte") == "edgar" and ind.get("ticker_proxy"):
                out.append(
                    {
                        "ticker": ind["ticker_proxy"].upper(),
                        "metric": ind.get("metric", ""),
                        "class_id": cls["id"],
                    }
                )
    return out


def calculated_indicators(manifest: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    m = manifest or load_manifest()
    out: list[dict[str, Any]] = []
    for cls in m.get("classes", []):
        for ind in cls.get("indicadores", []):
            if ind.get("fonte") == "calculado":
                out.append({**ind, "class_id": cls["id"]})
    return out


def enabled_fontes(manifest: dict[str, Any] | None = None) -> list[str]:
    m = manifest or load_manifest()
    fontes = m.get("fontes", {})
    enabled = [k for k, v in fontes.items() if v.get("enabled")]
    return sorted(enabled, key=lambda k: fontes[k].get("priority", 99))
