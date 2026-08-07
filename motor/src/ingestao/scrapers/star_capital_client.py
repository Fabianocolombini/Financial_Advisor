"""STAR Capital CAPE by country (trimestral)."""

from __future__ import annotations

from motor.src.ingestao.scrapers.base import fetch_text, parse_first_float, store_scalar

_URL = "https://www.starcapital.de/en/research/market-valuation/"


def ingest(conn=None) -> dict:
    html = fetch_text(_URL)
    if not html:
        return {"ok": False, "error": "STAR Capital page unavailable"}
    val = parse_first_float(html, r"United States[^0-9]*(\d+\.?\d*)")
    if val is None:
        val = parse_first_float(html, r"CAPE[^0-9]*(\d+\.?\d*)")
    if val is None:
        return {"ok": False, "error": "CAPE by country not parsed"}
    return store_scalar("star", "cape_by_country_us", val, conn=conn)
