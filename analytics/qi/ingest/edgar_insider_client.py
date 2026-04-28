"""SEC EDGAR Form 4 insider transactions ingestion."""

from __future__ import annotations

import datetime as dt
import logging
import re
import time
import xml.etree.ElementTree as ET
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

EDGAR_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik}.json"
EDGAR_ARCHIVES = "https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{doc}"
EDGAR_HEADERS = {
    "User-Agent": "PIS-Analytics contact@example.com",
    "Accept-Encoding": "gzip, deflate",
}
EDGAR_DELAY = 0.2
log = logging.getLogger(__name__)


def _http_get_json(client: httpx.Client, url: str) -> dict[str, Any] | None:
    try:
        r = client.get(url, headers=EDGAR_HEADERS, timeout=25.0)
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def _ticker_to_cik_map(client: httpx.Client) -> dict[str, str]:
    data = _http_get_json(client, EDGAR_TICKER_MAP_URL) or {}
    out: dict[str, str] = {}
    for _, row in data.items():
        ticker = str(row.get("ticker", "")).upper()
        cik = str(row.get("cik_str", "")).strip()
        if ticker and cik:
            out[ticker] = cik.zfill(10)
    return out


def _recent_form4_docs(client: httpx.Client, cik10: str, days_back: int) -> list[dict[str, str]]:
    data = _http_get_json(client, EDGAR_SUBMISSIONS.format(cik=cik10))
    if not data:
        return []
    rec = data.get("filings", {}).get("recent", {})
    forms = rec.get("form", [])
    filing_dates = rec.get("filingDate", [])
    accessions = rec.get("accessionNumber", [])
    docs = rec.get("primaryDocument", [])
    cutoff = dt.date.today() - dt.timedelta(days=days_back)
    out: list[dict[str, str]] = []
    for f, d, a, doc in zip(forms, filing_dates, accessions, docs):
        if f != "4":
            continue
        try:
            filed = dt.date.fromisoformat(d)
        except Exception:
            continue
        if filed < cutoff:
            continue
        acc_nodash = str(a).replace("-", "")
        cik_int = str(int(cik10))
        out.append({"filed_at": d, "cik_int": cik_int, "acc_nodash": acc_nodash, "doc": doc})
    return out


def _parse_form4_xml(content: str) -> list[dict[str, Any]]:
    if "ownershipdocument" not in content.lower():
        return []
    cleaned = re.sub(r' xmlns[^"]*"[^"]*"', "", content)
    try:
        root = ET.fromstring(cleaned.encode("utf-8"))
    except ET.ParseError:
        return []

    owner = (
        (root.findtext(".//rptOwnerName") or root.findtext(".//reportingOwner/reportingOwnerId/rptOwnerName") or "")
        .strip()
    )
    title = (
        (root.findtext(".//officerTitle") or root.findtext(".//reportingOwnerRelationship/officerTitle") or "")
        .strip()
        or None
    )
    ownership = (root.findtext(".//directOrIndirectOwnership/value") or "D").strip()

    out: list[dict[str, Any]] = []
    for path in (".//nonDerivativeTable/nonDerivativeTransaction", ".//nonDerivativeTransaction"):
        for txn in root.findall(path):
            code = (
                txn.findtext(".//transactionCoding/transactionCode")
                or txn.findtext(".//transactionCode")
                or ""
            ).strip()
            if code not in {"P", "S"}:
                continue
            tdate = (
                txn.findtext(".//transactionDate/value")
                or txn.findtext(".//transactionDate")
                or ""
            ).strip()[:10]
            shares_raw = (
                txn.findtext(".//transactionAmounts/transactionShares/value")
                or txn.findtext(".//transactionShares/value")
                or "0"
            ).replace(",", "")
            price_raw = (
                txn.findtext(".//transactionAmounts/transactionPricePerShare/value")
                or txn.findtext(".//transactionPricePerShare/value")
                or ""
            )
            try:
                shares_f = float(shares_raw)
                if shares_f <= 0:
                    continue
            except Exception:
                continue
            try:
                price_f = float(price_raw.replace(",", "")) if price_raw else None
            except Exception:
                price_f = None
            out.append(
                {
                    "insider_name": owner or "Unknown",
                    "insider_title": title,
                    "transaction_date": tdate,
                    "transaction_type": code,
                    "shares": shares_f,
                    "price_per_share": price_f,
                    "value_total": (shares_f * price_f) if price_f is not None else None,
                    "ownership_type": ownership or "D",
                }
            )
        if out:
            break
    return out


