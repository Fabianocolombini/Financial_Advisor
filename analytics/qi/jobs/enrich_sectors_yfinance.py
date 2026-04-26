"""
enrich_sectors_yfinance.py
Enriquece qi_asset com gics_sector + gics_industry + market_cap via yfinance.
Processa em batches paralelos. Roda antes de qi:universe.

Variáveis de ambiente:
  QI_ENRICH_BATCH_SIZE  — tickers por batch yfinance (default 50)
  QI_ENRICH_WORKERS     — threads paralelas (default 8)
  QI_ENRICH_ONLY_NULL   — 1/true = só ativos sem gics_sector (default true)
  QI_ENRICH_LIMIT       — teto de ativos a processar (default sem teto)

Usage:
    npm run qi:enrich-sectors-yfinance
ou:
    cd analytics && PYTHONPATH=. python3 -m qi.jobs.enrich_sectors_yfinance
"""

from __future__ import annotations

import datetime as dt
import os
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

import yfinance as yf
from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.db.models import QiAsset
from qi.db.session import get_session
from qi.ingest.job_logging import job_finish, job_start

_BATCH_SIZE = int(os.environ.get("QI_ENRICH_BATCH_SIZE", "50"))
_WORKERS = int(os.environ.get("QI_ENRICH_WORKERS", "8"))
_ONLY_NULL = os.environ.get("QI_ENRICH_ONLY_NULL", "1").lower() not in ("0", "false", "no")
_LIMIT_RAW = os.environ.get("QI_ENRICH_LIMIT", "").strip()
_LIMIT = int(_LIMIT_RAW) if _LIMIT_RAW.isdigit() else None

# yfinance → GICS normalizado
_YF_TO_GICS: dict[str, str] = {
    "Technology": "Information Technology",
    "Financial Services": "Financials",
    "Healthcare": "Health Care",
    "Energy": "Energy",
    "Consumer Cyclical": "Consumer Discretionary",
    "Consumer Defensive": "Consumer Staples",
    "Industrials": "Industrials",
    "Basic Materials": "Materials",
    "Real Estate": "Real Estate",
    "Utilities": "Utilities",
    "Communication Services": "Communication Services",
    "Commodities": "Commodities",
    "Information Technology": "Information Technology",
    "Financials": "Financials",
    "Health Care": "Health Care",
    "Consumer Discretionary": "Consumer Discretionary",
    "Consumer Staples": "Consumer Staples",
    "Materials": "Materials",
}


def _normalize_sector(raw: str | None) -> str | None:
    if not raw:
        return None
    return _YF_TO_GICS.get(raw.strip(), raw.strip() or None)


def _fetch_batch(symbols: list[str]) -> dict[str, dict]:
    """
    Busca info de um batch de tickers via yfinance.
    Retorna dict symbol → {sector, industry, market_cap}.
    """
    result: dict[str, dict] = {}
    try:
        tickers = yf.Tickers(" ".join(symbols))
        for sym in symbols:
            try:
                t = tickers.tickers.get(sym) or tickers.tickers.get(sym.upper())
                if t is None:
                    continue
                info = t.info or {}
                sector = _normalize_sector(info.get("sector"))
                industry = (info.get("industry") or "").strip() or None
                mkt_cap = info.get("marketCap")
                if sector or mkt_cap:
                    result[sym] = {
                        "sector": sector,
                        "industry": industry,
                        "market_cap": float(mkt_cap) if mkt_cap else None,
                    }
            except Exception:
                continue
    except Exception:
        pass
    return result


def _load_assets(session: Session) -> list[tuple[str, str]]:
    """Retorna lista de (id, symbol) a enriquecer."""
    q = select(QiAsset.id, QiAsset.symbol).where(QiAsset.is_active.is_(True))
    if _ONLY_NULL:
        q = q.where(QiAsset.gics_sector.is_(None))
    rows = session.execute(q).all()
    result = [(r[0], r[1]) for r in rows]
    if _LIMIT:
        result = result[:_LIMIT]
    return result


def enrich_sectors(session: Session) -> tuple[int, int]:
    """
    Retorna (updated, failed).
    updated = ativos com gics_sector preenchido.
    failed  = tickers sem dados no yfinance.
    """
    assets = _load_assets(session)
    if not assets:
        print("Nenhum ativo para enriquecer.")
        return 0, 0

    print(f"Ativos a enriquecer: {len(assets)} | batch={_BATCH_SIZE} | workers={_WORKERS}")

    batches: list[list[str]] = []
    ids_by_symbol: dict[str, str] = {}
    chunk: list[str] = []

    for asset_id, symbol in assets:
        ids_by_symbol[symbol] = asset_id
        chunk.append(symbol)
        if len(chunk) == _BATCH_SIZE:
            batches.append(chunk)
            chunk = []
    if chunk:
        batches.append(chunk)

    print(f"Batches: {len(batches)}")

    enriched: dict[str, dict] = {}
    completed = 0

    with ThreadPoolExecutor(max_workers=_WORKERS) as executor:
        futures = {executor.submit(_fetch_batch, b): b for b in batches}
        for future in as_completed(futures):
            result = future.result()
            enriched.update(result)
            completed += 1
            if completed % 10 == 0 or completed == len(batches):
                pct = round(100 * completed / len(batches))
                print(f"  Progresso: {completed}/{len(batches)} batches ({pct}%) | com dados: {len(enriched)}")

    now = dt.datetime.now(dt.timezone.utc)
    updated = 0

    for symbol, data in enriched.items():
        asset_id = ids_by_symbol.get(symbol)
        if not asset_id:
            continue
        asset = session.get(QiAsset, asset_id)
        if not asset:
            continue

        changed = False
        normalized_sector = data.get("sector")
        # Classe extra (não GICS): commodities via bucket no seed.
        if not normalized_sector and isinstance(asset.metrics_cache, dict):
            if str(asset.metrics_cache.get("bucket", "")).lower() == "commodities":
                normalized_sector = "Commodities"
        if normalized_sector and asset.gics_sector != normalized_sector:
            asset.gics_sector = normalized_sector
            changed = True
        if data.get("industry") and asset.gics_industry != data["industry"]:
            asset.gics_industry = data["industry"]
            changed = True
        if data.get("market_cap"):
            cache = asset.metrics_cache or {}
            cache["market_cap_yf"] = data["market_cap"]
            asset.metrics_cache = cache
            changed = True
        if changed:
            asset.updated_at = now
            updated += 1

    failed = len(assets) - len(enriched)
    session.flush()
    return updated, failed


def main() -> None:
    print("=== QI Sector Enrichment via yfinance ===")
    if _ONLY_NULL:
        print("Modo: só ativos com gics_sector = NULL")
    else:
        print("Modo: todos os ativos ativos")

    with get_session() as session:
        jid = job_start(session, "YFINANCE", "enrich_sectors")
        try:
            updated, failed = enrich_sectors(session)
            job_finish(session, jid, True, rows_upserted=updated)
            print(f"\nConcluído: {updated} atualizados | {failed} sem dados no yfinance.")
        except Exception as e:
            job_finish(session, jid, False, error_message=str(e)[:2000])
            print(f"Falhou: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
