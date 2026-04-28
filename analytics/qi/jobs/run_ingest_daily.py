"""Daily ingest: FRED → Polygon OHLCV → FMP fundamentals."""

from __future__ import annotations

import datetime as dt
import json
import math
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
from qi.ingest.cftc_client import ingest_cot_data
from qi.ingest.edgar_13f_client import ingest_13f_holdings
from qi.ingest.edgar_insider_client import ingest_insider_transactions
from qi.ingest.job_logging import job_finish, job_start
from qi.ingest.polygon_client import fetch_daily_aggs
from qi.ingest.yfinance_client import ingest_prices_yfinance
from qi.jobs.seed_assets import seed_assets_if_empty

_BACKFILL = os.environ.get("QI_FRED_BACKFILL_START", "2019-01-01")
_MAX_POLY = int(os.environ.get("QI_POLYGON_MAX_ASSETS", "40"))
# 0 = todos os ativos activos; caso contrário limita (útil para testes / quota FMP)
_mf = os.environ.get("QI_FMP_MAX_ASSETS", "").strip()
_FMP_MAX = int(_mf) if _mf.isdigit() else 0
_FMP_DELAY = float(os.environ.get("QI_FMP_DELAY_SEC", "1.2"))
_BATCH_SIZE = int(os.environ.get("QI_INGEST_BATCH_SIZE", "50"))
_YF_BATCH_SIZE = int(os.environ.get("QI_BATCH_SIZE", "100"))
# QI_YFINANCE_BACKFILL=true → puxa desde 2020-01-01; false → rolling 5 dias
_YF_BACKFILL = os.environ.get("QI_YFINANCE_BACKFILL", "false").strip().lower() in ("1", "true", "yes")
_YF_BACKFILL_START = dt.date.fromisoformat(os.environ.get("QI_YFINANCE_BACKFILL_START", "2020-01-01"))
_YF_INCREMENTAL = os.environ.get("QI_YFINANCE_INCREMENTAL", "false").strip().lower() in (
    "1",
    "true",
    "yes",
)
_SEED_FORCE = os.environ.get("QI_SEED_FORCE", "false").strip().lower() in ("1", "true", "yes")
_INSIDER_BATCH_SIZE = int(os.environ.get("QI_INSIDER_BATCH_SIZE", "100"))
_INSTITUTIONAL_MAX_FILERS = int(os.environ.get("QI_INSTITUTIONAL_MAX_FILERS", "10"))

FRED_SERIES_EXPANDED = [
    "BAMLH0A0HYM2",
    "BAMLC0A0CM",
    "DTWEXBGS",
    "T10YIE",
    "UMCSENT",
    "MANEMP",
    "RSXFS",
]

# Fases suportadas:
#   "fred"      → apenas macro FRED
#   "polygon"   → apenas preços Polygon (mantido; desativado em "all" dev)
#   "yfinance"  → apenas preços yfinance (zero-custo)
#   "fmp"       → apenas fundamentals FMP
#   "fred_expanded" → séries macro adicionais
#   "insider"   → SEC EDGAR Form 4
#   "institutional" → SEC EDGAR 13F
#   "cot"       → CFTC COT
#   "all"       → fred + yfinance + fmp  (dev default — sem Polygon)
#   "all_prod"  → fred + polygon + fmp   (produção com plano Polygon pago)
_phases_raw = os.environ.get("QI_INGEST_PHASE", "all").strip()
_pr = _phases_raw.lower()
if not _pr or _pr == "all":
    _INGEST_PHASES = frozenset(
        {"fred", "fred_expanded", "yfinance", "fmp", "insider", "institutional", "cot"}
    )
elif _pr == "all_prod":
    _INGEST_PHASES = frozenset(
        {"fred", "fred_expanded", "polygon", "fmp", "insider", "institutional", "cot"}
    )
else:
    _INGEST_PHASES = frozenset(
        p.strip().lower() for p in _phases_raw.split(",") if p.strip()
    )
