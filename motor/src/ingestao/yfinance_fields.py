"""yfinance field snapshots (P/E, dividend yield, etc.)."""

from __future__ import annotations

import datetime as dt
import sqlite3
from typing import Any

import yfinance as yf

from motor.src.ingestao.yfinance_client import ingest_ticker


def _yf_ticker(symbol: str) -> yf.Ticker:
    s = symbol.strip().upper()
    if "." in s:
        base, suffix = s.split(".", 1)
        if suffix in {"A", "B", "C"}:
            s = f"{base}-{suffix}"
    return yf.Ticker(s)


def fetch_field(ticker: str, field: str) -> float | None:
    t = _yf_ticker(ticker)
    info = t.info or {}
    if field == "close":
        hist = t.history(period="5d")
        if hist.empty:
            return None
        return float(hist["Close"].iloc[-1])
    if field == "pe_ratio":
        v = info.get("trailingPE") or info.get("forwardPE")
        return float(v) if v else None
    if field == "dividend_yield":
        v = info.get("dividendYield") or info.get("yield")
        if v is not None:
            return float(v)
        return None
    if field == "revenue_growth":
        v = info.get("revenueGrowth")
        return float(v) if v else None
    v = info.get(field)
    return float(v) if v is not None else None


def persist_snapshot(conn, ticker: str, field: str, value: float) -> None:
    today = dt.date.today().isoformat()
    conn.execute(
        """
        INSERT OR REPLACE INTO yfinance_snapshot (ticker, data, field, valor)
        VALUES (?, ?, ?, ?)
        """,
        (ticker.upper(), today, field, value),
    )


def ingest_manifest_yfinance_fields(manifest: dict[str, Any], conn) -> dict[str, int]:
    counts: dict[str, int] = {}
    for cls in manifest.get("classes", []):
        for ind in cls.get("indicadores", []):
            if ind.get("fonte") != "yfinance":
                continue
            ticker = ind.get("ticker_proxy", "").upper()
            field = ind.get("field", "close")
            if not ticker:
                continue
            val = fetch_field(ticker, field)
            key = f"{ticker}:{field}"
            if val is not None:
                persist_snapshot(conn, ticker, field, val)
                counts[key] = 1
            else:
                counts[key] = 0
    return counts


def ingest_test_tickers(
    manifest: dict[str, Any],
    start: str = "2019-01-01",
    conn: sqlite3.Connection | None = None,
) -> dict[str, int]:
    counts: dict[str, int] = {}
    for ticker in manifest.get("tickers_teste", {}).keys():
        counts[ticker] = ingest_ticker(ticker, start, conn=conn)
    return counts


def test_connection() -> dict[str, Any]:
    val = fetch_field("SPY", "close")
    if val is None:
        return {"ok": False, "error": "SPY close unavailable"}
    return {"ok": True, "SPY_close": val}
