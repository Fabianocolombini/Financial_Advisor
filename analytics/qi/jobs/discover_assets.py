"""
Descobre tickers via Polygon v3 reference/tickers e faz upsert em qi_asset.
Mapeia SIC → GICS sector; ETFs sectoriais conhecidos via mapa manual.

Uso:
  QI_DISCOVER_TYPES=CS,ETF QI_DISCOVER_LIMIT=5000 npm run qi:discover
"""

from __future__ import annotations

import datetime as dt
import os
import time
import traceback
from typing import Any, Iterator
from urllib.parse import parse_qs, urlencode, urlunparse, urlparse

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from qi.config import polygon_api_key
from qi.db.models import QiAsset
from qi.db.session import get_session
from qi.ids import new_cuid_like
from qi.ingest.job_logging import job_finish, job_start

_BASE = "https://api.polygon.io/v3/reference/tickers"
_DELAY = float(os.environ.get("QI_DISCOVER_DELAY_SEC", "0.25"))
_TYPES = [x.strip().upper() for x in os.environ.get("QI_DISCOVER_TYPES", "CS,ETF").split(",") if x.strip()]
_LIMIT = int(os.environ.get("QI_DISCOVER_LIMIT", "50000"))
_MIN_MC = os.environ.get("QI_DISCOVER_MIN_MARKETCAP", "").strip()
_MIN_MARKET_CAP: float | None = float(_MIN_MC) if _MIN_MC else None

# NASDAQ, NYSE, NYSE American (valores típicos no Polygon)
_EXCHANGES = {"XNAS", "XNYS", "XASE", "ARCX"}


