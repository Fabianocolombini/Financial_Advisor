"""Shared helpers for class security selection models (Model 2)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pandas as pd

from motor.src.calculo.cash_security_score import _cross_sectional_percentile, _latest_at
from motor.src.calculo.derivados import dividend_yield_series
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.external_series_source import get_external_series
from motor.src.db.connection import get_connection
from motor.src.ingestao.yfinance_client import get_price_series


def security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def collect_technicals(
    tickers: list[str],
    as_of: dt.date,
    *,
    include_rsi: bool = True,
    include_volume: bool = True,
    include_sigma: bool = False,
) -> dict[str, dict[str, float]]:
    raw: dict[str, dict[str, float]] = {}
    for ticker in tickers:
        t = ticker.upper()
        raw[t] = {
            "mm50": _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0,
            "mm200": _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0,
        }
        if include_rsi:
            raw[t]["rsi"] = _latest_at(get_tecnico_series(t, "rsi_14"), as_of) or 50.0
        if include_volume:
            raw[t]["volume"] = _latest_at(get_tecnico_series(t, "volume_vs_media"), as_of) or 0.0
        if include_sigma:
            raw[t]["sigma"] = _latest_at(get_tecnico_series(t, "vol_realizada"), as_of) or 0.0
    return raw


def trend_percentile(raw: dict[str, dict[str, float]], ticker: str) -> float:
    p50 = _cross_sectional_percentile({t: v["mm50"] for t, v in raw.items()})
    p200 = _cross_sectional_percentile({t: v["mm200"] for t, v in raw.items()})
    return (p50.get(ticker.upper(), 0.5) + p200.get(ticker.upper(), 0.5)) / 2.0


def rolling_beta(
    ticker: str,
    benchmark: str,
    window: int = 63,
    as_of: dt.date | None = None,
) -> float:
    a = get_price_series(ticker)
    b = get_price_series(benchmark)
    if a.empty or b.empty:
        return 0.0
    if as_of is not None:
        cap = pd.Timestamp(as_of)
        a = a.copy()
        b = b.copy()
        a.index = pd.DatetimeIndex(pd.to_datetime(a.index))
        b.index = pd.DatetimeIndex(pd.to_datetime(b.index))
        a = a.loc[a.index <= cap]
        b = b.loc[b.index <= cap]
        if a.empty or b.empty:
            return 0.0
    combined = pd.concat([a.pct_change(), b.pct_change()], axis=1, join="inner").dropna()
    if len(combined) < window:
        return 0.0
    tail = combined.iloc[-window:]
    cov = tail.iloc[:, 0].cov(tail.iloc[:, 1])
    var = tail.iloc[:, 1].var()
    if var == 0 or pd.isna(var):
        return 0.0
    return float(cov / var)


def fit_score(raw_values: dict[str, float], ticker: str, target_pct: float) -> float:
    p = _cross_sectional_percentile(raw_values)
    return 1.0 - abs(p.get(ticker.upper(), 0.5) - target_pct)


def yield_percentile(tickers: list[str], as_of: dt.date) -> dict[str, float]:
    raw: dict[str, float] = {}
    for t in tickers:
        tu = t.upper()
        raw[tu] = _latest_at(dividend_yield_series(tu), as_of) or 0.0
    return _cross_sectional_percentile(raw)


def expense_ratio_value(ticker: str) -> float | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT valor FROM yfinance_snapshot
            WHERE ticker = ? AND field = 'expense_ratio'
            ORDER BY data DESC LIMIT 1
            """,
            (ticker.upper(),),
        ).fetchone()
    if not row or row["valor"] is None:
        return None
    return float(row["valor"])


def nav_discount_proxy(ticker: str) -> float | None:
    from motor.src.ingestao.edgar_client import get_edgar_metric

    val = get_edgar_metric(ticker, "nav_premium_discount")
    if val is None:
        return None
    return -float(val)


def catalyst_density_scalar() -> float:
    fda = get_external_series("fda", "fda_calendar_density")
    if fda.empty:
        pf = get_external_series("edgar", "form_d_biotech_90d")
        if pf.empty:
            return 0.0
        return float(pf.iloc[-1])
    return float(fda.iloc[-1])


def build_security_result(
    *,
    ticker: str,
    as_of: dt.date,
    security_score: float,
    componentes: list[dict[str, Any]],
    model: str,
    explanation: list[str],
    universe_size: int,
) -> dict[str, Any]:
    dominant = max(componentes, key=lambda c: abs(c.get("contribuicao", 0) or 0))
    return {
        "ticker": ticker.upper(),
        "data": as_of.isoformat(),
        "score_composto": security_score,
        "security_score": security_score,
        "componentes": componentes,
        "indicador_dominante": dominant,
        "estagio": security_estagio(security_score),
        "model": model,
        "cross_sectional_universe_size": universe_size,
        "explanation": explanation,
    }
