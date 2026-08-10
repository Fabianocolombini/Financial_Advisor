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
    if formula == "pe_EEM_div_SPY":
        return _pe_ratio_ratio("EEM", "SPY")
    if formula == "em_gdp_growth":
        return _world_bank_series("NY.GDP.MKTP.KD.ZG", "EM")
    if formula == "preferred_spread":
        return _dividend_yield_minus_dgs10("PFF")
    if formula == "embi_spread":
        return _dividend_yield_minus_dgs10("EMB")
    if formula == "distribution_yield_spread":
        return _dividend_yield_minus_dgs10("AMLP")
    if formula == "rate_differential":
        return _rate_differential()
    if formula == "real_yield_curve":
        return _real_yield_curve()
    if formula == "nareit_yield_spread":
        ext = _external_series("nareit", "nareit_yield_spread")
        if not ext.empty:
            return ext
        return _dividend_yield_minus_dgs10("VNQ")
    if formula == "delta_ig_spread_20d":
        s = _series_from_db("BAMLC0A0CM")
        return s - s.shift(20) if not s.empty else pd.Series(dtype=float)
    if formula == "delta_hy_spread_20d":
        s = _series_from_db("BAMLH0A0HYM2")
        return s - s.shift(20) if not s.empty else pd.Series(dtype=float)
    if formula == "hy_quality_ratio":
        cc = _series_from_db("BAMLH0A3HYC")
        h = _series_from_db("BAMLH0A0HYM2")
        if cc.empty or h.empty:
            return pd.Series(dtype=float)
        combined = pd.concat([cc, h], axis=1, join="inner")
        combined.columns = ["cc", "h"]
        return (combined["cc"] / combined["h"].replace(0, pd.NA)).dropna()
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


def _world_bank_series(indicator: str, country: str) -> pd.Series:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT data, valor FROM world_bank_snapshot
            WHERE indicator = ? AND country = ?
            ORDER BY data
            """,
            (indicator, country),
        ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["valor"]) for r in rows]
    return pd.Series(vals, index=dates)


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


def _external_series(source: str, series_id: str) -> pd.Series:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT data, valor FROM external_series
            WHERE source = ? AND series_id = ? ORDER BY data
            """,
            (source, series_id),
        ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["valor"]) for r in rows]
    return pd.Series(vals, index=dates)


def _yfinance_field_series(ticker: str, field: str) -> pd.Series:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT data, valor FROM yfinance_snapshot
            WHERE ticker = ? AND field = ? ORDER BY data
            """,
            (ticker.upper(), field),
        ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["valor"]) for r in rows if r["valor"] is not None]
    return pd.Series(vals, index=dates[:len(vals)])


def _dividend_yield_minus_dgs10(ticker: str) -> pd.Series:
    dy = _yfinance_field_series(ticker, "dividend_yield")
    dgs = _series_from_db("DGS10")
    if dy.empty or dgs.empty:
        return pd.Series(dtype=float)
    combined = pd.concat([dy, dgs], axis=1, join="inner")
    return combined.iloc[:, 0] - combined.iloc[:, 1]


def _rate_differential() -> pd.Series:
    dff = _series_from_db("DFF")
    ecb = _external_series("ecb", "deposit_rate")
    if ecb.empty:
        ecb = _series_from_db("ECB_MRR")
    if dff.empty or ecb.empty:
        return pd.Series(dtype=float)
    combined = pd.concat([dff, ecb], axis=1, join="inner")
    return combined.iloc[:, 0] - combined.iloc[:, 1]


def _real_yield_curve() -> pd.Series:
    parts = [_series_from_db("DFII5"), _series_from_db("DFII10"), _series_from_db("DFII30")]
    if any(p.empty for p in parts):
        return pd.Series(dtype=float)
    combined = pd.concat(parts, axis=1, join="inner")
    return combined.mean(axis=1)


def latest_raw_value(serie: str) -> float | None:
    s = _series_from_db(serie)
    if s.empty:
        return None
    return float(s.iloc[-1])
