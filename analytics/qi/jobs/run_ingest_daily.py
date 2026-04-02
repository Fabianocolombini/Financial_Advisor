"""Daily ingest: FRED → Polygon OHLCV → FMP fundamentals."""

from __future__ import annotations

import datetime as dt
import json
import os
import time
import traceback
from decimal import Decimal
from sqlalchemy import exists, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from qi.config import fmp_api_key, fred_api_key, fred_manifest_path, polygon_api_key
from qi.db.models import (
    QiAsset,
    QiFundamentalSnapshot,
    QiMacroSeries,
    QiMacroSeriesPoint,
    QiMarketPriceDaily,
)
from qi.db.session import get_session
from qi.ids import new_cuid_like
from qi.ingest.fmp_client import fetch_fundamentals
from qi.ingest.fred_client import (
    discover_fred_series_catalog,
    fetch_fred_observations,
    series_metadata,
)
from qi.ingest.job_logging import job_finish, job_start
from qi.ingest.polygon_client import fetch_daily_aggs
from qi.jobs.seed_assets import seed_assets_if_empty

_BACKFILL = os.environ.get("QI_FRED_BACKFILL_START", "2019-01-01")
_MAX_POLY = int(os.environ.get("QI_POLYGON_MAX_ASSETS", "40"))
# all | fred | polygon | fmp — roda só a fase indicada
_INGEST_PHASE = os.environ.get("QI_INGEST_PHASE", "all").strip().lower()
# 0–100: só roda Polygon se cobertura FRED >= este % (padrão 100). Use 0 para ignorar.
_MIN_FRED_PCT = float(os.environ.get("QI_MIN_FRED_PCT", "100"))
# manifest = só macro_series.json | full = árvore de categorias FRED (dedupe)
_FRED_UNIVERSE = os.environ.get("QI_FRED_UNIVERSE", "manifest").strip().lower()
_FRED_CATEGORY_ROOT = int(os.environ.get("QI_FRED_CATEGORY_ROOT", "0"))
_ms = os.environ.get("QI_FRED_MAX_SERIES", "").strip()
_FRED_MAX_SERIES = int(_ms) if _ms.isdigit() else None
_FRED_DISCOVER = os.environ.get("QI_FRED_DISCOVER", "").strip().lower() in ("1", "true", "yes")
_FRED_REQ_DELAY = float(os.environ.get("QI_FRED_REQUEST_DELAY_SEC", "0.55"))


def fred_series_coverage(session: Session) -> tuple[int, int, float]:
    """Séries FRED com ≥1 ponto / total do universo (manifest ou catálogo completo)."""
    if _FRED_UNIVERSE == "full":
        total = session.scalar(
            select(func.count()).select_from(QiMacroSeries).where(QiMacroSeries.provider == "FRED")
        )
        total = int(total or 0)
        if total == 0:
            return 0, 0, 0.0
        ok = session.scalar(
            select(func.count())
            .select_from(QiMacroSeries)
            .where(QiMacroSeries.provider == "FRED")
            .where(exists().where(QiMacroSeriesPoint.series_id == QiMacroSeries.id))
        )
        ok = int(ok or 0)
        pct = round(100.0 * ok / total, 1) if total else 0.0
        return ok, total, pct

    mp = fred_manifest_path()
    if not mp.is_file():
        return 0, 0, 0.0
    specs = json.loads(mp.read_text(encoding="utf-8"))
    total = len(specs)
    if total == 0:
        return 0, 0, 0.0
    ok = 0
    for spec in specs:
        ext = spec["external_id"]
        sid = session.scalar(
            select(QiMacroSeries.id).where(
                QiMacroSeries.provider == "FRED",
                QiMacroSeries.external_id == ext,
            )
        )
        if not sid:
            continue
        npts = session.scalar(
            select(func.count()).select_from(QiMacroSeriesPoint).where(
                QiMacroSeriesPoint.series_id == sid
            )
        )
        if npts and npts > 0:
            ok += 1
    pct = round(100.0 * ok / total, 1)
    return ok, total, pct


