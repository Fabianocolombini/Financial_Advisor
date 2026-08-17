"""SEC EDGAR metrics for BDCs (non-accrual, NAV per share, NII coverage)."""

from __future__ import annotations

import datetime as dt
import json
import logging
import re
import time
from typing import Any

import httpx

from motor.src.config_loader import load_aba_config
from motor.src.db.connection import get_connection, init_db

EDGAR_TICKER_MAP = "https://www.sec.gov/files/company_tickers.json"
EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik}.json"
EDGAR_HEADERS = {
    "User-Agent": "FinancialAdvisor-Motor contact@example.com",
    "Accept-Encoding": "gzip, deflate",
}
log = logging.getLogger(__name__)


def _get_json(client: httpx.Client, url: str) -> dict[str, Any] | None:
    try:
        r = client.get(url, headers=EDGAR_HEADERS, timeout=30.0)
        if r.status_code != 200:
            return None
        return r.json()
    except Exception as e:
        log.warning("EDGAR fetch failed %s: %s", url, e)
        return None


def ticker_to_cik(client: httpx.Client, ticker: str) -> str | None:
    data = _get_json(client, EDGAR_TICKER_MAP) or {}
    t = ticker.upper()
    for _, row in data.items():
        if str(row.get("ticker", "")).upper() == t:
            return str(row.get("cik_str", "")).zfill(10)
    return None


def _latest_10q_url(client: httpx.Client, cik10: str) -> tuple[str, str] | None:
    data = _get_json(client, EDGAR_SUBMISSIONS.format(cik=cik10))
    if not data:
        return None
    rec = data.get("filings", {}).get("recent", {})
    forms = rec.get("form", [])
    dates = rec.get("filingDate", [])
    accessions = rec.get("accessionNumber", [])
    docs = rec.get("primaryDocument", [])
    for form, d, acc, doc in zip(forms, dates, accessions, docs):
        if form not in ("10-Q", "10-K"):
            continue
        cik_int = str(int(cik10))
        acc_nodash = str(acc).replace("-", "")
        url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/{doc}"
        return d, url
    return None


def _parse_non_accrual_from_html(text: str) -> float | None:
    """Extract non-accrual % from filing text (heuristic)."""
    patterns = [
        r"non[- ]accrual[^%]{0,80}?(\d+\.?\d*)\s*%",
        r"nonaccrual[^%]{0,80}?(\d+\.?\d*)\s*%",
        r"non[- ]accrual[^0-9]{0,40}(\d+\.?\d*)",
    ]
    text_lower = text.lower()
    for pat in patterns:
        m = re.search(pat, text_lower, re.I)
        if m:
            try:
                val = float(m.group(1))
                if val > 100:
                    val = val / 100
                return val
            except ValueError:
                continue
    return None


def _parse_nav_from_html(text: str) -> float | None:
    patterns = [
        r"net asset value per share[^$]{0,40}\$?\s*(\d+\.?\d*)",
        r"nav per share[^$]{0,40}\$?\s*(\d+\.?\d*)",
        r"net assets per share[^$]{0,40}\$?\s*(\d+\.?\d*)",
    ]
    text_lower = text.lower()
    for pat in patterns:
        m = re.search(pat, text_lower, re.I)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                continue
    return None


def _normalize_coverage_ratio(val: float) -> float | None:
    """Map parsed coverage to a ratio (typically 0.3–3.0x). Percents like 114 → 1.14."""
    if val <= 0:
        return None
    if val > 5:
        if val > 300:
            return None
        val = val / 100.0
    if val > 3.5:
        return None
    return val


def _parse_nii_coverage_from_html(text: str) -> float | None:
    """Heuristic NII / distributions from a 10-Q/10-K. Reported NII, not fee-adjusted."""
    text_lower = text.lower()
    coverage_patterns = [
        r"dividend coverage(?: ratio)?[^0-9]{0,40}(\d+\.?\d*)\s*(?:x|times|%)",
        r"nii coverage[^0-9]{0,40}(\d+\.?\d*)\s*(?:x|times|%)",
        r"coverage ratio[^0-9]{0,40}(\d+\.?\d*)\s*(?:x|times)",
        r"net investment income[^.]{0,180}cover(?:age|ed)[^0-9]{0,30}(\d+\.?\d*)\s*(?:x|times|%)",
        r"cover(?:age|ed)[^0-9]{0,40}(\d+\.?\d*)\s*(?:x|times)\s*(?:by )?(?:net investment income|nii)",
        r"distributions? were covered[^0-9]{0,40}(\d+\.?\d*)",
    ]
    for pat in coverage_patterns:
        m = re.search(pat, text_lower, re.I)
        if m:
            try:
                parsed = _normalize_coverage_ratio(float(m.group(1)))
            except ValueError:
                continue
            if parsed is not None:
                return parsed

    nii_ps_patterns = [
        r"net investment income per (?:common )?share[^$0-9]{0,40}\$?\s*(\d+\.\d+)",
        r"nii per (?:common )?share[^$0-9]{0,40}\$?\s*(\d+\.\d+)",
    ]
    dps_patterns = [
        r"(?:regular )?(?:dividend|distribution)s? (?:of |declared |paid )?[^$0-9]{0,40}\$?\s*(\d+\.\d+)\s*per (?:common )?share",
        r"(?:dividends?|distributions?) (?:declared|paid) per (?:common )?share[^$0-9]{0,40}\$?\s*(\d+\.\d+)",
    ]
    nii_ps = None
    for pat in nii_ps_patterns:
        m = re.search(pat, text_lower, re.I)
        if m:
            try:
                nii_ps = float(m.group(1))
                break
            except ValueError:
                continue
    dps = None
    for pat in dps_patterns:
        m = re.search(pat, text_lower, re.I)
        if m:
            try:
                dps = float(m.group(1))
                break
            except ValueError:
                continue
    if nii_ps is not None and dps is not None and dps > 0:
        return _normalize_coverage_ratio(nii_ps / dps)
    return None


