# Apêndice — código-fonte Python QI (snapshot)

Documento gerado para leitura offline quando o acesso ao GitHub é limitado. **Fonte de verdade:** os mesmos caminhos no repositório `analytics/`.

---

## `qi/jobs/run_ingest_daily.py`

```python
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
```

## `qi/ingest/fred_client.py`

```python
"""Fetch FRED series observations (same contract as TS `lib/market/fred.ts`)."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Iterator

import httpx

_FRED_BASE = "https://api.stlouisfed.org/fred"


@dataclass
class FredObservation:
    date: str
    value: float
    raw: dict[str, str]


def fetch_fred_observations(
    api_key: str,
    series_id: str,
    observation_start: str,
) -> list[FredObservation]:
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": observation_start,
        "sort_order": "asc",
    }
    with httpx.Client(timeout=60.0) as client:
        res = client.get(url, params=params)
        res.raise_for_status()
        data = res.json()
    obs = data.get("observations") or []
    out: list[FredObservation] = []
    for row in obs:
        v = row.get("value", "")
        if v in (".", ""):
            continue
        try:
            n = float(v)
        except ValueError:
            continue
        if not (n == n):  # NaN
            continue
        d = row.get("date", "")
        out.append(FredObservation(date=d, value=n, raw={"date": d, "value": str(v)}))
    return out


def series_metadata(api_key: str, series_id: str) -> dict[str, Any]:
    url = "https://api.stlouisfed.org/fred/series"
    params = {"series_id": series_id, "api_key": api_key, "file_type": "json"}
    with httpx.Client(timeout=30.0) as client:
        res = client.get(url, params=params)
        res.raise_for_status()
        seriess = res.json().get("seriess") or []
        if not seriess:
            return {}
        s0 = seriess[0]
        return {
            "title": s0.get("title"),
            "frequency": s0.get("frequency"),
            "units": s0.get("units"),
            "seasonal_adjustment": s0.get("seasonal_adjustment"),
        }


def fetch_category_children(api_key: str, category_id: int) -> list[dict[str, Any]]:
    """Subcategorias diretas (FRED `/fred/category/children`)."""
    url = f"{_FRED_BASE}/category/children"
    params = {
        "category_id": category_id,
        "api_key": api_key,
        "file_type": "json",
    }
    with httpx.Client(timeout=60.0) as client:
        res = client.get(url, params=params)
        res.raise_for_status()
        return res.json().get("categories") or []


def iter_category_series_pages(
    api_key: str, category_id: int, *, limit: int = 1000
) -> Iterator[list[dict[str, Any]]]:
    """Páginas de séries associadas a uma categoria (`/fred/category/series`)."""
    offset = 0
    url = f"{_FRED_BASE}/category/series"
    with httpx.Client(timeout=120.0) as client:
        while True:
            params = {
                "category_id": category_id,
                "api_key": api_key,
                "file_type": "json",
                "limit": limit,
                "offset": offset,
            }
            res = client.get(url, params=params)
            res.raise_for_status()
            batch = res.json().get("seriess") or []
            if not batch:
                break
            yield batch
            if len(batch) < limit:
                break
            offset += limit


def discover_fred_series_catalog(
    api_key: str,
    *,
    root_category_id: int = 0,
    max_series: int | None = None,
    request_delay_sec: float = 0.55,
    progress_every: int = 1000,
) -> list[dict[str, str]]:
    """
    Percorre a árvore de categorias FRED (BFS), deduplica por `series_id`.
    Pode levar muito tempo e muitas chamadas à API; use `max_series` no MVP.
    Respeite o limite da sua chave (ex.: ~120 req/min).
    """
    seen: dict[str, str] = {}
    queue: list[int] = [root_category_id]
    visited_cat: set[int] = set()

    def pause() -> None:
        if request_delay_sec > 0:
            time.sleep(request_delay_sec)

    n_cat = 0
    while queue:
        cid = queue.pop(0)
        if cid in visited_cat:
            continue
        visited_cat.add(cid)
        n_cat += 1
        if n_cat % 200 == 0:
            print(
                f"FRED discovery: {len(visited_cat)} categorias visitadas, "
                f"{len(seen)} séries únicas até agora…"
            )

        pause()
        try:
            children = fetch_category_children(api_key, cid)
        except Exception:
            children = []
        for ch in children:
            ch_id = ch.get("id")
            if ch_id is None:
                continue
            try:
                qid = int(ch_id)
            except (TypeError, ValueError):
                continue
            if qid not in visited_cat:
                queue.append(qid)

        pause()
        try:
            for page in iter_category_series_pages(api_key, cid):
                pause()
                for s in page:
                    sid = s.get("id")
                    if not sid or not isinstance(sid, str):
                        continue
                    title = s.get("title")
                    if sid not in seen:
                        seen[sid] = (title.strip() if isinstance(title, str) else "") or sid
                        if progress_every and len(seen) % progress_every == 0:
                            print(f"FRED discovery: {len(seen)} séries únicas…")
                    if max_series is not None and len(seen) >= max_series:
                        out = [{"external_id": k, "title": v} for k, v in sorted(seen.items())]
                        return out[:max_series]
        except Exception:
            continue

    out = [{"external_id": k, "title": v} for k, v in sorted(seen.items())]
    if max_series is not None:
        return out[:max_series]
    return out
```