def _phase(name: str) -> bool:
    if _INGEST_PHASE in ("all", ""):
        return True
    return _INGEST_PHASE == name


def _fred_ok_for_polygon(session: Session) -> tuple[bool, float]:
    ok, total, pct = fred_series_coverage(session)
    if total == 0:
        return False, pct
    if _MIN_FRED_PCT <= 0:
        return True, pct
    return pct >= _MIN_FRED_PCT, pct


def _ensure_macro_series(session: Session, external_id: str, title: str | None, meta: dict) -> str:
    row = session.scalar(
        select(QiMacroSeries).where(
            QiMacroSeries.provider == "FRED",
            QiMacroSeries.external_id == external_id,
        )
    )
    now = dt.datetime.now(dt.timezone.utc)
    if row:
        row.title = title or row.title
        row.frequency = meta.get("frequency") or row.frequency
        row.units = meta.get("units") or row.units
        row.seasonal_adjustment = meta.get("seasonal_adjustment") or row.seasonal_adjustment
        row.updated_at = now
        session.flush()
        return row.id
    rid = new_cuid_like()
    session.add(
        QiMacroSeries(
            id=rid,
            provider="FRED",
            external_id=external_id,
            title=title,
            frequency=meta.get("frequency"),
            units=meta.get("units"),
            seasonal_adjustment=meta.get("seasonal_adjustment"),
            created_at=now,
            updated_at=now,
        )
    )
    session.flush()
    return rid


def _latest_macro_date(session: Session, series_id: str) -> dt.date | None:
    q = select(func.max(QiMacroSeriesPoint.observed_on)).where(
        QiMacroSeriesPoint.series_id == series_id
    )
    return session.scalar(q)


def _fred_series_specs(session: Session, api_key: str) -> list[dict]:
    """Manifest (`macro_series.json`) ou catálogo completo via árvore de categorias FRED."""
    if _FRED_UNIVERSE != "full":
        mp = fred_manifest_path()
        if not mp.is_file():
            return []
        return json.loads(mp.read_text(encoding="utf-8"))

    n_db = session.scalar(
        select(func.count()).select_from(QiMacroSeries).where(QiMacroSeries.provider == "FRED")
    )
    n_db = int(n_db or 0)
    if _FRED_DISCOVER or n_db == 0:
        cap = _FRED_MAX_SERIES if _FRED_MAX_SERIES is not None else "sem teto"
        if _FRED_MAX_SERIES is None:
            print(
                "FRED full: AVISO — sem QI_FRED_MAX_SERIES a descoberta percorre o catálogo "
                "inteiro (muitas horas / milhões de pontos). Defina um teto para o MVP."
            )
        print(f"FRED full: descoberta (root={_FRED_CATEGORY_ROOT}, max={cap})…")
        specs = discover_fred_series_catalog(
            api_key,
            root_category_id=_FRED_CATEGORY_ROOT,
            max_series=_FRED_MAX_SERIES,
            request_delay_sec=_FRED_REQ_DELAY,
        )
        print(f"FRED full: {len(specs)} séries únicas no catálogo.")
        return specs

    rows = session.execute(
        select(QiMacroSeries.external_id, QiMacroSeries.title)
        .where(QiMacroSeries.provider == "FRED")
        .order_by(QiMacroSeries.external_id)
    ).all()
    return [{"external_id": r[0], "title": r[1]} for r in rows]


