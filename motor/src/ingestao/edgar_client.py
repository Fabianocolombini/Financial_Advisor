"""SEC EDGAR metrics for BDCs (non-accrual rate, NAV proxy)."""

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


def fetch_bdc_metric(ticker: str, metric: str) -> tuple[str, float] | None:
    """Return (filing_date, value) for metric."""
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
            content = r.text
        except Exception:
            return None
        if metric == "non_accrual_rate":
            val = _parse_non_accrual_from_html(content)
            if val is not None:
                return filed_at, val
    return None


def ingest_aba_edgar(aba_id: str) -> dict[str, Any]:
    init_db()
    aba = load_aba_config(aba_id)
    results: dict[str, Any] = {}
    today = dt.date.today().isoformat()
    with get_connection() as conn:
        for item in aba.get("universo", []):
            metric = item.get("edgar_metric")
            if not metric:
                continue
            ticker = item["ticker"].upper()
            fetched = fetch_bdc_metric(ticker, metric)
            if fetched:
                filed_at, val = fetched
                conn.execute(
                    """
                    INSERT OR REPLACE INTO edgar_metrics (ticker, data, metric, valor)
                    VALUES (?, ?, ?, ?)
                    """,
                    (ticker, filed_at, metric, val),
                )
                results[ticker] = {"metric": metric, "date": filed_at, "value": val}
            else:
                results[ticker] = {"metric": metric, "error": "not_found"}
        conn.commit()
    return results


def get_edgar_metric(ticker: str, metric: str) -> float | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT valor FROM edgar_metrics
            WHERE ticker = ? AND metric = ?
            ORDER BY data DESC LIMIT 1
            """,
            (ticker.upper(), metric),
        ).fetchone()
    return float(row["valor"]) if row else None
