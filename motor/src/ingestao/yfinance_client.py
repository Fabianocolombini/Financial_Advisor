"""yfinance price ingest to price_daily."""

from __future__ import annotations

import datetime as dt
import sqlite3
from typing import Any

import pandas as pd
import yfinance as yf

from motor.src.config_loader import load_aba_config
from motor.src.db.connection import get_connection, init_db

_DEFAULT_START = "2019-01-01"


def _symbol_to_yf(symbol: str) -> str:
    symbol = symbol.strip().upper()
    if "." not in symbol:
        return symbol
    base, suffix = symbol.split(".", 1)
    if suffix in {"A", "B", "C"}:
        return f"{base}-{suffix}"
    return symbol


def ingest_ticker(
    ticker: str,
    start: str = _DEFAULT_START,
    conn: sqlite3.Connection | None = None,
) -> int:
    yf_sym = _symbol_to_yf(ticker)
    data = yf.download(yf_sym, start=start, progress=False, auto_adjust=True)
    if data is None or data.empty:
        return 0
    if isinstance(data.columns, pd.MultiIndex):
        data = data.droplevel(1, axis=1)
    n = 0

    def _write(c: sqlite3.Connection) -> int:
        count = 0
        for idx, row in data.iterrows():
            d = idx.date() if hasattr(idx, "date") else idx
            close = float(row.get("Close", row.get("close", 0)))
            if close <= 0:
                continue
            c.execute(
                """
                INSERT OR REPLACE INTO price_daily
                (ticker, data, open, high, low, close, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ticker.upper(),
                    d.isoformat(),
                    float(row.get("Open", close)),
                    float(row.get("High", close)),
                    float(row.get("Low", close)),
                    close,
                    float(row.get("Volume", 0) or 0),
                ),
            )
            count += 1
        return count

    if conn is not None:
        n = _write(conn)
    else:
        with get_connection() as c:
            n = _write(c)
            c.commit()
    return n


def ingest_aba_universe(aba_id: str, start: str = _DEFAULT_START) -> dict[str, int]:
    init_db()
    aba = load_aba_config(aba_id)
    counts: dict[str, int] = {}
    tickers: set[str] = set()
    for item in aba.get("universo", []):
        tickers.add(item["ticker"].upper())
        if item.get("benchmark"):
            tickers.add(item["benchmark"].upper())
    for t in sorted(tickers):
        counts[t] = ingest_ticker(t, start)
    return counts


def get_price_series(ticker: str, min_date: str | None = None) -> pd.Series:
    """Close prices indexed by date."""
    q = "SELECT data, close FROM price_daily WHERE ticker = ?"
    params: list[Any] = [ticker.upper()]
    if min_date:
        q += " AND data >= ?"
        params.append(min_date)
    q += " ORDER BY data"
    with get_connection() as conn:
        rows = conn.execute(q, params).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["close"]) for r in rows]
    return pd.Series(vals, index=dates)