def ingest_fred(session: Session, api_key: str) -> int:
    specs = _fred_series_specs(session, api_key)
    if not specs:
        return 0
    total = 0
    now = dt.datetime.now(dt.timezone.utc)
    for i, spec in enumerate(specs):
        if _FRED_UNIVERSE == "full" and _FRED_REQ_DELAY > 0 and i > 0:
            time.sleep(_FRED_REQ_DELAY)
        ext = spec["external_id"]
        title = spec.get("title")
        try:
            meta = series_metadata(api_key, ext)
        except Exception:
            meta = {}
        sid = _ensure_macro_series(session, ext, title, meta)
        start = _latest_macro_date(session, sid)
        obs_start = (start + dt.timedelta(days=1)).isoformat() if start else _BACKFILL
        try:
            observations = fetch_fred_observations(api_key, ext, obs_start)
        except Exception:
            observations = []
        for o in observations:
            d = dt.date.fromisoformat(o.date)
            stmt = pg_insert(QiMacroSeriesPoint).values(
                id=new_cuid_like(),
                series_id=sid,
                observed_on=d,
                value=Decimal(str(o.value)),
                raw=o.raw,
            )
            stmt = stmt.on_conflict_do_nothing(index_elements=["series_id", "observed_on"])
            res = session.execute(stmt)
            if res.rowcount:
                total += 1
        row = session.get(QiMacroSeries, sid)
        if row:
            row.last_successful_run_at = now
            row.updated_at = now
    return total


def ingest_polygon(session: Session, api_key: str) -> int:
    today = dt.date.today()
    start_default = dt.date.fromisoformat(_BACKFILL)
    assets = session.scalars(select(QiAsset).where(QiAsset.is_active.is_(True)).limit(_MAX_POLY)).all()
    total = 0
    for a in assets:
        last = session.scalar(
            select(func.max(QiMarketPriceDaily.trade_date)).where(
                QiMarketPriceDaily.asset_id == a.id,
                QiMarketPriceDaily.source == "POLYGON",
            )
        )
        start = (last + dt.timedelta(days=1)) if last else start_default
        if start > today:
            continue
        try:
            bars = fetch_daily_aggs(api_key, a.symbol, start, today)
        except Exception:
            continue
        for b in bars:
            ins = pg_insert(QiMarketPriceDaily).values(
                id=new_cuid_like(),
                asset_id=a.id,
                trade_date=b.trade_date,
                open=Decimal(str(b.open)),
                high=Decimal(str(b.high)),
                low=Decimal(str(b.low)),
                close=Decimal(str(b.close)),
                volume=b.volume,
                adjusted_close=Decimal(str(b.adjusted_close)) if b.adjusted_close else None,
                source="POLYGON",
            )
            stmt = ins.on_conflict_do_update(
                index_elements=["asset_id", "trade_date", "source"],
                set_={
                    "open": ins.excluded.open,
                    "high": ins.excluded.high,
                    "low": ins.excluded.low,
                    "close": ins.excluded.close,
                    "volume": ins.excluded.volume,
                    "adjusted_close": ins.excluded.adjusted_close,
                    "ingested_at": dt.datetime.now(dt.timezone.utc),
                },
            )
            session.execute(stmt)
            total += 1
    return total


def ingest_fmp(session: Session, api_key: str) -> int:
    assets = session.scalars(select(QiAsset).where(QiAsset.is_active.is_(True))).all()
    pe = dt.date.today()
    n = 0
    for a in assets:
        f = fetch_fundamentals(api_key, a.symbol)
        if not f:
            continue
        pend = f.period_end or pe
        ins = pg_insert(QiFundamentalSnapshot).values(
            id=new_cuid_like(),
            asset_id=a.id,
            period_end=pend,
            statement_type="TTM",
            market_cap=Decimal(str(f.market_cap)) if f.market_cap is not None else None,
            pe_ratio=Decimal(str(f.pe_ratio)) if f.pe_ratio is not None else None,
            pb_ratio=Decimal(str(f.pb_ratio)) if f.pb_ratio is not None else None,
            ev_to_ebitda=Decimal(str(f.ev_to_ebitda)) if f.ev_to_ebitda is not None else None,
            debt_to_equity=Decimal(str(f.debt_to_equity)) if f.debt_to_equity is not None else None,
            roe=Decimal(str(f.roe)) if f.roe is not None else None,
            revenue_ttm=Decimal(str(f.revenue_ttm)) if f.revenue_ttm is not None else None,
            eps_ttm=Decimal(str(f.eps_ttm)) if f.eps_ttm is not None else None,
            payload=f.payload,
            source="fmp",
        )
        stmt = ins.on_conflict_do_update(
            index_elements=["asset_id", "period_end", "statement_type", "source"],
            set_={
                "market_cap": ins.excluded.market_cap,
                "pe_ratio": ins.excluded.pe_ratio,
                "pb_ratio": ins.excluded.pb_ratio,
                "ev_to_ebitda": ins.excluded.ev_to_ebitda,
                "debt_to_equity": ins.excluded.debt_to_equity,
                "roe": ins.excluded.roe,
                "revenue_ttm": ins.excluded.revenue_ttm,
                "eps_ttm": ins.excluded.eps_ttm,
                "payload": ins.excluded.payload,
                "fetched_at": dt.datetime.now(dt.timezone.utc),
            },
        )
        session.execute(stmt)
        n += 1
    return n


