"""SEC companyfacts (XBRL) for infrastructure issuers: coverage, EV/EBITDA, debt/EBITDA."""

from __future__ import annotations

import logging
import time
from typing import Any, Callable

import httpx

from motor.src.db.connection import get_connection, init_db
from motor.src.ingestao.edgar_client import (
    EDGAR_HEADERS,
    ticker_to_cik,
)
from motor.src.config_loader import load_aba_config

log = logging.getLogger(__name__)

EDGAR_COMPANYFACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

_EBITDA_TAGS = ("EarningsBeforeInterestTaxesDepreciationAndAmortization",)
_OPINC_TAGS = ("OperatingIncomeLoss",)
_DA_TAGS = (
    "DepreciationDepletionAndAmortization",
    "Depreciation",
)
_TOTAL_DEBT_TAGS = (
    "LongTermDebtAndCapitalLeaseObligationsIncludingCurrent",
    "DebtInstrumentCarryingAmount",
)
_LONG_DEBT_TAGS = (
    "LongTermDebtNoncurrent",
    "LongTermDebt",
    "LongTermDebtAndCapitalLeaseObligations",
)
_SHORT_DEBT_TAGS = (
    "LongTermDebtCurrent",
    "DebtCurrent",
    "ShortTermBorrowings",
    "CommercialPaper",
)
_CASH_TAGS = (
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsAndShortTermInvestments",
)
_OCF_TAGS = ("NetCashProvidedByUsedInOperatingActivities",)
_CAPEX_TAGS = ("PaymentsToAcquirePropertyPlantAndEquipment",)
_DIV_TAGS = (
    "PaymentsOfDividendsCommonStock",
    "PaymentsOfDividends",
)

_FORMS = frozenset({"10-Q", "10-K", "20-F", "40-F"})
_MAX_QUARTERS = 16


def _skip_frame(frame: str | None, *, instant: bool) -> bool:
    if not frame:
        return False
    f = str(frame).upper()
    if "YTD" in f:
        return True
    if instant:
        return False
    # Duration: keep CY2024Q3 / CY2024, drop instant-only frames if they leak.
    return f.endswith("I")


def _gaap_series(
    facts: dict[str, Any],
    tags: tuple[str, ...],
    *,
    taxonomy: str = "us-gaap",
    unit_keys: tuple[str, ...] = ("USD",),
    instant: bool = False,
) -> dict[str, float]:
    """end-date ISO → value. Latest filed wins. Skips YTD frames."""
    tree = (facts.get("facts") or {}).get(taxonomy) or {}
    best: dict[str, tuple[str, float]] = {}  # end -> (filed, val)
    for tag in tags:
        node = tree.get(tag) or {}
        units = node.get("units") or {}
        points: list[dict[str, Any]] = []
        for key in unit_keys:
            points.extend(units.get(key) or [])
        if not points:
            # last-resort: first unit list
            for vals in units.values():
                if isinstance(vals, list):
                    points = vals
                    break
        found = False
        for p in points:
            if not isinstance(p, dict):
                continue
            if p.get("form") not in _FORMS:
                continue
            if _skip_frame(p.get("frame"), instant=instant):
                continue
            end = p.get("end")
            val = p.get("val")
            if not end or val is None:
                continue
            try:
                num = float(val)
            except (TypeError, ValueError):
                continue
            filed = str(p.get("filed") or end)
            prev = best.get(str(end)[:10])
            if prev is None or filed >= prev[0]:
                best[str(end)[:10]] = (filed, num)
            found = True
        if found:
            break
    return {d: v for d, (_f, v) in best.items()}


def _dei_shares(facts: dict[str, Any]) -> dict[str, float]:
    shares = _gaap_series(
        facts, ("EntityCommonStockSharesOutstanding",), taxonomy="dei",
        unit_keys=("shares",), instant=True,
    )
    if shares:
        return shares
    return _gaap_series(
        facts, ("CommonStockSharesOutstanding",),
        unit_keys=("shares", "pure"), instant=True,
    )


