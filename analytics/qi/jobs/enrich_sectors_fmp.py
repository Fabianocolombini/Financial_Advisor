"""
enrich_sectors_fmp.py
Enriquece qi_asset com gics_sector + gics_industry + market_cap via FMP stock screener.
~6 chamadas API para cobrir 5.000+ equities. Roda antes de qi:universe.

Usage:
    npm run qi:enrich-sectors
ou:
    cd analytics && PYTHONPATH=. python3 -m qi.jobs.enrich_sectors_fmp
"""

from __future__ import annotations

import datetime as dt
import os
import time
import traceback
from typing import Iterator

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.config import fmp_api_key
from qi.db.models import QiAsset
from qi.db.session import get_session
from qi.ingest.job_logging import job_finish, job_start

_BASE = "https://financialmodelingprep.com/stable"
_DELAY = float(os.environ.get("QI_ENRICH_DELAY_SEC", "0.5"))
_PAGE_SIZE = 1000  # máximo do FMP screener
_EXCHANGES = ["NASDAQ", "NYSE", "AMEX"]

# Mapeamento FMP sector → GICS (FMP usa nomes ligeiramente diferentes)
_FMP_TO_GICS: dict[str, str] = {
    "Technology":               "Information Technology",
    "Financial Services":       "Financials",
    "Financial":                "Financials",
    "Healthcare":               "Health Care",
    "Health Care":              "Health Care",
    "Energy":                   "Energy",
    "Consumer Cyclical":        "Consumer Discretionary",
    "Consumer Defensive":       "Consumer Staples",
    "Industrials":              "Industrials",
    "Basic Materials":          "Materials",
    "Real Estate":              "Real Estate",
    "Utilities":                "Utilities",
    "Communication Services":   "Communication Services",
    "Consumer Discretionary":   "Consumer Discretionary",
    "Consumer Staples":         "Consumer Staples",
    "Materials":                "Materials",
    "Information Technology":   "Information Technology",
}


def _iter_screener(api_key: str) -> Iterator[dict]:
    """Pagina o FMP stock screener por exchange."""
    with httpx.Client(timeout=60.0) as client:
        for exchange in _EXCHANGES:
            offset = 0
            while True:
                if _DELAY > 0 and offset > 0:
                    time.sleep(_DELAY)
                params = {
                    "exchange":   exchange,
                    "limit":      _PAGE_SIZE,
                    "offset":     offset,
                    "apikey":     api_key,
                }
                res = client.get(f"{_BASE}/stock-screener", params=params)
                if res.status_code == 429:
                    print("Rate limit FMP — aguardando 60s...")
                    time.sleep(60)
                    continue
                res.raise_for_status()
                batch = res.json()
                if not batch:
                    break
                for item in batch:
                    yield item
                if len(batch) < _PAGE_SIZE:
                    break
                offset += _PAGE_SIZE


def enrich_sectors(session: Session, api_key: str) -> tuple[int, int]:
    """
    Retorna (updated, skipped).
    updated = ativos em qi_asset que tiveram gics_sector preenchido.
    skipped = tickers do FMP que não existem em qi_asset.
    """
    # Carregar todos os symbols existentes em qi_asset para lookup rápido
    existing: dict[str, str] = {}  # symbol → id
    for row in session.execute(select(QiAsset.symbol, QiAsset.id)).all():
        existing[row[0].upper()] = row[1]

    now = dt.datetime.now(dt.timezone.utc)
    updated = 0
    skipped = 0
    batch_count = 0

    for item in _iter_screener(api_key):
        sym = (item.get("symbol") or "").strip().upper()
        if not sym:
            continue

        asset_id = existing.get(sym)
        if not asset_id:
            skipped += 1
            continue

        # Mapear setor FMP → GICS
        fmp_sector = (item.get("sector") or "").strip()
        fmp_industry = (item.get("industry") or "").strip()
        gics_sector = _FMP_TO_GICS.get(fmp_sector) or (fmp_sector if fmp_sector else None)
        gics_industry = fmp_industry or None
        market_cap = item.get("marketCap")

        # Atualizar qi_asset
        asset = session.get(QiAsset, asset_id)
        if not asset:
            continue

        changed = False
        if gics_sector and asset.gics_sector != gics_sector:
            asset.gics_sector = gics_sector
            changed = True
        if gics_industry and asset.gics_industry != gics_industry:
            asset.gics_industry = gics_industry
            changed = True
        if market_cap:
            cache = asset.metrics_cache or {}
            cache["market_cap_fmp"] = float(market_cap)
            asset.metrics_cache = cache
            changed = True

        if changed:
            asset.updated_at = now
            updated += 1

        batch_count += 1
        if batch_count % 500 == 0:
            session.flush()
            print(f"  Processados: {batch_count} | Atualizados: {updated}")

    session.flush()
    return updated, skipped


def main() -> None:
    api_key = fmp_api_key()
    if not api_key:
        print("FMP_API_KEY não configurada.")
        return

    print("Enriquecendo gics_sector via FMP stock screener...")

    with get_session() as session:
        jid = job_start(session, "FMP", "enrich_sectors")
        try:
            updated, skipped = enrich_sectors(session, api_key)
            job_finish(session, jid, True, rows_upserted=updated)
            print(f"\nConcluído: {updated} ativos atualizados | {skipped} não encontrados em qi_asset.")
        except Exception as e:
            job_finish(session, jid, False, error_message=str(e)[:2000])
            print(f"Enriquecimento falhou: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