def main() -> None:
    with get_session() as session:
        if _phase("fred") or _phase("polygon") or _phase("fmp"):
            seeded = seed_assets_if_empty(session)
            if seeded:
                print(f"Seeded {seeded} assets from CSV.")

        fk = fred_api_key()
        if fk and _phase("fred"):
            jid = job_start(session, "FRED", "macro_observations")
            try:
                n = ingest_fred(session, fk)
                job_finish(session, jid, True, rows_upserted=n)
                print(f"FRED: upserted {n} new macro points.")
            except Exception as e:
                job_finish(session, jid, False, error_message=str(e)[:2000])
                print(f"FRED failed: {e}\n{traceback.format_exc()}")
        elif _phase("fred") and not fk:
            print("Skip FRED (FRED_API_KEY unset).")

        # Sinalizador % + liberação do Polygon
        ok_n, tot_n, pct = fred_series_coverage(session)
        gate_ok, _ = _fred_ok_for_polygon(session)
        poly_label = "SIM" if gate_ok else "NÃO"
        print(
            f">>> FRED_COBERTURA={pct}% ({ok_n}/{tot_n} séries com dados) | "
            f"mínimo exigido={_MIN_FRED_PCT}% | Polygon liberado: {poly_label}"
        )
        if _FRED_UNIVERSE == "full" and tot_n > 200 and _MIN_FRED_PCT >= 99:
            print(
                ">>> Dica (FRED full): até o backfill estabilizar, use "
                "QI_MIN_FRED_PCT=0 para não bloquear Polygon."
            )

        pk = polygon_api_key()
        if pk and _phase("polygon"):
            if not gate_ok:
                print(
                    ">>> Polygon: pulado — aumente a cobertura FRED ou defina "
                    "QI_MIN_FRED_PCT=0 para forçar."
                )
            else:
                jid = job_start(session, "POLYGON", "daily_ohlcv")
                try:
                    n = ingest_polygon(session, pk)
                    job_finish(session, jid, True, rows_upserted=n)
                    print(f"Polygon: wrote {n} daily bars (upserts).")
                except Exception as e:
                    job_finish(session, jid, False, error_message=str(e)[:2000])
                    print(f"Polygon failed: {e}\n{traceback.format_exc()}")
        elif not pk and _phase("polygon"):
            print("Skip Polygon (POLYGON_API_KEY unset).")

        mk = fmp_api_key()
        if mk and _phase("fmp"):
            jid = job_start(session, "FMP", "fundamentals_ttm")
            try:
                n = ingest_fmp(session, mk)
                job_finish(session, jid, True, rows_upserted=n)
                print(f"FMP: upserted {n} fundamental snapshots.")
            except Exception as e:
                job_finish(session, jid, False, error_message=str(e)[:2000])
                print(f"FMP failed: {e}\n{traceback.format_exc()}")
        elif not mk and _phase("fmp"):
            print("Skip FMP (FMP_API_KEY unset).")


if __name__ == "__main__":
    main()
