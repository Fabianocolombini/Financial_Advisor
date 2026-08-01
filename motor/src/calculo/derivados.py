"""Derived / calculated indicators from raw_series."""

from __future__ import annotations

import datetime as dt

import pandas as pd

from motor.src.db.connection import get_connection


def _series_from_db(serie: str) -> pd.Series:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT data, valor FROM raw_series WHERE serie = ? ORDER BY data",
            (serie,),
        ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["valor"]) for r in rows]
    return pd.Series(vals, index=dates)


def get_fred_series(serie: str) -> pd.Series:
    return _series_from_db(serie)


def compute_formula(formula: str) -> pd.Series:
    if formula == "delta_DFF_90d":
        s = _series_from_db("DFF")
        if s.empty:
            s = _series_from_db("FEDFUNDS")
        return s - s.shift(90)
    if formula == "pe_EFA_div_SPY":
        return _pe_ratio_ratio("EFA", "SPY")
    if " - " in formula:
        left, right = formula.split(" - ", 1)
        a = _series_from_db(left.strip())
        b = _series_from_db(right.strip())
        if a.empty or b.empty:
            return pd.Series(dtype=float)
        combined = pd.concat([a, b], axis=1, join="inner")
        return combined.iloc[:, 0] - combined.iloc[:, 1]
    if " + " in formula:
        parts = formula.split(" + ")
        series_list = [_series_from_db(p.strip()) for p in parts]
        if any(s.empty for s in series_list):
            return pd.Series(dtype=float)
        combined = pd.concat(series_list, axis=1, join="inner")
        return combined.sum(axis=1)
    return _series_from_db(formula)


def _pe_ratio_ratio(ticker_a: str, ticker_b: str) -> pd.Series:
    with get_connection() as conn:
        a = conn.execute(
            "SELECT valor FROM yfinance_snapshot WHERE ticker = ? AND field = 'pe_ratio' ORDER BY data DESC LIMIT 1",
            (ticker_a.upper(),),
        ).fetchone()
        b = conn.execute(
            "SELECT valor FROM yfinance_snapshot WHERE ticker = ? AND field = 'pe_ratio' ORDER BY data DESC LIMIT 1",
            (ticker_b.upper(),),
        ).fetchone()
    if not a or not b or float(b["valor"]) == 0:
        return pd.Series(dtype=float)
    val = float(a["valor"]) / float(b["valor"])
    today = dt.date.today()
    return pd.Series([val], index=[today])


def latest_raw_value(serie: str) -> float | None:
    s = _series_from_db(serie)
    if s.empty:
        return None
    return float(s.iloc[-1])
