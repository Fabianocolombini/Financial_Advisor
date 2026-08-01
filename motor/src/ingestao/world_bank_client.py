"""World Bank API client (free)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import httpx

_BASE = "https://api.worldbank.org/v2"


def fetch_indicator(
    indicator: str,
    country: str = "US",
    per_page: int = 5,
) -> list[dict[str, Any]]:
    """Fetch recent observations. country: ISO2 or aggregate code."""
    url = f"{_BASE}/country/{country}/indicator/{indicator}"
    params = {"format": "json", "per_page": per_page, "date": "2015:2025"}
    with httpx.Client(timeout=30.0) as client:
        res = client.get(url, params=params)
        res.raise_for_status()
        data = res.json()
    if not data or len(data) < 2:
        return []
    rows = data[1] or []
    out: list[dict[str, Any]] = []
    for row in rows:
        val = row.get("value")
        if val is None:
            continue
        out.append(
            {
                "country": row.get("country", {}).get("id", country),
                "indicator": indicator,
                "date": row.get("date"),
                "value": float(val),
            }
        )
    return out


def test_connection() -> dict[str, Any]:
    rows = fetch_indicator("NY.GDP.MKTP.KD.ZG", "US", per_page=1)
    if not rows:
        return {"ok": False, "error": "no data"}
    r = rows[0]
    return {"ok": True, "sample": r}


def ingest_em_gdp_growth(conn) -> int:
    """Store EM proxy GDP growth — uses WLD or sample countries."""
    rows = fetch_indicator("NY.GDP.MKTP.KD.ZG", "WLD", per_page=3)
    n = 0
    today = dt.date.today().isoformat()
    for row in rows:
        if not row.get("date"):
            continue
        conn.execute(
            """
            INSERT OR REPLACE INTO world_bank_snapshot
            (indicator, country, data, valor) VALUES (?, ?, ?, ?)
            """,
            (row["indicator"], "EM", f"{row['date']}-01-01", row["value"]),
        )
        n += 1
    return n
