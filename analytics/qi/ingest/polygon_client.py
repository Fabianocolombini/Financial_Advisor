"""Polygon.io aggregates (daily OHLCV). Free tier: delayed; respect limits."""

from __future__ import annotations


from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx


@dataclass
class DailyBar:
    trade_date: date
    open: float
    high: float
    low: float
    close: float
    volume: int
    adjusted_close: float | None


def fetch_daily_aggs(
    api_key: str,
    ticker: str,
    start: date,
    end: date,
    adjusted: bool = True,
) -> list[DailyBar]:
    """GET /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}"""
    t = ticker.upper().replace(".", "-")
    url = (
        f"https://api.polygon.io/v2/aggs/ticker/{t}/range/1/day/"
        f"{start.isoformat()}/{end.isoformat()}"
    )
    params: dict[str, Any] = {"adjusted": "true" if adjusted else "false", "sort": "asc", "limit": 50000}
    if api_key:
        params["apiKey"] = api_key
    with httpx.Client(timeout=120.0) as client:
        res = client.get(url, params=params)
        if res.status_code == 403:
            raise RuntimeError("Polygon returned 403 — check POLYGON_API_KEY and plan limits.")
        res.raise_for_status()
        body = res.json()
    results = body.get("results") or []
    out: list[DailyBar] = []
    for r in results:
        # ms timestamp
        ts = r.get("t")
        if ts is None:
            continue
        from datetime import UTC, datetime

        d = datetime.fromtimestamp(ts / 1000, tz=UTC).date()
        out.append(
            DailyBar(
                trade_date=d,
                open=float(r["o"]),
                high=float(r["h"]),
                low=float(r["l"]),
                close=float(r["c"]),
                volume=int(r.get("v", 0)),
                adjusted_close=float(r["c"]) if adjusted else None,
            )
        )
    return out
