"""Financial Modeling Prep profile + key metrics (free tier)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx


@dataclass
class FmpFundamentals:
    symbol: str
    market_cap: float | None
    pe_ratio: float | None
    pb_ratio: float | None
    ev_to_ebitda: float | None
    debt_to_equity: float | None
    roe: float | None
    revenue_ttm: float | None
    eps_ttm: float | None
    period_end: date | None
    payload: dict[str, Any]


def _num(x: Any) -> float | None:
    if x is None:
        return None
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def fetch_fundamentals(api_key: str, symbol: str) -> FmpFundamentals | None:
    sym = symbol.upper()
    base = "https://financialmodelingprep.com/api/v3"
    params = {"apikey": api_key}
    with httpx.Client(timeout=45.0) as client:
        prof = client.get(f"{base}/profile/{sym}", params=params)
        if prof.status_code != 200:
            return None
        plist = prof.json()
        if not plist or not isinstance(plist, list):
            return None
        p = plist[0]
        km = client.get(f"{base}/key-metrics-ttm/{sym}", params=params)
        krows = km.json() if km.status_code == 200 else []
        k0 = krows[0] if krows and isinstance(krows, list) else {}
        ratios = client.get(f"{base}/ratios-ttm/{sym}", params=params)
        rrows = ratios.json() if ratios.status_code == 200 else []
        r0 = rrows[0] if rrows and isinstance(rrows, list) else {}

    pe = _num(p.get("pe")) or _num(r0.get("peRatioTTM"))
    pb = _num(p.get("priceToBookRatioTTM")) or _num(r0.get("priceToBookRatioTTM"))
    mcap = _num(p.get("mktCap"))
    ev_e = _num(k0.get("enterpriseValueOverEBITDATTM"))
    de = _num(r0.get("debtEquityRatioTTM"))
    roe_v = _num(r0.get("returnOnEquityTTM"))
    rev = _num(k0.get("revenuePerShareTTM"))
    # scale rough revenue proxy if only per-share
    eps = _num(p.get("eps"))
    last_div = p.get("lastDiv")
    ipo = p.get("ipoDate")
    period_end: date | None = None
    if ipo:
        try:
            y, m, d = str(ipo).split("-")[:3]
            period_end = date(int(y), int(m), int(d))
        except (ValueError, IndexError):
            period_end = None

    payload = {"profile": p, "key_metrics_ttm": k0, "ratios_ttm": r0}

    return FmpFundamentals(
        symbol=sym,
        market_cap=mcap,
        pe_ratio=pe,
        pb_ratio=pb,
        ev_to_ebitda=ev_e,
        debt_to_equity=de,
        roe=roe_v,
        revenue_ttm=rev,
        eps_ttm=eps,
        period_end=period_end,
        payload=payload,
    )
