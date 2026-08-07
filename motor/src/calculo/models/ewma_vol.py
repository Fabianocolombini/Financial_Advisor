"""EWMA volatility forecasts for sleeve proxies."""

from __future__ import annotations

from typing import Any

import pandas as pd

from motor.src.calculo.series_sources import get_price_daily_series
from motor.src.calculo.zscore import ewma_volatility

_SLEEVES = {
    "us_equity": "SPY",
    "fi_treasury": "TLT",
    "fi_hy": "HYG",
}


def compute_ewma_vol_forecasts(lam: float = 0.94) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for sleeve, ticker in _SLEEVES.items():
        prices = get_price_daily_series(ticker)
        if prices.empty:
            continue
        ret = prices.pct_change().dropna()
        vol = ewma_volatility(ret, lam=lam)
        out[sleeve] = {
            "ticker": ticker,
            "ewma_vol_annualized": vol,
            "lambda": lam,
        }
    return out
