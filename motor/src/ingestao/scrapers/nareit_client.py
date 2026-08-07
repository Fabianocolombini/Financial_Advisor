"""Nareit T-Tracker yield spread proxy."""

from __future__ import annotations

from motor.src.ingestao.scrapers.base import fetch_text, parse_first_float, store_scalar

_URL = "https://www.reit.com/data-research/reit-market-data"


def ingest(conn=None) -> dict:
    html = fetch_text(_URL)
    if not html:
        return {"ok": False, "error": "Nareit page unavailable"}
    yield_val = parse_first_float(html, r"average dividend yield[^0-9]*(\d+\.?\d*)")
    spread = parse_first_float(html, r"spread[^0-9]*(\d+\.?\d*)")
    if spread is not None:
        return store_scalar("nareit", "nareit_yield_spread", spread, conn=conn)
    if yield_val is not None:
        return store_scalar("nareit", "nareit_yield_spread", yield_val, conn=conn)
    return {"ok": False, "error": "Nareit yield spread not parsed"}