def _latest_price(ticker: str) -> float | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT close FROM price_daily
            WHERE ticker = ? ORDER BY data DESC LIMIT 1
            """,
            (ticker.upper(),),
        ).fetchone()
    if row:
        return float(row["close"])
    return None


def _load_latest_10q_text(ticker: str) -> tuple[str, str] | None:
    """Return (filing_date, html) for the latest 10-Q/10-K."""
    with httpx.Client() as client:
        cik = ticker_to_cik(client, ticker)
        if not cik:
            return None
        filing = _latest_10q_url(client, cik)
        if not filing:
            return None
        filed_at, doc_url = filing
        time.sleep(0.2)
        try:
            r = client.get(doc_url, headers=EDGAR_HEADERS, timeout=60.0)
            if r.status_code != 200:
                return None
            return filed_at, r.text
        except Exception:
            return None


def fetch_bdc_filing_metrics(ticker: str) -> tuple[str, dict[str, float]] | None:
    """Parse non-accrual, NAV/share, NAV premium, and NII coverage from one filing."""
    loaded = _load_latest_10q_text(ticker)
    if not loaded:
        return None
    filed_at, content = loaded
    metrics: dict[str, float] = {}
    na = _parse_non_accrual_from_html(content)
    if na is not None:
        metrics["non_accrual_rate"] = na
    nav = _parse_nav_from_html(content)
    if nav and nav > 0:
        metrics["nav_per_share"] = nav
        price = _latest_price(ticker)
        if price is None:
            from motor.src.ingestao.yfinance_client import ingest_ticker

            ingest_ticker(ticker.upper(), "2019-01-01")
            price = _latest_price(ticker)
        if price:
            metrics["nav_premium_discount"] = (price / nav - 1.0) * 100.0
    cov = _parse_nii_coverage_from_html(content)
    if cov is not None:
        metrics["nii_coverage"] = cov
    if not metrics:
        return None
    return filed_at, metrics


def fetch_nav_premium_discount(ticker: str) -> tuple[str, float] | None:
    """Premium/discount % = (price/NAV - 1) * 100."""
    parsed = fetch_bdc_filing_metrics(ticker)
    if not parsed:
        return None
    filed_at, metrics = parsed
    if "nav_premium_discount" not in metrics:
        return None
    return filed_at, metrics["nav_premium_discount"]


def fetch_bdc_metric(ticker: str, metric: str) -> tuple[str, float] | None:
    """Return (filing_date, value) for metric."""
    parsed = fetch_bdc_filing_metrics(ticker)
    if not parsed:
        return None
    filed_at, metrics = parsed
    if metric not in metrics:
        return None
    return filed_at, metrics[metric]


def ingest_aba_edgar(aba_id: str) -> dict[str, Any]:
    init_db()
    aba = load_aba_config(aba_id)
    results: dict[str, Any] = {}
    with get_connection() as conn:
        for item in aba.get("universo", []):
            if not item.get("edgar_metric"):
                continue
            ticker = item["ticker"].upper()
            fetched = fetch_bdc_filing_metrics(ticker)
            if fetched:
                filed_at, metrics = fetched
                for metric, val in metrics.items():
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO edgar_metrics (ticker, data, metric, valor)
                        VALUES (?, ?, ?, ?)
                        """,
                        (ticker, filed_at, metric, val),
                    )
                results[ticker] = {"date": filed_at, "metrics": metrics}
            else:
                results[ticker] = {"error": "not_found"}
        conn.commit()
    return results


def get_edgar_metric(ticker: str, metric: str) -> float | None:
    return get_edgar_metric_at(ticker, metric, as_of=None)


def get_edgar_metric_at(
    ticker: str, metric: str, as_of: dt.date | None = None
) -> float | None:
    """Hold-last: latest print with filing date <= as_of (or latest if as_of is None)."""
    sql = """
        SELECT valor FROM edgar_metrics
        WHERE ticker = ? AND metric = ?
    """
    params: list[Any] = [ticker.upper(), metric]
    if as_of is not None:
        sql += " AND data <= ?"
        params.append(as_of.isoformat())
    sql += " ORDER BY data DESC LIMIT 1"
    with get_connection() as conn:
        row = conn.execute(sql, params).fetchone()
    return float(row["valor"]) if row else None