def _add_maps(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    out: dict[str, float] = {}
    for d in set(a) | set(b):
        if d in a and d in b:
            out[d] = a[d] + b[d]
        elif d in a:
            out[d] = a[d]
        else:
            out[d] = b[d]
    return out


def extract_infra_fundamentals(facts: dict[str, Any]) -> dict[str, dict[str, float]]:
    """Parse companyfacts JSON → per-metric {date: value} (no market prices yet)."""
    ebitda = _gaap_series(facts, _EBITDA_TAGS)
    if not ebitda:
        opinc = _gaap_series(facts, _OPINC_TAGS)
        da = _gaap_series(facts, _DA_TAGS)
        ebitda = {d: opinc[d] + da[d] for d in opinc if d in da}

    debt = _gaap_series(facts, _TOTAL_DEBT_TAGS, instant=True)
    if not debt:
        long_d = _gaap_series(facts, _LONG_DEBT_TAGS, instant=True)
        short_d = _gaap_series(facts, _SHORT_DEBT_TAGS, instant=True)
        debt = _add_maps(long_d, short_d)

    cash = _gaap_series(facts, _CASH_TAGS, instant=True)
    ocf = _gaap_series(facts, _OCF_TAGS)
    capex = _gaap_series(facts, _CAPEX_TAGS)
    divs = _gaap_series(facts, _DIV_TAGS)
    shares = _dei_shares(facts)
    return {
        "ebitda": ebitda,
        "total_debt": debt,
        "cash": cash,
        "ocf": ocf,
        "capex": capex,
        "dividends": divs,
        "shares": shares,
    }


def ratios_from_fundamentals(
    fund: dict[str, dict[str, float]],
    price_at: Callable[[str], float | None],
) -> dict[str, dict[str, float]]:
    """Build fcf_coverage, ev_ebitda, debt_ebitda keyed by ISO date."""
    ebitda = fund.get("ebitda") or {}
    debt = fund.get("total_debt") or {}
    cash = fund.get("cash") or {}
    ocf = fund.get("ocf") or {}
    capex = fund.get("capex") or {}
    divs = fund.get("dividends") or {}
    shares = fund.get("shares") or {}

    coverage: dict[str, float] = {}
    for d, ocf_v in ocf.items():
        div = abs(divs.get(d, 0.0))
        if div <= 1.0:  # ignore empty / tiny
            continue
        cap = abs(capex[d]) if d in capex else 0.0
        coverage[d] = (ocf_v - cap) / div

    debt_ebitda: dict[str, float] = {}
    for d, ebit in ebitda.items():
        if ebit <= 0 or d not in debt:
            continue
        debt_ebitda[d] = debt[d] / ebit

    ev_ebitda: dict[str, float] = {}
    for d, ebit in ebitda.items():
        if ebit <= 0:
            continue
        sh = shares.get(d)
        px = price_at(d)
        if not sh or sh <= 0 or px is None or px <= 0:
            continue
        net_debt = debt.get(d, 0.0) - cash.get(d, 0.0)
        ev_ebitda[d] = (px * sh + net_debt) / ebit

    def _tail(m: dict[str, float]) -> dict[str, float]:
        keys = sorted(m)[-_MAX_QUARTERS:]
        return {k: m[k] for k in keys}

    return {
        "fcf_coverage": _tail(coverage),
        "ev_ebitda": _tail(ev_ebitda),
        "debt_ebitda": _tail(debt_ebitda),
    }


def _price_on_or_before(ticker: str, iso_date: str) -> float | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT close FROM price_daily
            WHERE ticker = ? AND data <= ?
            ORDER BY data DESC LIMIT 1
            """,
            (ticker.upper(), iso_date),
        ).fetchone()
    if not row or row["close"] is None:
        return None
    return float(row["close"])


def fetch_infra_companyfacts(ticker: str) -> dict[str, dict[str, float]] | None:
    """Return {metric: {date: value}} for coverage / EV/EBITDA / debt/EBITDA."""
    t = ticker.upper()
    with httpx.Client() as client:
        cik = ticker_to_cik(client, t)
        if not cik:
            return None
        time.sleep(0.2)
        try:
            r = client.get(
                EDGAR_COMPANYFACTS.format(cik=cik),
                headers=EDGAR_HEADERS,
                timeout=90.0,
            )
            if r.status_code != 200:
                return None
            data = r.json()
        except Exception as e:
            log.warning("companyfacts fetch failed %s: %s", t, e)
            return None
    fund = extract_infra_fundamentals(data)
    return ratios_from_fundamentals(fund, lambda d: _price_on_or_before(t, d))


def ingest_aba_infra_edgar(aba_id: str) -> dict[str, Any]:
    init_db()
    aba = load_aba_config(aba_id)
    results: dict[str, Any] = {}
    with get_connection() as conn:
        for item in aba.get("universo", []):
            if not item.get("edgar_metric"):
                continue
            ticker = item["ticker"].upper()
            fetched = fetch_infra_companyfacts(ticker)
            if not fetched or not any(fetched.values()):
                results[ticker] = {"error": "not_found"}
                continue
            stored: dict[str, int] = {}
            for metric, by_date in fetched.items():
                for data, val in by_date.items():
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO edgar_metrics (ticker, data, metric, valor)
                        VALUES (?, ?, ?, ?)
                        """,
                        (ticker, data, metric, val),
                    )
                stored[metric] = len(by_date)
            results[ticker] = {"metrics": stored}
        conn.commit()
    return results
