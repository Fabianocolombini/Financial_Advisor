"""Derived time series for equity/alternatives class regime models."""

from __future__ import annotations

import datetime as dt

import pandas as pd

from motor.src.calculo.derivados import (
    breakeven_spot_series,
    compute_formula,
    distribution_yield_spread_series,
    dividend_yield_series,
    get_fred_series,
    nareit_yield_spread_series,
    preferred_spread_series,
)
from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.models.ig_regime_model import _delta_series, _z_at
from motor.src.calculo.proxy_indicators import compute_proxy_series
from motor.src.calculo.proxy_indicators import compute_proxy_series
from motor.src.calculo.models.cash_regime_model import _percentile_0_1, _scalar_at
from motor.src.dates import motor_as_of_date


def external_series(source: str, series_id: str) -> pd.Series:
    return get_external_series(source, series_id)


def cape_shiller_series() -> pd.Series:
    return external_series("shiller", "cape_shiller")


def curve_deinversion_lag_flag(as_of: dt.date, lookback_days: int = 126) -> bool:
    """True when 10y-2y was inverted within lookback and is now positive (C_lag)."""
    spread = get_fred_series("T10Y2Y")
    if spread.empty:
        return False
    cap = pd.Timestamp(as_of)
    truncated = spread.loc[pd.DatetimeIndex(pd.to_datetime(spread.index)) <= cap]
    if len(truncated) < 30:
        return False
    tail = truncated.iloc[-lookback_days:]
    cur = float(tail.iloc[-1])
    was_inverted = bool((tail < 0).any())
    return was_inverted and cur > 0


def earnings_revision_proxy_series(ticker: str = "SPY") -> pd.Series:
    return compute_proxy_series("earnings_revision_proxy", ticker)


