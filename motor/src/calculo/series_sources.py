"""Load indicator time series from ingested sources (SQLite)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pandas as pd

from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.derivados import compute_formula, get_fred_series
from motor.src.calculo.proxy_indicators import compute_proxy_series, is_proxy_formula
from motor.src.db.connection import get_connection


def get_price_daily_series(ticker: str) -> pd.Series:
    t = ticker.upper()
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT data, close FROM price_daily WHERE ticker = ? ORDER BY data",
            (t,),
        ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["close"]) for r in rows]
    return pd.Series(vals, index=dates)


def get_yfinance_snapshot_series(ticker: str, field: str) -> pd.Series:
    t = ticker.upper()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT data, valor FROM yfinance_snapshot
            WHERE ticker = ? AND field = ? ORDER BY data
            """,
            (t, field),
        ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["valor"]) for r in rows if r["valor"] is not None]
    if not vals:
        return pd.Series(dtype=float)
    return pd.Series(vals, index=dates[:len(vals)])


def get_world_bank_series(indicator: str, country: str) -> pd.Series:
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
    vals = [float(r["valor"]) for r in rows if r["valor"] is not None]
    return pd.Series(vals, index=dates[:len(vals)])


def get_edgar_metrics_series(ticker: str, metric: str) -> pd.Series:
    t = ticker.upper()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT data, valor FROM edgar_metrics
            WHERE ticker = ? AND metric = ? ORDER BY data
            """,
            (t, metric),
        ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["valor"]) for r in rows]
    return pd.Series(vals, index=dates)


def indicator_series(ind: dict[str, Any]) -> pd.Series:
    fonte = ind.get("fonte")
    if fonte == "fred":
        serie = ind.get("serie")
        if serie:
            return get_fred_series(serie)
        return pd.Series(dtype=float)
    if fonte == "calculado":
        formula = ind.get("formula", "")
        if is_proxy_formula(formula):
            ticker = (ind.get("ticker_proxy") or ind.get("ticker") or "").upper() or None
            return compute_proxy_series(formula, ticker)
        return compute_formula(formula)
    if fonte == "proxy":
        return compute_proxy_series(ind.get("formula", ""), ind.get("ticker_proxy"))
    if fonte == "external":
        return get_external_series(ind.get("source", ""), ind.get("series_id", ""))
    if fonte == "yfinance":
        ticker = (ind.get("ticker_proxy") or ind.get("ticker") or "").upper()
        field = ind.get("field", "close")
        if not ticker:
            return pd.Series(dtype=float)
        if field == "close":
            return get_price_daily_series(ticker)
        return get_yfinance_snapshot_series(ticker, field)
    if fonte == "world_bank":
        return get_world_bank_series(
            ind.get("indicator", ""),
            ind.get("country", ""),
        )
    if fonte == "ecb":
        s = get_fred_series("ECB_MRR")
        if s.empty:
            s = get_fred_series("ECB_FRED_PROXY")
        return s
    if fonte == "edgar":
        ticker = (ind.get("ticker_proxy") or ind.get("ticker") or "").upper()
        metric = ind.get("metric") or ind.get("edgar_metric") or ""
        if ticker and metric:
            return get_edgar_metrics_series(ticker, metric)
    return pd.Series(dtype=float)
