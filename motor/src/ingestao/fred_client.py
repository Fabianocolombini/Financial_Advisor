"""FRED API client and ingest to raw_series."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sqlite3
from dataclasses import dataclass
from typing import Any

import httpx

from motor.src.config_loader import load_aba_config, load_fred_manifest, series_for_aba
from motor.src.db.connection import get_connection, init_db
from motor.src.paths import fred_api_key

_FRED_OBS = "https://api.stlouisfed.org/fred/series/observations"
_DEFAULT_START = "2019-01-01"


@dataclass
class FredObservation:
    date: str
    value: float


def fetch_fred_observations(
    api_key: str,
    series_id: str,
    observation_start: str,
) -> list[FredObservation]:
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": observation_start,
        "sort_order": "asc",
    }
    with httpx.Client(timeout=60.0) as client:
        res = client.get(_FRED_OBS, params=params)
        res.raise_for_status()
        data = res.json()
    out: list[FredObservation] = []
    for row in data.get("observations") or []:
        v = row.get("value", "")
        if v in (".", ""):
            continue
        try:
            n = float(v)
        except ValueError:
            continue
        if n != n:
            continue
        d = row.get("date", "")
        out.append(FredObservation(date=d, value=n))
    return out


def upsert_raw_series(conn, serie: str, observations: list[FredObservation]) -> int:
    n = 0
    for obs in observations:
        conn.execute(
            "INSERT OR REPLACE INTO raw_series (data, serie, valor) VALUES (?, ?, ?)",
            (obs.date, serie, obs.value),
        )
        n += 1
    return n


def ingest_series(
    series_ids: set[str],
    start: str = _DEFAULT_START,
    conn: sqlite3.Connection | None = None,
) -> dict[str, int]:
    init_db()
    api_key = fred_api_key()
    if conn is not None:
        return _ingest_series_with_conn(conn, series_ids, start, api_key, commit=False)
    with get_connection() as c:
        return _ingest_series_with_conn(c, series_ids, start, api_key, commit=True)


def _ingest_series_with_conn(
    conn: sqlite3.Connection,
    series_ids: set[str],
    start: str,
    api_key: str,
    commit: bool,
) -> dict[str, int]:
    counts: dict[str, int] = {}
    for sid in sorted(series_ids):
        obs = fetch_fred_observations(api_key, sid, start)
        counts[sid] = upsert_raw_series(conn, sid, obs)
    if commit:
        conn.commit()
    return counts


def ingest_for_aba(aba_id: str, start: str = _DEFAULT_START) -> dict[str, int]:
    aba = load_aba_config(aba_id)
    series = series_for_aba(aba)
  # Always include common deps for calculated fields
    series.update({"DGS10", "T10YIE", "BAMLC0A0CM"})
    return ingest_series(series, start)


def ingest_manifest(start: str = _DEFAULT_START) -> dict[str, int]:
    manifest = load_fred_manifest()
    ids = {row["id"] for row in manifest}
    return ingest_series(ids, start)


def run_test() -> dict[str, Any]:
    """Smoke test: fetch DGS10, DGS2, DFF."""
    api_key = fred_api_key()
    result: dict[str, Any] = {}
    for sid in ("DGS10", "DGS2", "DFF"):
        obs = fetch_fred_observations(api_key, sid, (dt.date.today() - dt.timedelta(days=30)).isoformat())
        if not obs:
            result[sid] = {"error": "sem dados"}
        else:
            last = obs[-1]
            result[sid] = {"date": last.date, "value": last.value}
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--aba", default="taxas")
    parser.add_argument("--start", default=_DEFAULT_START)
    parser.add_argument("--manifest", action="store_true", help="Ingerir manifesto completo")
    args = parser.parse_args()
    if args.test:
        out = run_test()
        print(json.dumps(out, indent=2))
        return
    if args.manifest:
        counts = ingest_manifest(args.start)
    else:
        counts = ingest_for_aba(args.aba, args.start)
    print(json.dumps({"ingested": counts, "total_points": sum(counts.values())}, indent=2))


if __name__ == "__main__":
    main()
