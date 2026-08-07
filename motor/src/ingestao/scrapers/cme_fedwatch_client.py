"""CME FedWatch — fed cut probability proxy from public page."""

from __future__ import annotations

from motor.src.ingestao.scrapers.base import fetch_text, parse_first_float, store_scalar

_URL = "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html"


def ingest(conn=None) -> dict:
    html = fetch_text(_URL)
    if not html:
        return {"ok": False, "error": "CME page unavailable"}
    val = parse_first_float(html, r"(\d+\.?\d*)\s*%.*?cut|probability.*?(\d+\.?\d*)")
    if val is None:
        val = parse_first_float(html, r"(\d+\.?\d*)\s*%")
    if val is None:
        return {"ok": False, "error": "could not parse FedWatch probability"}
    return store_scalar("cme", "fed_cut_probability", val, conn=conn)
