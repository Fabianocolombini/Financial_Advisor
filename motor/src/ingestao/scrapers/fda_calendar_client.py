"""FDA calendar density — upcoming approvals proxy."""

from __future__ import annotations

import datetime as dt

from motor.src.ingestao.scrapers.base import fetch_text

from motor.src.db.external_series_store import upsert_point


def ingest(conn=None) -> dict:
    html = fetch_text("https://www.fda.gov/drugs/drug-approvals-and-databases/drug-and-biologic-approval-reports")
    if not html:
        return {"ok": False, "error": "FDA page unavailable"}
    today = dt.date.today()
    count = html.lower().count("approval")
    upsert_point("fda", "fda_calendar_density", today.isoformat(), float(count), conn=conn)
    return {"ok": True, "fda_calendar_density": count}
