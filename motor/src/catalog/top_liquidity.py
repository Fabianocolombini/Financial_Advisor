"""Rank catalog symbols by ~90d dollar volume (same rule as lib/catalog/volume-rank.ts)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yfinance as yf

from motor.src.config.aba_class_map import class_id_for_aba
from motor.src.ingestao.yfinance_client import _symbol_to_yf
from motor.src.paths import CONFIG_DIR

LOOKBACK_DAYS = 90
CUMULATIVE_TARGET_PCT = 90
CATALOG_PATH = CONFIG_DIR / "catalog_by_class.json"


def _load_catalog() -> dict[str, list[dict[str, str]]]:
    if not CATALOG_PATH.is_file():
        return {}
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return data.get("classes", {})


def dollar_volume_from_db(symbol: str) -> float:
    from motor.src.db.connection import get_connection

    t = symbol.upper()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT close, volume FROM price_daily
            WHERE ticker = ? ORDER BY data DESC LIMIT ?
            """,
            (t, LOOKBACK_DAYS),
        ).fetchall()
    total = 0.0
    for row in rows:
        close = float(row["close"] or 0)
        vol = float(row["volume"] or 0)
        if close > 0 and vol > 0:
            total += close * vol
    return total


def dollar_volume_yfinance(symbol: str) -> float:
    yf_sym = _symbol_to_yf(symbol)
    try:
        hist = yf.download(
            yf_sym,
            period=f"{LOOKBACK_DAYS + 45}d",
            progress=False,
            auto_adjust=True,
        )
    except Exception:
        return 0.0
    if hist is None or hist.empty:
        return 0.0
    if hasattr(hist.columns, "levels"):
        hist = hist.droplevel(1, axis=1)
    tail = hist.tail(LOOKBACK_DAYS)
    total = 0.0
    for _, row in tail.iterrows():
        close = float(row.get("Close", row.get("close", 0)) or 0)
        vol = float(row.get("Volume", row.get("volume", 0)) or 0)
        if close > 0 and vol > 0:
            total += close * vol
    return total


def rank_top_liquidity_symbols(
    class_id: str,
    symbols: list[str] | None = None,
) -> list[str]:
    """Return symbols until cumulative dollar volume reaches 90% of class total."""
    catalog = _load_catalog()
    if symbols is None:
        entries = catalog.get(class_id, [])
        symbols = [e["symbol"].upper() for e in entries]
    symbols = [s.upper() for s in symbols if s]
    if not symbols:
        return []

    ranked: list[tuple[str, float]] = []
    for sym in symbols:
        vol = dollar_volume_from_db(sym)
        if vol <= 0:
            vol = dollar_volume_yfinance(sym)
        ranked.append((sym, vol))

    ranked = [r for r in ranked if r[1] > 0]
    if not ranked:
        return symbols[: min(20, len(symbols))]

    ranked.sort(key=lambda x: x[1], reverse=True)
    total = sum(v for _, v in ranked)
    if total <= 0:
        return [s for s, _ in ranked]

    out: list[str] = []
    cumulative = 0.0
    for sym, vol in ranked:
        out.append(sym)
        cumulative += vol
        if cumulative / total * 100 >= CUMULATIVE_TARGET_PCT:
            break
    return out


def top_symbols_for_aba(aba_id: str) -> list[str]:
    class_id = class_id_for_aba(aba_id)
    return rank_top_liquidity_symbols(class_id)
