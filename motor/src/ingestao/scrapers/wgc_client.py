"""World Gold Council central bank buying proxy."""

from __future__ import annotations

from motor.src.ingestao.scrapers.base import fetch_text, parse_first_float, store_scalar

_URL = "https://www.gold.org/goldhub/data/gold-reserves-by-country"


def ingest(conn=None) -> dict:
    html = fetch_text(_URL)
    if not html:
        return {"ok": False, "error": "WGC page unavailable"}
    val = parse_first_float(html, r"central bank[^0-9]*(\d+\.?\d*)")
    if val is None:
        return {"ok": False, "error": "WGC CB buying not parsed"}
    return store_scalar("wgc", "cb_gold_buying", val, conn=conn)
