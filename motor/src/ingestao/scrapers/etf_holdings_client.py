"""GLD/SLV sponsor holdings pages."""

from __future__ import annotations

from motor.src.ingestao.scrapers.base import fetch_text, parse_first_float, store_scalar

_URLS = {
    "gld_holdings_tonnes": "https://www.spdrgoldshares.com/usa/historical-data/",
    "slv_holdings_tonnes": "https://www.ishares.com/us/products/239855/ishares-silver-trust-fund",
}


def ingest(conn=None) -> dict:
    stored = 0
    for sid, url in _URLS.items():
        html = fetch_text(url)
        if not html:
            continue
        val = parse_first_float(html, r"([\d,]+\.?\d*)\s*(?:tonnes|tons|ounces)")
        if val is not None:
            store_scalar("etf_holdings", sid, val, conn=conn)
            stored += 1
    return {"ok": stored > 0, "stored": stored}