def _with_polygon_api_key(url: str, api_key: str) -> str:
    """Polygon `next_url` muitas vezes vem sem `apiKey`; sem isso o próximo GET devolve 401."""
    parsed = urlparse(url)
    q = parse_qs(parsed.query, keep_blank_values=True)
    if not any(k.lower() == "apikey" for k in q):
        q["apiKey"] = [api_key]
    new_query = urlencode(q, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def _sic_to_gics(sic: int | None) -> str | None:
    if sic is None:
        return None
    # Ordem: faixas mais específicas antes das abrangentes
    sic_map: list[tuple[range, str]] = [
        (range(3570, 3580), "Technology"),
        (range(3670, 3680), "Technology"),
        (range(3674, 3676), "Technology"),
        (range(7370, 7380), "Technology"),
        (range(2830, 2837), "Health Care"),
        (range(3841, 3852), "Health Care"),
        (range(8000, 8100), "Health Care"),
        (range(6000, 6500), "Financials"),
        (range(1300, 1400), "Energy"),
        (range(2900, 2913), "Energy"),
        (range(5170, 5173), "Energy"),
        (range(5500, 5600), "Consumer Discretionary"),
        (range(5700, 5800), "Consumer Discretionary"),
        (range(5900, 5962), "Consumer Discretionary"),
        (range(7500, 7600), "Consumer Discretionary"),
        (range(2000, 2200), "Consumer Staples"),
        (range(5140, 5160), "Consumer Staples"),
        (range(5400, 5500), "Consumer Staples"),
        (range(3400, 3500), "Industrials"),
        (range(3510, 3570), "Industrials"),
        (range(3720, 3740), "Industrials"),
        (range(4500, 4600), "Industrials"),
        (range(7300, 7370), "Industrials"),
        (range(1000, 1100), "Materials"),
        (range(2600, 2700), "Materials"),
        (range(2800, 2830), "Materials"),
        (range(3300, 3400), "Materials"),
        (range(4900, 5000), "Utilities"),
        (range(6500, 6600), "Real Estate"),
        (range(6700, 6800), "Real Estate"),
        (range(4800, 4900), "Communication Services"),
        (range(7810, 7820), "Communication Services"),
        (range(7900, 7950), "Communication Services"),
    ]
    for r, sector in sic_map:
        if sic in r:
            return sector
    return None


_ETF_SECTOR_MAP: dict[str, str] = {
    "XLK": "Technology",
    "XLF": "Financials",
    "XLE": "Energy",
    "XLV": "Health Care",
    "XLI": "Industrials",
    "XLP": "Consumer Staples",
    "XLY": "Consumer Discretionary",
    "XLB": "Materials",
    "XLRE": "Real Estate",
    "XLU": "Utilities",
    "XLC": "Communication Services",
    "VGT": "Technology",
    "VFH": "Financials",
    "VDE": "Energy",
    "VHT": "Health Care",
    "VIS": "Industrials",
    "VDC": "Consumer Staples",
    "VCR": "Consumer Discretionary",
    "VAW": "Materials",
    "VPU": "Utilities",
    "VOX": "Communication Services",
    "IBB": "Health Care",
    "IYR": "Real Estate",
    "KBE": "Financials",
    "GLD": "Materials",
    "SLV": "Materials",
}


def _iter_tickers(
    api_key: str,
    ticker_type: str,
    remaining: list[int],
) -> Iterator[dict[str, Any]]:
    """Paginação; `remaining[0]` é teto global de tickers restantes neste run."""
    url: str | None = _BASE
    params = {
        "type": ticker_type,
        "market": "stocks",
        "active": "true",
        "limit": 1000,
        "apiKey": api_key,
    }
    with httpx.Client(timeout=120.0) as client:
        while url and remaining[0] > 0:
            if _DELAY > 0:
                time.sleep(_DELAY)
            if url == _BASE:
                res = client.get(url, params=params)
            else:
                res = client.get(_with_polygon_api_key(url, api_key))
            if res.status_code == 429:
                print("Rate limit (429) — aguardando 60s...")
                time.sleep(60)
                continue
            res.raise_for_status()
            body = res.json()
            for ticker in body.get("results") or []:
                if remaining[0] <= 0:
                    return
                yield ticker
                remaining[0] -= 1
            url = body.get("next_url")


def _upsert_asset(session: Session, now: dt.datetime, **kwargs: Any) -> None:
    t = QiAsset.__table__
    ins = pg_insert(t).values(
        id=new_cuid_like(),
        first_seen_at=now,
        updated_at=now,
        **kwargs,
    )
    stmt = ins.on_conflict_do_update(
        index_elements=[t.c.symbol],
        set_={
            "name": ins.excluded.name,
            "asset_type": ins.excluded.asset_type,
            "exchange_mic": ins.excluded.exchange_mic,
            "gics_sector": ins.excluded.gics_sector,
            "is_active": ins.excluded.is_active,
            "updated_at": ins.excluded.updated_at,
        },
    )
    session.execute(stmt)


def discover_assets(session: Session, api_key: str) -> int:
    now = dt.datetime.now(dt.timezone.utc)
    total = 0
    remaining = [_LIMIT]

    for ticker_type in _TYPES:
        if remaining[0] <= 0:
            break
        print(f"\nDiscovering {ticker_type} tickers from Polygon...")
        count = 0

        for raw in _iter_tickers(api_key, ticker_type, remaining):
            sym = (raw.get("ticker") or "").strip().upper()
            if not sym:
                continue

            exchange = (raw.get("primary_exchange") or "").strip()
            if ticker_type == "CS" and exchange and exchange not in _EXCHANGES:
                continue

            if _MIN_MARKET_CAP is not None:
                mc = raw.get("market_cap")
                try:
                    mcf = float(mc) if mc is not None else 0.0
                except (TypeError, ValueError):
                    mcf = 0.0
                if mcf < _MIN_MARKET_CAP:
                    continue

            name = (raw.get("name") or sym).strip()
            currency = (raw.get("currency_name") or "usd").upper()
            if currency != "USD":
                continue

            sic_raw = raw.get("sic_code")
            try:
                sic = int(sic_raw) if sic_raw is not None and sic_raw != "" else None
            except (ValueError, TypeError):
                sic = None

            if ticker_type == "ETF":
                sector = _ETF_SECTOR_MAP.get(sym)
            else:
                sector = _sic_to_gics(sic)

            asset_type = "ETF" if ticker_type == "ETF" else "EQUITY"

            _upsert_asset(
                session,
                now,
                symbol=sym,
                name=name,
                asset_type=asset_type,
                exchange_mic=exchange or None,
                currency="USD",
                gics_sector=sector,
                gics_industry=None,
                cik=str(raw.get("cik")).strip() if raw.get("cik") else None,
                is_active=True,
                metrics_cache=None,
            )
            count += 1
            total += 1
            if count % 500 == 0:
                session.flush()
                print(f"  {ticker_type}: {count} processados (total run: {total})...")

        session.flush()
        print(f"  {ticker_type}: {count} tickers upserted (acumulado).")

    return total


def main() -> None:
    api_key = polygon_api_key()
    if not api_key:
        print("POLYGON_API_KEY não configurada.")
        return

    with get_session() as session:
        jid = job_start(session, "POLYGON", "discover_assets")
        try:
            n = discover_assets(session, api_key)
            job_finish(session, jid, True, rows_upserted=n)
            print(f"\nAsset discovery completo: {n} operações de upsert em qi_asset.")
        except Exception as e:
            job_finish(session, jid, False, error_message=str(e)[:2000])
            print(f"Discovery falhou: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