## `requirements.txt`

```text
sqlalchemy>=2.0,<3
psycopg[binary]>=3.1,<4
httpx>=0.27,<1
python-dotenv>=1.0,<2
numpy>=1.26,<3
```

## `pyproject.toml`

```toml
[project]
name = "fa-qi-analytics"
version = "0.1.0"
description = "Ingestion and engines for Financial Advisor quantitative intelligence"
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
  "sqlalchemy>=2.0,<3",
  "psycopg[binary]>=3.1,<4",
  "httpx>=0.27,<1",
  "python-dotenv>=1.0,<2",
  "numpy>=1.26,<3",
]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff>=0.6"]

[build-system]
requires = ["setuptools>=61"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["."]
include = ["qi*"]

[tool.ruff]
line-length = 100
target-version = "py311"
```

## `qi/engines/macro_regime.py`

```python
"""Macro regime from `qi_macro_series_point` (VIX, NFCI, curve)."""

from __future__ import annotations


import datetime as dt
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import QiMacroSeries, QiMacroSeriesPoint, QiRegimeSnapshot
from qi.ids import new_cuid_like


def _latest_value(session: Session, external_id: str) -> float | None:
    sid = session.scalar(
        select(QiMacroSeries.id).where(
            QiMacroSeries.provider == "FRED",
            QiMacroSeries.external_id == external_id,
        )
    )
    if not sid:
        return None
    row = session.scalar(
        select(QiMacroSeriesPoint.value)
        .where(QiMacroSeriesPoint.series_id == sid)
        .order_by(QiMacroSeriesPoint.observed_on.desc())
        .limit(1)
    )
    return float(row) if row is not None else None


def run_macro_regime(session: Session, as_of: dt.date) -> str:
    vix = _latest_value(session, "VIXCLS")
    nfci = _latest_value(session, "NFCI")
    curve = _latest_value(session, "T10Y2Y")

    components: dict = {
        "vix": vix,
        "nfci": nfci,
        "t10y2y": curve,
        "rules": "vix>22 => stress; vix<15 & nfci<0 => easy; else neutral",
    }
    label = "NEUTRAL"
    score = Decimal("0")
    if vix is not None and vix > 22:
        label = "STRESS"
        score = Decimal("1")
    elif vix is not None and vix < 15 and nfci is not None and nfci < 0:
        label = "EASY"
        score = Decimal("-1")
    elif nfci is not None and nfci > 0.5:
        label = "TIGHT_FINANCIAL"
        score = Decimal("0.5")

    session.add(
        QiRegimeSnapshot(
            id=new_cuid_like(),
            kind="MACRO",
            as_of_date=as_of,
            model_version=MODEL_VERSION,
            regime_label=label,
            composite_score=score,
            components=components,
        )
    )
    return label
```

## `qi/engines/sector_rotation.py`

