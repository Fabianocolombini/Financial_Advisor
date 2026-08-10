"""NY Fed Adrian-Crump-Moench term premium ingest (monthly ACM sheet)."""

from __future__ import annotations

import datetime as dt
import logging
from io import BytesIO
from typing import Any

import httpx
import pandas as pd

from motor.src.db.external_series_store import upsert_point

log = logging.getLogger(__name__)

_URL = (
    "https://www.newyorkfed.org/medialibrary/media/research/data_indicators/ACMTermPremium.xls"
)
_SERIES_ID = "acm_term_premium_10y"
_SOURCE = "nyfed"
_SHEET = "ACM Monthly"
_COLUMN = "ACMTP10"


def _fetch_monthly_tp() -> pd.DataFrame | None:
    try:
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            r = client.get(
                _URL,
                headers={"User-Agent": "FinancialAdvisor-Motor/1.0"},
            )
            if r.status_code != 200:
                log.warning("NY Fed ACM HTTP %s", r.status_code)
                return None
            raw = r.content
    except Exception as e:
        log.warning("NY Fed ACM fetch failed: %s", e)
        return None

    try:
        df = pd.read_excel(BytesIO(raw), sheet_name=_SHEET)
    except Exception as e:
        log.warning("NY Fed ACM parse failed: %s", e)
        return None

    if "DATE" not in df.columns or _COLUMN not in df.columns:
        log.warning("NY Fed ACM missing DATE/%s columns", _COLUMN)
        return None

    out = df[["DATE", _COLUMN]].copy()
    out["DATE"] = pd.to_datetime(out["DATE"], errors="coerce")
    out = out.dropna(subset=["DATE", _COLUMN])
    if out.empty:
        return None
    return out


def ingest(conn=None) -> dict[str, Any]:
    """Store ACM 10y term premium monthly series in external_series."""
    df = _fetch_monthly_tp()
    if df is None or df.empty:
        return {"ok": False, "error": "NY Fed ACM data unavailable", "skipped": True}

    n = 0
    last_date: str | None = None
    last_val: float | None = None
    for _, row in df.iterrows():
        d = row["DATE"]
        if hasattr(d, "date"):
            d = d.date()
        date_str = d.isoformat()
        val = float(row[_COLUMN])
        upsert_point(_SOURCE, _SERIES_ID, date_str, val, conn=conn)
        n += 1
        last_date = date_str
        last_val = val

    return {
        "ok": n > 0,
        "source": _SOURCE,
        "series_id": _SERIES_ID,
        "records": n,
        "last_date": last_date,
        "last_value": last_val,
    }


def test_connection() -> dict[str, Any]:
    df = _fetch_monthly_tp()
    if df is None or df.empty:
        return {"ok": False, "error": "NY Fed ACM unavailable"}
  return {
        "ok": True,
        "rows": len(df),
        "last_date": str(df["DATE"].iloc[-1]),
    }
