"""Tipo B proxy indicators — always suffixed *_proxy with rationale."""

from __future__ import annotations

import datetime as dt

import pandas as pd

from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.zscore import percentile_latest_detail
from motor.src.db.external_series_store import upsert_point
from motor.src.ingestao.edgar_client import EDGAR_HEADERS, ticker_to_cik

_PROXY_FORMULAS = frozenset(
    {
        "hy_distress_proxy_score",
        "bond_vol_proxy",
        "reit_valuation_percentile",
        "risk_reversal_proxy",
        "private_funding_proxy",
        "earnings_revision_proxy",
    }
)


def is_proxy_formula(formula: str) -> bool:
    return formula in _PROXY_FORMULAS


def compute_proxy_series(formula: str, ticker: str | None = None) -> pd.Series:
    if formula == "hy_distress_proxy_score":
        return _hy_distress_proxy()
    if formula == "bond_vol_proxy":
        return _bond_vol_proxy()
    if formula == "reit_valuation_percentile":
        return _reit_valuation_percentile()
    if formula == "risk_reversal_proxy":
        return _risk_reversal_proxy()
    if formula == "private_funding_proxy":
        return _private_funding_proxy()
    if formula == "earnings_revision_proxy" and ticker:
        return _earnings_revision_proxy(ticker)
    return pd.Series(dtype=float)


def _hy_distress_proxy() -> pd.Series:
    from motor.src.calculo.derivados import get_fred_series
    from motor.src.calculo.series_sources import get_price_daily_series

    ccc = get_fred_series("BAMLH0A3HYC")
    hyg = get_price_daily_series("HYG")
    if ccc.empty or hyg.empty:
        return pd.Series(dtype=float)
    hyg_ret = hyg.pct_change()
    vol = hyg_ret.rolling(20).std() * (252 ** 0.5)
    combined = pd.concat([ccc, vol], axis=1, join="inner")
    if combined.empty:
        return pd.Series(dtype=float)
    out_idx = []
    out_vals = []
    for i in range(len(combined)):
        tail_ccc = combined.iloc[: i + 1, 0]
        tail_vol = combined.iloc[: i + 1, 1]
        if len(tail_ccc) < 30:
            continue
        p1, _, _ = percentile_latest_detail(tail_ccc, window=min(1260, len(tail_ccc)))
        p2, _, _ = percentile_latest_detail(tail_vol, window=min(1260, len(tail_vol)))
        out_idx.append(combined.index[i])
        out_vals.append(0.5 * p1 + 0.5 * p2)
    return pd.Series(out_vals, index=out_idx)


def _bond_vol_proxy() -> pd.Series:
    from motor.src.calculo.series_sources import get_price_daily_series

    ext = get_external_series("cboe", "tlt_iv_proxy")
    if not ext.empty:
        return ext
    tlt = get_price_daily_series("TLT")
    if tlt.empty:
        return pd.Series(dtype=float)
    ret = tlt.pct_change()
    return ret.rolling(20).std() * (252 ** 0.5)


def _reit_valuation_percentile() -> pd.Series:
    spread = get_external_series("nareit", "nareit_yield_spread")
    if spread.empty:
        from motor.src.calculo.derivados import compute_formula

        spread = compute_formula("nareit_yield_spread")
    if spread.empty:
        return pd.Series(dtype=float)
    out_vals = []
    out_idx = []
    for i in range(len(spread)):
        tail = spread.iloc[: i + 1]
        if len(tail) < 24:
            continue
        pct, _, _ = percentile_latest_detail(tail, window=min(2520, len(tail)))
        out_idx.append(spread.index[i])
        out_vals.append(pct)
    return pd.Series(out_vals, index=out_idx)


def _risk_reversal_proxy() -> pd.Series:
    from motor.src.calculo.series_sources import get_price_daily_series

    ext = get_external_series("cboe", "fxe_skew_proxy")
    if not ext.empty:
        return ext
    # fallback: realized vol FXE
    fxe = get_price_daily_series("FXE")
    if fxe.empty:
        return pd.Series(dtype=float)
    ret = fxe.pct_change()
    return ret.rolling(20).std() * (252 ** 0.5)


def _private_funding_proxy() -> pd.Series:
    ext = get_external_series("edgar", "form_d_biotech_90d")
    if not ext.empty:
        return ext
    return pd.Series(dtype=float)


def _earnings_revision_proxy(ticker: str) -> pd.Series:
    """PEAD-style 3d return z-score around earnings (yfinance calendar)."""
    from motor.src.calculo.series_sources import get_price_daily_series
    from motor.src.ingestao.yfinance_client import ingest_ticker

    t = ticker.upper()
    ingest_ticker(t, "2019-01-01")
    prices = get_price_daily_series(t)
    if prices.empty:
        return pd.Series(dtype=float)
    try:
        import yfinance as yf

        cal = yf.Ticker(t).calendar
        dates: list[dt.date] = []
        if cal is not None:
            if hasattr(cal, "get"):
                ed = cal.get("Earnings Date") or cal.get("EarningsDate")
                if ed is not None:
                    if isinstance(ed, (list, tuple)):
                        for d in ed:
                            dates.append(pd.Timestamp(d).date())
                    else:
                        dates.append(pd.Timestamp(ed).date())
    except Exception:
        dates = []
    events: list[float] = []
    for ed in dates:
        idx = prices.index.asof(pd.Timestamp(ed))
        if pd.isna(idx):
            continue
        pos = prices.index.get_indexer([idx], method="nearest")[0]
        if pos < 1 or pos + 3 >= len(prices):
            continue
        prior = float(prices.iloc[pos - 1])
        post = float(prices.iloc[pos + 3])
        if prior:
            events.append((post / prior) - 1.0)
    if not events:
        return pd.Series(dtype=float)
    val = float(sum(events) / len(events))
    today = dt.date.today()
    return pd.Series([val], index=[today])


def ingest_form_d_biotech(conn) -> int:
    """Count Form D filings in last 90d for biotech SIC (proxy)."""
    # Heuristic: store aggregate count from SEC full-text search is heavy;
    # use external_series incremental from edgar submissions scan for sample tickers.
    from motor.src.ingestao.edgar_client import ticker_to_cik, EDGAR_HEADERS
    import httpx

    count = 0
    with httpx.Client() as client:
        for sym in ("IBB", "XBI", "LABU"):
            cik = ticker_to_cik(client, sym)
            if not cik:
                continue
            url = f"https://data.sec.gov/submissions/CIK{cik}.json"
            try:
                r = client.get(url, headers=EDGAR_HEADERS, timeout=30)
                if r.status_code != 200:
                    continue
                data = r.json()
                forms = data.get("filings", {}).get("recent", {}).get("form", [])
                dates = data.get("filings", {}).get("recent", {}).get("filingDate", [])
                cutoff = dt.date.today() - dt.timedelta(days=90)
                for form, d in zip(forms, dates):
                    if form == "D" and dt.date.fromisoformat(d) >= cutoff:
                        count += 1
            except Exception:
                continue
    today = dt.date.today().isoformat()
    from motor.src.db.external_series_store import upsert_point

    upsert_point("edgar", "form_d_biotech_90d", today, float(count), conn=conn)
    return 1