def usd_weak_pct(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    dxy = get_fred_series("DTWEXBGS")
    pct, val = _percentile_0_1(dxy, as_of, window)
    return 1.0 - pct, val


def cape_gap_cheap_pct(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    """CAPE intl/US gap — lower ratio = intl cheaper."""
    us = cape_shiller_series()
    intl = external_series("star", "cape_by_country_us")
    if us.empty:
        us = get_fred_series("SPY")
    if intl.empty:
        pe = compute_formula("pe_EFA_div_SPY")
        if pe.empty:
            return 0.5, None
        pct, val = _percentile_0_1(pe, as_of, window)
        return 1.0 - pct, val
    combined = pd.concat([us, intl], axis=1, join="inner")
    if combined.empty:
        return 0.5, None
    ratio = combined.iloc[:, 0] / combined.iloc[:, 1].replace(0, pd.NA)
    ratio = ratio.dropna()
    pct, val = _percentile_0_1(ratio, as_of, window)
    return 1.0 - pct, float(val) if val is not None else None


def oecd_composite_z(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    oecd = get_fred_series("NAEXKP01USQ189S")
    if oecd.empty:
        oecd = get_fred_series("INDPRO")
    return _z_at(oecd, as_of, window)


def rate_diff_narrow_pct(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    rd = compute_formula("rate_differential")
    if rd.empty:
        rd = get_fred_series("DFF")
    pct, val = _percentile_0_1(rd.abs(), as_of, window)
    return 1.0 - pct, val


def commodity_index_z(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    from motor.src.ingestao.yfinance_client import get_price_series

    dbc = get_price_series("DBC")
    if dbc.empty:
        dbc = get_fred_series("DCOILWTICO")
    return _z_at(dbc.pct_change(21), as_of, window)


def china_equity_z(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    from motor.src.ingestao.yfinance_client import get_price_series

    fxi = get_price_series("FXI")
    if fxi.empty:
        fxi = get_price_series("MCHI")
    if fxi.empty:
        return 0.0, None
    ret = fxi.pct_change(63)
    return _z_at(ret, as_of, window)


def reit_valuation_cheap_pct(as_of: dt.date, window: int = 2520) -> tuple[float, float | None]:
    rv = compute_proxy_series("reit_valuation_percentile")
    if rv.empty:
        return 0.5, None
    pct, val = _percentile_0_1(rv, as_of, min(window, len(rv)))
    cheap = 1.0 - (pct if val is None or val <= 1 else val / 100.0)
    return cheap, val


def delta_nareit_spread_series(days: int = 20) -> pd.Series:
    ns = nareit_yield_spread_series()
    return _delta_series(ns, days)


def refi_stress_pct(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    y10 = get_fred_series("DGS10")
    return _percentile_0_1(y10, as_of, window)


def gold_etf_crowding_z(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    cot = external_series("cftc", "cot_gold_net")
    if cot.empty:
        gld = external_series("etf_holdings", "gld_holdings_tonnes")
        if gld.empty:
            return 0.0, None
        return _z_at(gld, as_of, window)
    return _z_at(cot, as_of, window)


def crude_backwardation_proxy(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    wti = get_fred_series("DCOILWTICO")
    stocks = get_fred_series("WCESTUS1")
    if wti.empty or stocks.empty:
        return 0.5, None
    inv_pct, _ = _percentile_0_1(stocks, as_of, window)
    price_pct, val = _percentile_0_1(wti, as_of, window)
    score = 0.5 * price_pct + 0.5 * (1.0 - inv_pct)
    return score, val


def inventory_tightness_pct(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    stocks = get_fred_series("WCESTUS1")
    if stocks.empty:
        return 0.5, None
    pct, val = _percentile_0_1(stocks, as_of, window)
    return 1.0 - pct, val


def rig_discount_proxy(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    from motor.src.ingestao.yfinance_client import get_price_series

    xle = get_price_series("XLE")
    wti = get_fred_series("DCOILWTICO")
    if xle.empty or wti.empty:
        return 0.5, None
    ratio = xle / wti.reindex(xle.index, method="ffill")
    pct, val = _percentile_0_1(ratio.dropna(), as_of, window)
    return 1.0 - pct, float(val) if val is not None else None


def energy_crowding_z(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    cot = external_series("cftc", "cot_crude_net")
    if cot.empty:
        return 0.0, None
    return _z_at(cot, as_of, window)


def delta_dys_series(days: int = 20) -> pd.Series:
    dys = distribution_yield_spread_series()
    return _delta_series(dys, days)


def biotech_rs_z(as_of: dt.date, window: int = 504) -> tuple[float, float | None]:
    from motor.src.ingestao.yfinance_client import get_price_series

    ibb = get_price_series("IBB")
    spy = get_price_series("SPY")
    if ibb.empty or spy.empty:
        return 0.0, None
    combined = pd.concat([ibb, spy], axis=1, join="inner")
    rel = combined.iloc[:, 0] / combined.iloc[:, 1]
    ret = rel.pct_change(63)
    return _z_at(ret, as_of, window)


def risk_appetite_pct(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    vix = get_fred_series("VIXCLS")
    pct, val = _percentile_0_1(vix, as_of, window)
    return 1.0 - pct, val


def sofr_proxy_pct(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    sofr = get_fred_series("SOFR")
    if sofr.empty:
        sofr = get_fred_series("DFF")
    return _percentile_0_1(sofr, as_of, window)


def nav_premium_series(ticker: str = "ARCC") -> pd.Series:
    from motor.src.ingestao.edgar_client import get_edgar_metric

    val = get_edgar_metric(ticker, "nav_premium_discount")
    if val is None:
        return pd.Series(dtype=float)
    today = motor_as_of_date()
    return pd.Series([float(val)], index=[today])


def non_accrual_series(ticker: str = "ARCC") -> pd.Series:
    from motor.src.ingestao.edgar_client import get_edgar_metric

    val = get_edgar_metric(ticker, "non_accrual_rate")
    if val is None:
        return pd.Series(dtype=float)
    today = motor_as_of_date()
    return pd.Series([float(val)], index=[today])


def breakeven_lagged_z(as_of: dt.date, window: int = 1260, lag: int = 63) -> tuple[float, float | None]:
    be = breakeven_spot_series()
    if be.empty:
        return 0.0, None
    lagged = be.shift(lag)
    gap = be - lagged
    return _z_at(gap.dropna(), as_of, window)


def infrastructure_gov_z(as_of: dt.date, window: int = 504) -> tuple[float, float | None]:
    from motor.src.ingestao.yfinance_client import get_price_series

    igf = get_price_series("IGF")
    if igf.empty:
        return 0.0, None
    ret = igf.pct_change(126)
    return _z_at(ret, as_of, window)


def utilities_z(as_of: dt.date, window: int = 504) -> tuple[float, float | None]:
    from motor.src.ingestao.yfinance_client import get_price_series

    xlu = get_price_series("XLU")
    if xlu.empty:
        return 0.0, None
    ret = xlu.pct_change(63)
    return _z_at(ret, as_of, window)


def reer_cheap_pct(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    return usd_weak_pct(as_of, window)


def fx_carry_penalty(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    rd = compute_formula("rate_differential")
    if rd.empty:
        return 0.5, None
    pct, val = _percentile_0_1(rd, as_of, window)
    return pct, val


def fx_crowding_penalty(as_of: dt.date, window: int = 1260) -> tuple[float, float | None]:
    rr = compute_proxy_series("risk_reversal_proxy")
    if rr.empty:
        return 0.5, None
    pct, val = _percentile_0_1(rr, as_of, window)
    return pct, val
