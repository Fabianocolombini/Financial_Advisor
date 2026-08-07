"""Yale Shiller CAPE from public CSV."""

from __future__ import annotations

from motor.src.db.external_series_store import upsert_point
from motor.src.ingestao.scrapers.base import fetch_text

_URL = "http://www.econ.yale.edu/~shiller/data/ie_data.csv"


def ingest(conn=None) -> dict:
    csv = fetch_text(_URL)
    if not csv:
        return {"ok": False, "error": "Shiller CSV unavailable"}
    lines = [ln for ln in csv.strip().splitlines() if ln.strip()]
    if len(lines) < 2:
        return {"ok": False, "error": "Shiller CSV empty"}
    header = lines[0].split(",")
    cape_idx = None
    for i, h in enumerate(header):
        if "CAPE" in h.upper() or "P/E10" in h.upper():
            cape_idx = i
            break
    if cape_idx is None and len(header) > 10:
        cape_idx = 10
    if cape_idx is None:
        return {"ok": False, "error": "CAPE column not found"}
    last = lines[-1].split(",")
    try:
        val = float(last[cape_idx])
    except (ValueError, IndexError):
        return {"ok": False, "error": "CAPE parse failed"}
    import datetime as dt

    upsert_point("shiller", "cape_shiller", dt.date.today().isoformat(), val, conn=conn)
    return {"ok": True, "cape_shiller": val}
