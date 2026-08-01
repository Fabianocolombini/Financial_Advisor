"""Ticker performance from motor price_daily."""

from __future__ import annotations

from motor.src.db.connection import get_connection


def ticker_performance_pct(ticker: str, lookback_days: int = 1) -> float | None:
    """Return % change over lookback_days trading rows (1 = 1-day)."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT close FROM price_daily
            WHERE ticker = ? AND close IS NOT NULL
            ORDER BY data DESC
            LIMIT ?
            """,
            (ticker.upper(), lookback_days + 1),
        ).fetchall()
    if len(rows) < lookback_days + 1:
        return None
    latest = float(rows[0]["close"])
    prior = float(rows[lookback_days]["close"])
    if prior == 0:
        return None
    return ((latest - prior) / prior) * 100.0


def enrich_ticker_performance(ticker_data: dict) -> dict:
    sym = ticker_data.get("symbol", "")
    perf1d = ticker_performance_pct(sym, 1)
    perf1m = ticker_performance_pct(sym, 21)
    ticker_data["perf1dPct"] = round(perf1d, 2) if perf1d is not None else None
    ticker_data["perf1mPct"] = round(perf1m, 2) if perf1m is not None else None
    return ticker_data
