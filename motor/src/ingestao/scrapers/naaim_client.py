"""NAAIM exposure index."""

from __future__ import annotations

from motor.src.ingestao.scrapers.base import fetch_text, parse_first_float, store_scalar

_URL = "https://www.naaim.org/programs/naaim-exposure-index/"


def ingest(conn=None) -> dict:
    html = fetch_text(_URL)
    if not html:
        return {"ok": False, "error": "NAAIM page unavailable"}
    val = parse_first_float(html, r"Exposure Index[^0-9]*(\d+\.?\d*)")
    if val is None:
        val = parse_first_float(html, r"(\d+\.?\d*)\s*%")
    if val is None:
        return {"ok": False, "error": "NAAIM exposure not parsed"}
    return store_scalar("naaim", "naaim_exposure", val, conn=conn)
