"""FINRA margin debt (monthly)."""

from __future__ import annotations

from motor.src.ingestao.scrapers.base import fetch_text, parse_first_float, store_scalar

_URL = "https://www.finra.org/investors/learn-to-invest/advanced-investing/margin-statistics"


def ingest(conn=None) -> dict:
    html = fetch_text(_URL)
    if not html:
        return {"ok": False, "error": "FINRA page unavailable"}
    val = parse_first_float(html, r"margin debt[^$]*\$?\s*([\d,]+\.?\d*)")
    if val is None:
        return {"ok": False, "error": "margin debt not parsed"}
    return store_scalar("finra", "margin_debt", val, conn=conn)
