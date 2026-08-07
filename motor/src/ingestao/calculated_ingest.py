"""Persist calculated indicators from manifest to raw_series."""

from __future__ import annotations

import datetime as dt

from motor.src.calculo.derivados import compute_formula
from motor.src.calculo.proxy_indicators import is_proxy_formula
from motor.src.ingestao.fontes_registry import calculated_indicators, load_manifest


def persist_calculated(conn) -> dict[str, int]:
    counts: dict[str, int] = {}
    for ind in calculated_indicators():
        formula = ind.get("formula", "")
        if not formula or is_proxy_formula(formula):
            continue
        series = compute_formula(formula)
        if series.empty:
            counts[ind["id"]] = 0
            continue
        serie_name = f"CALC_{ind['id']}"
        n = 0
        for date_idx, val in series.dropna().items():
            d = date_idx.isoformat() if hasattr(date_idx, "isoformat") else str(date_idx)
            conn.execute(
                "INSERT OR REPLACE INTO raw_series (data, serie, valor) VALUES (?, ?, ?)",
                (d, serie_name, float(val)),
            )
            n += 1
        counts[ind["id"]] = n
    return counts


def persist_calculated_latest(conn) -> dict[str, float]:
    """Store only latest value per calculated indicator."""
    out: dict[str, float] = {}
    for ind in calculated_indicators():
        formula = ind.get("formula", "")
        if not formula or is_proxy_formula(formula):
            continue
        series = compute_formula(formula)
        if series.empty:
            continue
        val = float(series.iloc[-1])
        serie_name = f"CALC_{ind['id']}"
        today = dt.date.today().isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO raw_series (data, serie, valor) VALUES (?, ?, ?)",
            (today, serie_name, val),
        )
        out[ind["id"]] = val
    return out
