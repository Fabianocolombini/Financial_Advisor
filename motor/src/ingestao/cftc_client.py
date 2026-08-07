"""CFTC Commitments of Traders — weekly legacy futures report parse."""

from __future__ import annotations

import datetime as dt
import json
import logging
import re
from pathlib import Path
from typing import Any

import httpx

from motor.src.db.external_series_store import upsert_point
from motor.src.paths import CONFIG_DIR

log = logging.getLogger(__name__)

_LEGACY_URL = "https://www.cftc.gov/files/dea/history/deafut_txt_2024.zip"
_FALLBACK_TXT = "https://www.cftc.gov/dea/newcot/fut_fin_txt.txt"


def _load_contracts() -> list[dict[str, str]]:
    path = CONFIG_DIR / "cftc_contracts.json"
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data.get("contracts", []))


def _parse_line(line: str, contracts: list[dict[str, str]]) -> dict[str, float] | None:
    if not line.strip() or line.startswith("CFTC"):
        return None
    parts = [p.strip() for p in line.split(",")]
    if len(parts) < 10:
        return None
    market = parts[0].upper()
    for c in contracts:
        if c["pattern"].upper() in market:
            try:
                noncomm_long = float(parts[8])
                noncomm_short = float(parts[9])
                net = noncomm_long - noncomm_short
                return {"series_id": c["series_id"], "net": net}
            except (ValueError, IndexError):
                return None
    return None


def ingest_cftc(conn=None) -> dict[str, Any]:
    contracts = _load_contracts()
    if not contracts:
        return {"ok": False, "error": "no contracts config"}

    text: str | None = None
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        try:
            r = client.get(_FALLBACK_TXT)
            if r.status_code == 200:
                text = r.text
        except Exception as e:
            log.warning("CFTC fallback txt failed: %s", e)

    if not text:
        return {"ok": False, "error": "CFTC report unavailable"}

    today = dt.date.today().isoformat()
    stored: dict[str, float] = {}
    for line in text.splitlines():
        parsed = _parse_line(line, contracts)
        if not parsed:
            continue
        sid = parsed["series_id"]
        upsert_point("cftc", sid, today, float(parsed["net"]), conn=conn)
        stored[sid] = float(parsed["net"])

    return {"ok": bool(stored), "series": stored, "date": today}


def test_connection() -> dict[str, Any]:
    r = ingest_cftc()
    return {"ok": bool(r.get("ok")), "sample": r}
