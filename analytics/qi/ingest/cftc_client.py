"""CFTC COT ingestion via public Socrata endpoint."""

from __future__ import annotations

import datetime as dt
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

CFTC_URL = "https://publicreporting.cftc.gov/resource/jun7-fc8e.json"

TARGET_MARKETS = {
    "GOLD": "GOLD",
    "CRUDE OIL, LIGHT SWEET": "CRUDE OIL",
    "COPPER": "COPPER",
    "NATURAL GAS": "NATURAL GAS",
    "E-MINI S&P 500": "S&P 500",
    "E-MINI NASDAQ 100": "NASDAQ-100",
    "U.S. TREASURY BONDS": "T-BONDS",
    "10-YEAR U.S. TREASURY NOTES": "T-NOTES 10Y",
    "EURO FX": "EUR/USD",
}


def _list_available_market_names(client: httpx.Client) -> list[str]:
    params = {
        "$select": "market_and_exchange_names",
        "$group": "market_and_exchange_names",
        "$limit": 2000,
        "$order": "market_and_exchange_names ASC",
    }
    r = client.get(CFTC_URL, params=params)
    if r.status_code != 200:
        return []
    return [str(x.get("market_and_exchange_names", "")) for x in r.json() if x.get("market_and_exchange_names")]


def find_market_name(available_names: list[str], keyword: str) -> str | None:
    key = keyword.upper()
    for name in available_names:
        if name.upper().startswith(key):
            return name
    for name in available_names:
        if key in name.upper():
            return name
    return None


def ingest_cot_data(session: Session, weeks_back: int = 52) -> dict[str, int]:
    since = (dt.date.today() - dt.timedelta(weeks=weeks_back)).isoformat()
    upserted = 0
    with httpx.Client(timeout=30.0) as client:
        available_names = _list_available_market_names(client)
        resolved_markets: dict[str, str] = {}
        for keyword, commodity in TARGET_MARKETS.items():
            match = find_market_name(available_names, keyword)
            if match:
                resolved_markets[match] = commodity

        for market_name, commodity_key in resolved_markets.items():
            params = {
                "$where": f"market_and_exchange_names='{market_name}' AND report_date_as_yyyy_mm_dd >= '{since}'",
                "$order": "report_date_as_yyyy_mm_dd DESC",
                "$limit": weeks_back + 8,
            }
            try:
                r = client.get(CFTC_URL, params=params)
                if r.status_code != 200:
                    continue
                rows = r.json()
            except Exception:
                continue

            for row in rows:
                try:
                    nc_long = int(row.get("noncomm_positions_long_all", 0))
                    nc_short = int(row.get("noncomm_positions_short_all", 0))
                    c_long = int(row.get("comm_positions_long_all", 0))
                    c_short = int(row.get("comm_positions_short_all", 0))
                    oi = int(row.get("open_interest_all", 0))
                    net_spec = nc_long - nc_short
                    net_spec_pct = (net_spec / oi) if oi > 0 else None
                    report_date = str(row.get("report_date_as_yyyy_mm_dd", ""))[:10]
                    if len(report_date) != 10:
                        continue
                except Exception:
                    continue

                session.execute(
                    text(
                        """
                        INSERT INTO qi_cot_position
                          (id, commodity, report_date, commercial_long, commercial_short,
                           noncommercial_long, noncommercial_short, net_speculative,
                           net_speculative_pct, open_interest)
                        VALUES
                          (gen_random_uuid()::text, :commodity, :report_date, :c_long, :c_short,
                           :nc_long, :nc_short, :net_spec, :net_spec_pct, :oi)
                        ON CONFLICT (commodity, report_date)
                        DO UPDATE SET
                          commercial_long = EXCLUDED.commercial_long,
                          commercial_short = EXCLUDED.commercial_short,
                          noncommercial_long = EXCLUDED.noncommercial_long,
                          noncommercial_short = EXCLUDED.noncommercial_short,
                          net_speculative = EXCLUDED.net_speculative,
                          net_speculative_pct = EXCLUDED.net_speculative_pct,
                          open_interest = EXCLUDED.open_interest
                        """
                    ),
                    {
                        "commodity": commodity_key,
                        "report_date": report_date,
                        "c_long": c_long,
                        "c_short": c_short,
                        "nc_long": nc_long,
                        "nc_short": nc_short,
                        "net_spec": net_spec,
                        "net_spec_pct": net_spec_pct,
                        "oi": oi,
                    },
                )
                upserted += 1
    session.flush()
    return {"rows_upserted": upserted}