def _fetch_form4_xml(client: httpx.Client, filing: dict[str, str]) -> str | None:
    urls = [
        EDGAR_ARCHIVES.format(
            cik=filing["cik_int"],
            acc=filing["acc_nodash"],
            doc=filing["doc"],
        )
    ]
    primary = filing["doc"]
    if not primary.lower().endswith(".xml"):
        # Common SEC naming fallback for ownership docs
        urls.append(
            EDGAR_ARCHIVES.format(
                cik=filing["cik_int"],
                acc=filing["acc_nodash"],
                doc=primary.rsplit(".", 1)[0] + ".xml",
            )
        )
        urls.append(
            EDGAR_ARCHIVES.format(
                cik=filing["cik_int"],
                acc=filing["acc_nodash"],
                doc="xslF345X03/wf-form4.xml",
            )
        )
    for u in urls:
        try:
            r = client.get(u, headers=EDGAR_HEADERS, timeout=30.0)
            time.sleep(EDGAR_DELAY)
            if r.status_code == 200 and "ownershipdocument" in r.text.lower():
                return r.text
        except Exception:
            continue
    return None


def ingest_insider_transactions(
    session: Session,
    symbols: list[str],
    days_back: int = 90,
) -> dict[str, int]:
    ok = 0
    failed = 0
    upserted = 0

    with httpx.Client() as client:
        cik_map = _ticker_to_cik_map(client)
        for symbol in symbols:
            try:
                sym = symbol.upper().strip()
                asset = session.execute(
                    text("SELECT id FROM qi_asset WHERE symbol=:s AND is_active=true"),
                    {"s": sym},
                ).fetchone()
                if not asset:
                    continue
                cik10 = cik_map.get(sym)
                if not cik10:
                    log.debug("insider %s: CIK não encontrado no company_tickers.json", sym)
                    failed += 1
                    continue
                filings = _recent_form4_docs(client, cik10, days_back=days_back)
                if not filings:
                    log.debug("insider %s CIK=%s: nenhum Form 4 recente", sym, cik10)
                    ok += 1
                    continue
                for filing in filings[:10]:
                    try:
                        xml = _fetch_form4_xml(client, filing)
                        if not xml:
                            continue
                        txns = _parse_form4_xml(xml)
                        log.debug(
                            "insider %s filing %s: %s transações",
                            sym,
                            filing["filed_at"],
                            len(txns),
                        )
                        for t in txns:
                            txd = t["transaction_date"]
                            if not re.match(r"^\d{4}-\d{2}-\d{2}$", txd):
                                continue
                            session.execute(
                                text(
                                    """
                                    INSERT INTO qi_insider_transaction
                                      (id, asset_id, symbol, filed_at, transaction_date, insider_name,
                                       insider_title, transaction_type, shares, price_per_share,
                                       value_total, ownership_type, form_url)
                                    VALUES
                                      (gen_random_uuid()::text, :asset_id, :symbol, :filed_at, :transaction_date,
                                       :insider_name, :insider_title, :transaction_type, :shares, :price_per_share,
                                       :value_total, :ownership_type, :form_url)
                                    ON CONFLICT (symbol, filed_at, insider_name, transaction_type, shares)
                                    DO NOTHING
                                    """
                                ),
                                {
                                    "asset_id": asset[0],
                                    "symbol": sym,
                                    "filed_at": filing["filed_at"],
                                    "transaction_date": txd,
                                    "insider_name": t["insider_name"],
                                    "insider_title": t["insider_title"],
                                    "transaction_type": t["transaction_type"],
                                    "shares": t["shares"],
                                    "price_per_share": t["price_per_share"],
                                    "value_total": t["value_total"],
                                    "ownership_type": t["ownership_type"],
                                    "form_url": EDGAR_ARCHIVES.format(
                                        cik=filing["cik_int"],
                                        acc=filing["acc_nodash"],
                                        doc=filing["doc"],
                                    ),
                                },
                            )
                            upserted += 1
                    except Exception:
                        continue
                ok += 1
            except Exception:
                failed += 1
    session.flush()
    return {
        "symbols_ok": ok,
        "symbols_failed": failed,
        "transactions_upserted": upserted,
    }

