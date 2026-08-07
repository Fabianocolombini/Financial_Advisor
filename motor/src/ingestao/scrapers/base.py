"""Scraper helpers."""

from __future__ import annotations

import re
from typing import Any

import httpx

from motor.src.db.external_series_store import upsert_point


def fetch_text(url: str, timeout: float = 60.0) -> str | None:
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            r = client.get(url, headers={"User-Agent": "FinancialAdvisor-Motor/1.0"})
            if r.status_code == 200:
                return r.text
    except Exception:
        return None
    return None


def store_scalar(source: str, series_id: str, value: float, conn=None) -> dict[str, Any]:
    from datetime import date

    upsert_point(source, series_id, date.today().isoformat(), value, conn=conn)
    return {"ok": True, "series_id": series_id, "value": value}


def parse_first_float(text: str, pattern: str) -> float | None:
    m = re.search(pattern, text, re.I | re.S)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None
