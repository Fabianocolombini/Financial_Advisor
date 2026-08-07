"""EIA petroleum data — optional; crude stocks already on FRED as WCESTUS1."""

from __future__ import annotations

import os

import httpx

from motor.src.ingestao.scrapers.base import store_scalar

# Weekly petroleum stocks summary — overlaps FRED WCESTUS1 (crude ex-SPR).
# Enable fonte `eia` only when you need non-FRED petroleum series (e.g. products/gas).
_API = "https://api.eia.gov/v2/petroleum/sum/sndw/data/"


def ingest(conn=None) -> dict:
    key = os.environ.get("EIA_API_KEY", "")
    if not key:
        return {
            "ok": False,
            "error": "EIA_API_KEY not set",
            "skipped": True,
            "nota": "Use FRED WCESTUS1 para estoque cru sem API key",
        }
    params = {
        "api_key": key,
        "frequency": "weekly",
        "data[0]": "value",
        "sort[0][column]": "period",
        "sort[0][direction]": "desc",
        "length": 1,
    }
    try:
        with httpx.Client(timeout=30) as client:
            r = client.get(_API, params=params)
            if r.status_code != 200:
                return {"ok": False, "error": f"EIA HTTP {r.status_code}"}
            data = r.json()
            rows = data.get("response", {}).get("data", [])
            if not rows:
                return {"ok": False, "error": "EIA empty response"}
            val = float(rows[0]["value"])
            return store_scalar("eia", "eia_petroleum_stocks_sndw", val, conn=conn)
    except Exception as e:
        return {"ok": False, "error": str(e)}
