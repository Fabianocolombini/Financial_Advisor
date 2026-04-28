"""SEC EDGAR 13F holdings ingestion for curated filers."""

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

EDGAR_HEADERS = {
    "User-Agent": "PIS-Analytics contact@example.com",
    "Accept-Encoding": "gzip, deflate",
}
EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik}.json"
EDGAR_ARCHIVES = "https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{doc}"
EDGAR_DELAY = 0.2
log = logging.getLogger(__name__)

TOP_INSTITUTIONAL_FILERS = {
    "0001067983": "Berkshire Hathaway",
    "0000909832": "Vanguard",
    "0001057120": "BlackRock",
    "0000081023": "JPMorgan Chase",
    "0001350694": "Bridgewater Associates",
}


def _latest_13f_doc(client: httpx.Client, cik10: str) -> dict[str, str] | None:
    try:
        r = client.get(EDGAR_SUBMISSIONS.format(cik=cik10), headers=EDGAR_HEADERS, timeout=25.0)
        if r.status_code != 200:
            return None
        data = r.json()
    except Exception:
        return None
    rec = data.get("filings", {}).get("recent", {})
    forms = rec.get("form", [])
    filing_dates = rec.get("filingDate", [])
    report_dates = rec.get("reportDate", [])
    accessions = rec.get("accessionNumber", [])
    docs = rec.get("primaryDocument", [])
    for f, fd, rd, a, doc in zip(forms, filing_dates, report_dates, accessions, docs):
        if f != "13F-HR":
            continue
        acc_nodash = str(a).replace("-", "")
        cik_int = str(int(cik10))
        return {
            "filed_at": fd,
            "period_of_report": rd or fd,
            "cik_int": cik_int,
            "acc_nodash": acc_nodash,
            "doc": doc,
        }
    return None


def _fetch_infotable_xml(client: httpx.Client, filing: dict[str, str]) -> str | None:
    cik = filing["cik_int"]
    acc = filing["acc_nodash"]
    candidates = [
        "infotable.xml",
        "form13fInfoTable.xml",
        "informationtable.xml",
        filing["doc"],
    ]
    # Try filing index JSON to discover actual attachments
    try:
        idx = client.get(
            f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/index.json",
            headers=EDGAR_HEADERS,
            timeout=30.0,
        )
        time.sleep(EDGAR_DELAY)
        if idx.status_code == 200:
            items = idx.json().get("directory", {}).get("item", [])
            for it in items:
                name = str(it.get("name", ""))
                if name.lower().endswith(".xml") and ("info" in name.lower() or "13f" in name.lower()):
                    candidates.insert(0, name)
    except Exception:
        pass

    for doc in candidates:
        try:
            r = client.get(
                EDGAR_ARCHIVES.format(cik=cik, acc=acc, doc=doc),
                headers=EDGAR_HEADERS,
                timeout=30.0,
            )
            time.sleep(EDGAR_DELAY)
            if r.status_code == 200 and ("infotable" in r.text.lower() or "informationtable" in r.text.lower()):
                return r.text
        except Exception:
            continue
    return None


def _parse_13f_infotable(xml_text: str) -> list[dict[str, Any]]:
    text_clean = re.sub(r'<\?xml[^?]*\?>', "", xml_text)
    text_clean = re.sub(r' xmlns[^"]*"[^"]*"', "", text_clean)
    text_clean = re.sub(r"(<\/?)\w+:", r"\1", text_clean)
    try:
        root = ET.fromstring(text_clean.encode("utf-8"))
    except ET.ParseError as e:
        log.debug("13F parse error: %s", e)
        return []

    rows: list[dict[str, Any]] = []
    entries = root.findall(".//infoTable") or root.findall(".//informationTable")
    for entry in entries:
        issuer = (entry.findtext(".//nameOfIssuer") or "").strip().upper()
        shares_raw = (
            entry.findtext(".//shrsOrPrnAmt/sshPrnamt") or entry.findtext(".//sshPrnamt") or "0"
        )
        value_raw = (entry.findtext(".//value") or "0").strip()
        cusip = (entry.findtext(".//cusip") or "").strip()
        ticker = (entry.findtext(".//symbol") or "").strip().upper()
        try:
            shares = float(str(shares_raw).replace(",", ""))
            value_usd = float(str(value_raw).replace(",", "")) * 1000.0
        except Exception:
            continue
        if shares <= 0:
            continue
        rows.append(
            {
                "ticker": ticker,
                "issuer": issuer,
                "cusip": cusip,
                "shares": shares,
                "value_usd": value_usd,
            }
        )
    return rows


def ingest_13f_holdings(session: Session, max_filers: int = 10) -> dict[str, int]:
    symbols_set = {
        r[0]
        for r in session.execute(text("SELECT symbol FROM qi_asset WHERE is_active=true")).fetchall()
    }
    holdings_upserted = 0
    filers_ok = 0
    with httpx.Client() as client:
        for i, (cik10, filer_name) in enumerate(TOP_INSTITUTIONAL_FILERS.items()):
            if i >= max_filers:
                break
            latest = _latest_13f_doc(client, cik10)
            if not latest:
                continue
            try:
                xml = _fetch_infotable_xml(client, latest)
                if not xml:
                    log.debug("13F %s: infotable não encontrado", filer_name)
                    continue
                rows = _parse_13f_infotable(xml)
                log.debug("13F %s: %s holdings parseadas", filer_name, len(rows))
                for row in rows:
                    symbol = row["ticker"]
                    shares = row["shares"]
                    value_usd = row["value_usd"]
                    if not symbol:
                        # conservative fallback: try exact issuer startswith ticker from universe
                        for s in symbols_set:
                            if row["issuer"].startswith(s):
                                symbol = s
                                break
                    if symbol not in symbols_set:
                        continue
                    asset = session.execute(
                        text("SELECT id FROM qi_asset WHERE symbol=:s"),
                        {"s": symbol},
                    ).fetchone()
                    if not asset:
                        continue
                    session.execute(
                        text(
                            """
                            INSERT INTO qi_institutional_holding
                              (id, asset_id, symbol, filer_cik, filer_name, period_of_report,
                               shares_held, value_usd, change_in_shares, change_pct, filed_at)
                            VALUES
                              (gen_random_uuid()::text, :asset_id, :symbol, :filer_cik, :filer_name,
                               :period_of_report, :shares_held, :value_usd, NULL, NULL, :filed_at)
                            ON CONFLICT (symbol, filer_cik, period_of_report)
                            DO UPDATE SET
                              shares_held = EXCLUDED.shares_held,
                              value_usd = EXCLUDED.value_usd,
                              filed_at = EXCLUDED.filed_at
                            """
                        ),
                        {
                            "asset_id": asset[0],
                            "symbol": symbol,
                            "filer_cik": cik10,
                            "filer_name": filer_name,
                            "period_of_report": latest["period_of_report"][:10],
                            "shares_held": shares,
                            "value_usd": value_usd,
                            "filed_at": latest["filed_at"][:10],
                        },
                    )
                    holdings_upserted += 1
                filers_ok += 1
            except Exception:
                continue
    session.flush()
    return {"filers_ok": filers_ok, "holdings_upserted": holdings_upserted}

