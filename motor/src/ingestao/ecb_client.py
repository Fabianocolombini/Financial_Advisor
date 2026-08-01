"""ECB Statistical Data Warehouse API (free) with FRED fallback."""

from __future__ import annotations

import datetime as dt
from typing import Any

import httpx

# Main refinancing operations rate
_DEFAULT_SERIES = "FM.B.U2.EUR.4F.KR.MRR_NR.LE"
_FRED_ECB_PROXY = "IRSTCI01EZM156N"
_BASE = "https://data-api.ecb.europa.eu/service/data"


def fetch_latest(series_key: str = _DEFAULT_SERIES) -> dict[str, Any] | None:
    path = series_key.replace(".", "/")
    url = f"{_BASE}/{path}"
    params = {"lastNObservations": 1, "format": "jsondata"}
    headers = {"Accept": "application/json", "User-Agent": "FinancialAdvisor-Motor/1.0"}
    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.get(url, params=params, headers=headers)
            if res.status_code != 200:
                return None
            data = res.json()
    except Exception:
        return None
    try:
        datasets = data.get("dataSets", [])
        if not datasets:
            return None
        series = datasets[0].get("series", {})
        if not series:
            return None
        first_key = next(iter(series))
        obs = series[first_key].get("observations", {})
        if not obs:
            return None
        okey = next(iter(obs))
        val = obs[okey][0]
        dim = data.get("structure", {}).get("dimensions", {}).get("observation", [])
        date_str = None
        for d in dim:
            if d.get("id") == "TIME_PERIOD" and d.get("values"):
                idx = int(okey) if str(okey).isdigit() else 0
                if idx < len(d["values"]):
                    date_str = d["values"][idx].get("id")
        return {"series": series_key, "date": date_str, "value": float(val), "source": "ecb"}
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def fetch_fred_ecb_proxy() -> dict[str, Any] | None:
    from motor.src.ingestao.fred_client import fetch_fred_observations
    from motor.src.paths import fred_api_key

    obs = fetch_fred_observations(
        fred_api_key(),
        _FRED_ECB_PROXY,
        (dt.date.today() - dt.timedelta(days=365)).isoformat(),
    )
    if not obs:
        return None
    last = obs[-1]
    return {
        "series": _FRED_ECB_PROXY,
        "date": last.date,
        "value": last.value,
        "source": "fred_proxy",
    }


def test_connection() -> dict[str, Any]:
    row = fetch_latest()
    if row:
        return {"ok": True, "sample": row}
    fallback = fetch_fred_ecb_proxy()
    if fallback:
        return {
            "ok": True,
            "sample": fallback,
            "nota": "ECB API indisponível; proxy FRED IRSTCI01EZM156N",
        }
    return {"ok": False, "error": "ECB API e proxy FRED falharam"}


def ingest_ecb_rate(conn, series_key: str = _DEFAULT_SERIES) -> int:
    row = fetch_latest(series_key)
    if not row:
        row = fetch_fred_ecb_proxy()
    if not row:
        return 0
    d = row.get("date") or dt.date.today().isoformat()
    if len(str(d)) == 7:
        d = f"{d}-01"
    serie_name = "ECB_MRR" if row.get("source") == "ecb" else "ECB_FRED_PROXY"
    conn.execute(
        "INSERT OR REPLACE INTO raw_series (data, serie, valor) VALUES (?, ?, ?)",
        (d, serie_name, row["value"]),
    )
    return 1