RUN_FRED = "fred" in _INGEST_PHASES
RUN_POLYGON = "polygon" in _INGEST_PHASES
RUN_YFINANCE = "yfinance" in _INGEST_PHASES
RUN_FMP = "fmp" in _INGEST_PHASES
RUN_FRED_EXPANDED = "fred_expanded" in _INGEST_PHASES
RUN_INSIDER = "insider" in _INGEST_PHASES
RUN_INSTITUTIONAL = "institutional" in _INGEST_PHASES
RUN_COT = "cot" in _INGEST_PHASES
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


def _fred_ok_for_polygon(session: Session) -> tuple[bool, float]:
    ok, total, pct = fred_series_coverage(session)
    if _MIN_FRED_PCT <= 0:
        return True, pct
    if total == 0:
        return False, pct
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
        session.flush()
    return total


def ingest_fred_expanded(session: Session, api_key: str) -> int:
    total = 0
    now = dt.datetime.now(dt.timezone.utc)
    for ext in FRED_SERIES_EXPANDED:
        try:
            meta = series_metadata(api_key, ext)
        except Exception:
            meta = {}
        sid = _ensure_macro_series(session, ext, meta.get("title"), meta)
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
    session.flush()
    return total


def ingest_yfinance(session: Session) -> int:
    """Ingestão de preços diários via yfinance (zero-custo)."""
    today = dt.date.today()
    if _YF_BACKFILL:
        start = _YF_BACKFILL_START
    else:
        start = today - dt.timedelta(days=7)

    with get_session() as s:
        if _YF_INCREMENTAL:
            rows = s.execute(
                select(QiAsset.symbol)
                .outerjoin(QiMarketPriceDaily, QiMarketPriceDaily.asset_id == QiAsset.id)
                .where(QiAsset.is_active.is_(True))
                .where(QiMarketPriceDaily.asset_id.is_(None))
                .order_by(QiAsset.symbol.asc())
            ).all()
            tickers = [r[0] for r in rows]
        else:
            rows = s.scalars(
                select(QiAsset)
                .where(QiAsset.is_active.is_(True))
                .order_by(QiAsset.symbol.asc())
            ).all()
            tickers = [a.symbol for a in rows]

    if not tickers:
        return 0

    print(
        f"yfinance: {len(tickers)} ativos | {start} → {today} | "
        f"backfill={_YF_BACKFILL} | incremental={_YF_INCREMENTAL}"
    )

    with get_session() as s:
        result = ingest_prices_yfinance(
            session=s,
            tickers=tickers,
            start_date=start,
            end_date=today,
            batch_size=_YF_BATCH_SIZE,
        )

    ok = result["tickers_ok"]
    failed = result["tickers_failed"]
    upserted = result["records_upserted"]
    print(f"yfinance: tickers_ok={ok} tickers_failed={failed} records_upserted={upserted}")
    if result["errors"]:
        for e in result["errors"][:5]:
            print(f"  [WARN] {e}")
    return upserted


def ingest_polygon(_session: Session, api_key: str) -> int:
    """Delega para _ingest_polygon_batched que abre sessão por lote."""
    return _ingest_polygon_batched(api_key)


