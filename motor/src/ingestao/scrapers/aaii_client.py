"""AAII investor sentiment."""

from __future__ import annotations

from motor.src.ingestao.scrapers.base import fetch_text, parse_first_float, store_scalar

_URL = "https://www.aaii.com/sentimentsurvey"


def ingest(conn=None) -> dict:
    html = fetch_text(_URL)
    if not html:
        return {"ok": False, "error": "AAII page unavailable"}
    bullish = parse_first_float(html, r"Bullish[^0-9]*(\d+\.?\d*)")
    bearish = parse_first_float(html, r"Bearish[^0-9]*(\d+\.?\d*)")
    if bullish is None:
        return {"ok": False, "error": "AAII sentiment not parsed"}
    spread = bullish - (bearish or 0)
    return store_scalar("aaii", "aaii_sentiment", spread, conn=conn)