```python
"""Sector rotation scores: 63d relative return vs SPY for sector ETFs."""

from __future__ import annotations


import datetime as dt
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import QiAsset, QiMarketPriceDaily, QiSectorScoreSnapshot
from qi.ids import new_cuid_like

_SECTOR_ETF = {
    "Technology": "XLK",
    "Financials": "XLF",
    "Energy": "XLE",
    "Health Care": "XLV",
    "Industrials": "XLI",
    "Consumer Staples": "XLP",
    "Consumer Discretionary": "XLY",
    "Materials": "XLB",
    "Real Estate": "XLRE",
    "Utilities": "XLU",
    "Communication Services": "XLC",
}


def _close_on(session: Session, symbol: str, days_ago: int) -> float | None:
    aid = session.scalar(select(QiAsset.id).where(QiAsset.symbol == symbol))
    if not aid:
        return None
    rows = session.scalars(
        select(QiMarketPriceDaily.close, QiMarketPriceDaily.trade_date)
        .where(QiMarketPriceDaily.asset_id == aid, QiMarketPriceDaily.source == "POLYGON")
        .order_by(QiMarketPriceDaily.trade_date.desc())
        .limit(days_ago + 5)
    ).all()
    if len(rows) < days_ago:
        return None
    # rows sorted desc — index days_ago is roughly 63 trading days back
    latest = float(rows[0][0])
    past = float(rows[min(days_ago, len(rows) - 1)][0])
    return latest / past - 1.0 if past else None


def run_sector_rotation(session: Session, as_of: dt.date) -> int:
    spy = _close_on(session, "SPY", 63)
    if spy is None:
        return 0
    scores: list[tuple[str, float]] = []
    for sector, sym in _SECTOR_ETF.items():
        r = _close_on(session, sym, 63)
        if r is None:
            continue
        rel = r - spy
        scores.append((sector, rel))
    scores.sort(key=lambda x: x[1], reverse=True)
    n = 0
    for rank, (sector, rel) in enumerate(scores, start=1):
        session.add(
            QiSectorScoreSnapshot(
                id=new_cuid_like(),
                sector_code=sector,
                as_of_date=as_of,
                model_version=MODEL_VERSION,
                composite_score=Decimal(str(rel)),
                sector_rank=rank,
                regime_tag=None,
                components={
                    "rel_return_63d_vs_spy": rel,
                    "sector_etf": _SECTOR_ETF.get(sector),
                    "spy_return_63d": spy,
                },
            )
        )
        n += 1
    return n
```

## `qi/db/session.py`

```python
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from qi.config import database_url

_engine = None
_SessionLocal = None


def _engine_url(url: str) -> str:
    """Use psycopg v3 driver when URL is plain postgresql://."""
    if url.startswith("postgresql://") and not url.startswith("postgresql+psycopg://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(
            _engine_url(database_url()),
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
    return _engine


def _get_session_local():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=_get_engine(),
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
    return _SessionLocal


@contextmanager
def get_session() -> Generator[Session, None, None]:
    SessionLocal = _get_session_local()
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
```

## `qi/config.py`

```python
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parents[2]
_QI_DATA = Path(__file__).resolve().parent / "data"
load_dotenv(_ROOT / ".env.local")
load_dotenv(_ROOT / ".env")


def fred_manifest_path() -> Path:
    """JSON de séries FRED para modo manifest (`QI_FRED_MANIFEST`, default `macro_series.json`)."""
    raw = os.environ.get("QI_FRED_MANIFEST", "macro_series.json").strip() or "macro_series.json"
    p = Path(raw)
    if p.is_absolute():
        return p
    return _QI_DATA / p


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required")
    return url


def polygon_api_key() -> str | None:
    return os.environ.get("POLYGON_API_KEY")


def fred_api_key() -> str | None:
    return os.environ.get("FRED_API_KEY")


def fmp_api_key() -> str | None:
    return os.environ.get("FMP_API_KEY")


def cron_secret() -> str | None:
    return os.environ.get("CRON_SECRET")


MODEL_VERSION = os.environ.get("QI_MODEL_VERSION", "v0.1.0")
```