def _ingest_polygon_batched(api_key: str) -> int:
    """
    Ingest Polygon em lotes de QI_INGEST_BATCH_SIZE ativos.
    Abre e fecha uma sessão nova por lote — evita crash Neon em runs longos.
    """
    with get_session() as s:
        asset_rows = s.scalars(
            select(QiAsset)
            .where(QiAsset.is_active.is_(True))
            .order_by(
                QiAsset.gics_sector.is_(None).asc(),
                QiAsset.symbol.asc(),
            )
            .limit(_MAX_POLY)
        ).all()
        asset_list = [(a.id, a.symbol) for a in asset_rows]

    if not asset_list:
        return 0

    total = 0
    n_batches = math.ceil(len(asset_list) / _BATCH_SIZE)
    print(f"Polygon: {len(asset_list)} ativos em {n_batches} lotes de {_BATCH_SIZE}.")

    for i in range(0, len(asset_list), _BATCH_SIZE):
        batch = asset_list[i : i + _BATCH_SIZE]
        batch_num = i // _BATCH_SIZE + 1
        print(f"  Lote {batch_num}/{n_batches} ({len(batch)} ativos)...")

        try:
            with get_session() as s:
                today = dt.date.today()
                start_default = dt.date.fromisoformat(_BACKFILL)
                n = 0
                for asset_id, symbol in batch:
                    last = s.scalar(
                        select(func.max(QiMarketPriceDaily.trade_date)).where(
                            QiMarketPriceDaily.asset_id == asset_id,
                            QiMarketPriceDaily.source == "POLYGON",
                        )
                    )
                    start = (last + dt.timedelta(days=1)) if last else start_default
                    if start > today:
                        continue
                    try:
                        bars = fetch_daily_aggs(api_key, symbol, start, today)
                    except Exception as e:
                        print(f"    skip {symbol}: {e}")
                        continue
                    for b in bars:
                        ins = pg_insert(QiMarketPriceDaily).values(
                            id=new_cuid_like(),
                            asset_id=asset_id,
                            trade_date=b.trade_date,
                            open=Decimal(str(b.open)),
                            high=Decimal(str(b.high)),
                            low=Decimal(str(b.low)),
                            close=Decimal(str(b.close)),
                            volume=b.volume,
                            adjusted_close=Decimal(str(b.adjusted_close))
                            if b.adjusted_close
                            else None,
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
                        s.execute(stmt)
                        n += 1
                total += n
                print(f"    Lote {batch_num}: +{n} barras (Σ {total})")
        except Exception as e:
            print(f"    Lote {batch_num} falhou: {e} — continuando...")
            continue

    return total


def ingest_fmp(_session: Session, api_key: str) -> int:
    """Delega para _ingest_fmp_batched que abre sessão por lote."""
    return _ingest_fmp_batched(api_key)


def _ingest_fmp_batched(api_key: str) -> int:
    """
    Ingest FMP fundamentals em lotes de QI_INGEST_BATCH_SIZE ativos.
    Sessão nova por lote.
    """
    with get_session() as s:
        q = select(QiAsset).where(QiAsset.is_active.is_(True)).order_by(QiAsset.symbol.asc())
        if _FMP_MAX > 0:
            q = q.limit(_FMP_MAX)
        asset_list = [(a.id, a.symbol) for a in s.scalars(q).all()]

    if not asset_list:
        return 0

    cap = "all" if _FMP_MAX <= 0 else str(_FMP_MAX)
    total = 0
    n_batches = math.ceil(len(asset_list) / _BATCH_SIZE)
    print(
        f"FMP: {len(asset_list)} ativos (QI_FMP_MAX_ASSETS={cap}) em "
        f"{n_batches} lotes de {_BATCH_SIZE}."
    )

    for i in range(0, len(asset_list), _BATCH_SIZE):
        batch = asset_list[i : i + _BATCH_SIZE]
        batch_num = i // _BATCH_SIZE + 1
        print(f"  Lote {batch_num}/{n_batches}...")

        try:
            with get_session() as s:
                pe = dt.date.today()
                n = 0
                for asset_id, symbol in batch:
                    if _FMP_DELAY > 0:
                        time.sleep(_FMP_DELAY)
                    f = fetch_fundamentals(api_key, symbol)
                    if not f:
                        continue
                    # Persistir fundamentals também em qi_asset.metrics_cache (schema real do MVP).
                    asset = s.get(QiAsset, asset_id)
                    if asset:
                        profile = (f.payload or {}).get("profile", {}) if isinstance(f.payload, dict) else {}
                        key_metrics = (
                            (f.payload or {}).get("key_metrics_ttm", {})
                            if isinstance(f.payload, dict)
                            else {}
                        )
                        cache = dict(asset.metrics_cache or {})
                        cache.update(
                            {
                                "market_cap": f.market_cap,
                                "pe_ratio": f.pe_ratio,
                                "pb_ratio": f.pb_ratio,
                                "beta": profile.get("beta"),
                                "dividend_yield": key_metrics.get("dividendYieldTTM"),
                                "debt_to_equity": f.debt_to_equity,
                                "eps_ttm": f.eps_ttm,
                                "fmp_updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                            }
                        )
                        asset.metrics_cache = cache
                        asset.updated_at = dt.datetime.now(dt.timezone.utc)
                    pend = f.period_end or pe
                    ins = pg_insert(QiFundamentalSnapshot).values(
                        id=new_cuid_like(),
                        asset_id=asset_id,
                        period_end=pend,
                        statement_type="TTM",
                        market_cap=Decimal(str(f.market_cap))
                        if f.market_cap is not None
                        else None,
                        pe_ratio=Decimal(str(f.pe_ratio))
                        if f.pe_ratio is not None
                        else None,
                        pb_ratio=Decimal(str(f.pb_ratio))
                        if f.pb_ratio is not None
                        else None,
                        ev_to_ebitda=Decimal(str(f.ev_to_ebitda))
                        if f.ev_to_ebitda is not None
                        else None,
                        debt_to_equity=Decimal(str(f.debt_to_equity))
                        if f.debt_to_equity is not None
                        else None,
                        roe=Decimal(str(f.roe)) if f.roe is not None else None,
                        revenue_ttm=Decimal(str(f.revenue_ttm))
                        if f.revenue_ttm is not None
                        else None,
                        eps_ttm=Decimal(str(f.eps_ttm)) if f.eps_ttm is not None else None,
                        payload=f.payload,
                        source="fmp",
                    )
                    stmt = ins.on_conflict_do_update(
                        index_elements=[
                            "asset_id",
                            "period_end",
                            "statement_type",
                            "source",
                        ],
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
                    s.execute(stmt)
                    n += 1
                total += n
                print(f"    Lote {batch_num}: +{n} snapshots (Σ {total})")
        except Exception as e:
            print(f"    Lote {batch_num} falhou: {e} — continuando...")
            continue

    return total


def main() -> None:
    phase_display = _phases_raw or "all"
    if not RUN_FRED:
        print(
            f"[run_ingest_daily] QI_INGEST_PHASE={phase_display} — "
            "FRED skipped (gerido pelo cron TS qi-macro)"
        )

    with get_session() as session:
        if RUN_FRED or RUN_FRED_EXPANDED or RUN_POLYGON or RUN_YFINANCE or RUN_FMP:
            seeded = seed_assets_if_empty(session, force=_SEED_FORCE)
            if seeded:
                print(f"Seeded {seeded} assets from CSV.")

        fk = fred_api_key()
        if fk and RUN_FRED:
            jid = job_start(session, "FRED", "macro_observations")
            try:
                n = ingest_fred(session, fk)
                job_finish(session, jid, True, rows_upserted=n)
                print(f"FRED: upserted {n} new macro points.")
            except Exception as e:
                job_finish(session, jid, False, error_message=str(e)[:2000])
                print(f"FRED failed: {e}\n{traceback.format_exc()}")
        elif RUN_FRED and not fk:
            print("Skip FRED (FRED_API_KEY unset).")

        if fk and RUN_FRED_EXPANDED:
            jid = job_start(session, "FRED", "macro_expanded")
            try:
                n = ingest_fred_expanded(session, fk)
                job_finish(session, jid, True, rows_upserted=n)
                print(f"FRED expanded: upserted {n} new macro points.")
            except Exception as e:
                job_finish(session, jid, False, error_message=str(e)[:2000])
                print(f"FRED expanded failed: {e}\n{traceback.format_exc()}")
        elif RUN_FRED_EXPANDED and not fk:
            print("Skip FRED expanded (FRED_API_KEY unset).")

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

        if RUN_YFINANCE:
            jid = job_start(session, "YFINANCE", "daily_ohlcv_yf")
            session.commit()
            try:
                n = ingest_yfinance(session)
                job_finish(session, jid, True, rows_upserted=n)
                print(f"yfinance: wrote {n} daily bars (upserts).")
            except Exception as e:
                session.rollback()
                job_finish(session, jid, False, error_message=str(e)[:2000])
                print(f"yfinance failed: {e}\n{traceback.format_exc()}")

        pk = polygon_api_key()
        if pk and RUN_POLYGON:
            if not gate_ok:
                print(
                    ">>> Polygon: pulado — aumente a cobertura FRED ou defina "
                    "QI_MIN_FRED_PCT=0 para forçar."
                )
            else:
                jid = job_start(session, "POLYGON", "daily_ohlcv")
                # Liberta a transação antes do ingest longo (lotes abrem sessões próprias).
                # Sem isto, Neon/outros PG matam a sessão com idle-in-transaction timeout.
                session.commit()
                try:
                    n = ingest_polygon(session, pk)
                    job_finish(session, jid, True, rows_upserted=n)
                    print(f"Polygon: wrote {n} daily bars (upserts).")
                except Exception as e:
                    session.rollback()
                    job_finish(session, jid, False, error_message=str(e)[:2000])
                    print(f"Polygon failed: {e}\n{traceback.format_exc()}")
        elif not pk and RUN_POLYGON:
            print("Skip Polygon (POLYGON_API_KEY unset).")

        mk = fmp_api_key()
        if mk and RUN_FMP:
            jid = job_start(session, "FMP", "fundamentals_ttm")
            session.commit()
            try:
                n = ingest_fmp(session, mk)
                job_finish(session, jid, True, rows_upserted=n)
                print(f"FMP: upserted {n} fundamental snapshots.")
            except Exception as e:
                session.rollback()
                job_finish(session, jid, False, error_message=str(e)[:2000])
                print(f"FMP failed: {e}\n{traceback.format_exc()}")
        elif not mk and RUN_FMP:
            print("Skip FMP (FMP_API_KEY unset).")

        if RUN_COT:
            jid = job_start(session, "CFTC", "cot_positions")
            session.commit()
            try:
                result = ingest_cot_data(session, weeks_back=52)
                job_finish(session, jid, True, rows_upserted=result["rows_upserted"])
                print(f"COT: upserted {result['rows_upserted']} rows.")
            except Exception as e:
                session.rollback()
                job_finish(session, jid, False, error_message=str(e)[:2000])
                print(f"COT failed: {e}\n{traceback.format_exc()}")

        if RUN_INSIDER:
            jid = job_start(session, "SEC_EDGAR", "insider_form4")
            session.commit()
            try:
                symbols = [
                    r[0]
                    for r in session.execute(
                        select(QiAsset.symbol)
                        .where(QiAsset.is_active.is_(True))
                        .order_by(QiAsset.symbol.asc())
                        .limit(_INSIDER_BATCH_SIZE)
                    ).all()
                ]
                result = ingest_insider_transactions(session, symbols=symbols, days_back=90)
                job_finish(
                    session,
                    jid,
                    True,
                    rows_upserted=result["transactions_upserted"],
                    rows_failed=result["symbols_failed"],
                )
                print(f"Insider: upserted {result['transactions_upserted']} transactions.")
            except Exception as e:
                session.rollback()
                job_finish(session, jid, False, error_message=str(e)[:2000])
                print(f"Insider failed: {e}\n{traceback.format_exc()}")

        if RUN_INSTITUTIONAL:
            jid = job_start(session, "SEC_EDGAR", "institutional_13f")
            session.commit()
            try:
                result = ingest_13f_holdings(session, max_filers=_INSTITUTIONAL_MAX_FILERS)
                job_finish(session, jid, True, rows_upserted=result["holdings_upserted"])
                print(
                    f"13F: upserted {result['holdings_upserted']} holdings "
                    f"across {result['filers_ok']} filers."
                )
            except Exception as e:
                session.rollback()
                job_finish(session, jid, False, error_message=str(e)[:2000])
                print(f"13F failed: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
