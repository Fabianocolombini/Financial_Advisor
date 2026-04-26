"""Expand assets universe and build global universe members (90% relevance mass)."""

from __future__ import annotations

import csv
import io
import os
import traceback
from pathlib import Path
from typing import Any

import datetime as dt
import httpx
import pandas as pd
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import QiAsset, QiMarketPriceDaily, QiUniverseMember, QiUniverseRun
from qi.db.session import get_session
from qi.ids import new_cuid_like
from qi.ingest.job_logging import job_finish, job_start
from qi.jobs.seed_assets import seed_assets_if_empty

WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
USER_AGENT = (
    "Mozilla/5.0 (compatible; QI-BuildUniverse/1.0; "
    "+https://github.com/financial-advisor/qi)"
)
_INTL_CSV = Path(__file__).resolve().parents[1] / "data" / "universe_international_curated.csv"
_COVERAGE_TARGET = float(os.environ.get("QI_UNIVERSE_COVERAGE_TARGET", "0.90"))
_LOOKBACK_DAYS = int(os.environ.get("QI_UNIVERSE_LOOKBACK_DAYS", "30"))

POOL_A_ETF_CURATED = [
    "SPY", "QQQ", "IWM", "VTI", "EFA", "EEM", "VEA", "VWO",
    "XLK", "XLV", "XLF", "XLY", "XLP", "XLI", "XLE", "XLB", "XLRE", "XLU", "XLC",
    "TLT", "IEF", "SHY", "HYG", "LQD", "EMB",
    "EWJ", "EWG", "EWU", "EWZ", "FXI", "INDA",
]

POOL_C_COMMODITIES = ["GLD", "SLV", "USO", "DBA", "PDBC", "GDX", "COPX", "UNG"]

GICS_SECTORS = [
    "Information Technology",
    "Health Care",
    "Financials",
    "Consumer Discretionary",
    "Consumer Staples",
    "Industrials",
    "Energy",
    "Materials",
    "Real Estate",
    "Utilities",
    "Communication Services",
]

EQUITY_QUOTA_PER_SECTOR = int(os.environ.get("QI_EQUITY_QUOTA_PER_SECTOR", "15"))
ADR_QUOTA_PER_SECTOR = int(os.environ.get("QI_ADR_QUOTA_PER_SECTOR", "5"))
MIN_UNIVERSE_MEMBERS = int(os.environ.get("QI_UNIVERSE_MIN_MEMBERS", "250"))

_GICS_ALIASES: dict[str, str] = {
    "Technology": "Information Technology",
    "Telecommunication Services": "Communication Services",
    "Telecommunications Services": "Communication Services",
}


def _norm_gics(raw: Any) -> str | None:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    t = str(raw).strip()
    if not t:
        return None
    return _GICS_ALIASES.get(t, t)


def _find_sp500_dataframe(tables: list[Any]) -> pd.DataFrame:
    for df in tables:
        cols = [str(c).lower() for c in df.columns]
        joined = " ".join(cols)
        if "symbol" in joined and "gics" in joined:
            return df
    raise RuntimeError("Tabela S&P 500 (colunas Symbol + GICS) não encontrada no HTML Wikipedia")


def fetch_sp500_wikipedia() -> pd.DataFrame:
    with httpx.Client(timeout=90.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as c:
        r = c.get(WIKI_URL)
        r.raise_for_status()
    tables = pd.read_html(io.StringIO(r.text))
    return _find_sp500_dataframe(tables)


def _col(df: pd.DataFrame, *must_contain: str) -> str:
    must = [m.lower() for m in must_contain]
    for col in df.columns:
        s = str(col).lower()
        if all(m in s for m in must):
            return str(col)
    raise KeyError(f"Nenhuma coluna contém {must_contain}; temos {list(df.columns)}")


def _security_col(df: pd.DataFrame) -> str:
    try:
        return _col(df, "security")
    except KeyError:
        return _col(df, "company")


def _gics_sector_col(df: pd.DataFrame) -> str:
    for col in df.columns:
        if str(col).strip().lower() == "gics sector":
            return str(col)
    for col in df.columns:
        s = str(col).lower()
        if "gics" in s and "sector" in s and "sub" not in s:
            return str(col)
    raise KeyError(f"Coluna GICS Sector não encontrada: {list(df.columns)}")


def _wiki_symbol(raw: Any) -> str:
    return str(raw).strip().upper()


def _merge_metrics(existing: dict[str, Any] | None, patch: dict[str, Any]) -> dict[str, Any]:
    """Merge patch; preserve existing `bucket` if already set (seed wins)."""
    out = dict(existing or {})
    prev_bucket = out.get("bucket")
    out.update(patch)
    if prev_bucket:
        out["bucket"] = prev_bucket
    return out


def _upsert_equity(
    session: Session,
    *,
    symbol: str,
    name: str,
    gics_sector: str | None,
    metrics_cache: dict[str, Any] | None,
    now: dt.datetime,
) -> None:
    t = QiAsset.__table__
    ins = pg_insert(t).values(
        id=new_cuid_like(),
        symbol=symbol,
        asset_type="EQUITY",
        exchange_mic=None,
        currency="USD",
        name=name,
        gics_sector=gics_sector,
        gics_industry=None,
        cik=None,
        is_active=True,
        metrics_cache=metrics_cache if metrics_cache else None,
        first_seen_at=now,
        updated_at=now,
    )
    stmt = ins.on_conflict_do_update(
        index_elements=[t.c.symbol],
        set_={
            "name": ins.excluded.name,
            "asset_type": ins.excluded.asset_type,
            "gics_sector": ins.excluded.gics_sector,
            "metrics_cache": ins.excluded.metrics_cache,
            "updated_at": ins.excluded.updated_at,
        },
    )
    session.execute(stmt)


def build_global_universe(session: Session) -> dict[str, int]:
    now = dt.datetime.now(dt.timezone.utc)
    stats: dict[str, int] = {
        "seed_upserted": 0,
        "sp500_wikipedia_rows": 0,
        "sp500_upserted": 0,
        "international_rows": 0,
        "international_upserted": 0,
    }

    # Base do universo vem do seed CSV (force=True para refletir correções de symbols).
    stats["seed_upserted"] = seed_assets_if_empty(session, force=True)

    # Política definida: K deve ficar inativo.
    session.execute(
        QiAsset.__table__.update()
        .where(QiAsset.symbol == "K")
        .values(is_active=False, updated_at=now)
    )

    df = fetch_sp500_wikipedia()
    sym_col = _col(df, "symbol")
    sec_col = _security_col(df)
    gics_col = _gics_sector_col(df)

    syms: list[str] = []
    for _, row in df.iterrows():
        sym = _wiki_symbol(row[sym_col])
        if not sym or sym == "SYMBOL":
            continue
        syms.append(sym)

    stats["sp500_wikipedia_rows"] = len(syms)

    existing = {
        a.symbol: a
        for a in session.scalars(select(QiAsset).where(QiAsset.symbol.in_(syms))).all()
    }

    for _, row in df.iterrows():
        sym = _wiki_symbol(row[sym_col])
        if not sym or sym == "SYMBOL":
            continue

        name = str(row[sec_col]).strip() if sec_col in row and not pd.isna(row[sec_col]) else sym
        sector = _norm_gics(row[gics_col] if gics_col in row else None)
        ex = existing.get(sym)
        mc = _merge_metrics(
            ex.metrics_cache if ex else None,
            {
                "region": "us",
                "universe": "sp500",
                "wikipedia_source": "List_of_S%26P_500_companies",
            },
        )
        _upsert_equity(session, symbol=sym, name=name, gics_sector=sector, metrics_cache=mc, now=now)
        stats["sp500_upserted"] += 1

    if _INTL_CSV.is_file():
        with _INTL_CSV.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            intl_rows = list(reader)
        stats["international_rows"] = len(intl_rows)
        intl_syms = [r["symbol"].strip().upper() for r in intl_rows if r.get("symbol")]
        existing_i = {
            a.symbol: a
            for a in session.scalars(select(QiAsset).where(QiAsset.symbol.in_(intl_syms))).all()
        }
        for row in intl_rows:
            sym = (row.get("symbol") or "").strip().upper()
            if not sym:
                continue
            name = (row.get("name") or sym).strip()
            sector = (row.get("gics_sector") or "").strip() or None
            bucket = (row.get("bucket") or "").strip() or None
            region = (row.get("region") or "").strip() or None
            patch: dict[str, Any] = {"universe": "international_curated"}
            if bucket:
                patch["bucket"] = bucket
            if region:
                patch["region"] = region
            ex = existing_i.get(sym)
            mc = _merge_metrics(ex.metrics_cache if ex else None, patch)
            _upsert_equity(session, symbol=sym, name=name, gics_sector=sector, metrics_cache=mc, now=now)
            stats["international_upserted"] += 1

    session.flush()
    return stats


def build_universe_members(
    session: Session,
    coverage_target: float = _COVERAGE_TARGET,
) -> tuple[str, int, float]:
    cutoff = dt.date.today() - dt.timedelta(days=_LOOKBACK_DAYS)
    rows = session.execute(
        select(
            QiAsset.id,
            QiAsset.symbol,
            QiAsset.asset_type,
            QiAsset.gics_sector,
            QiAsset.exchange_mic,
            QiAsset.metrics_cache,
            func.avg(QiMarketPriceDaily.volume * QiMarketPriceDaily.close).label("liq_score"),
        )
        .join(QiMarketPriceDaily, QiMarketPriceDaily.asset_id == QiAsset.id)
        .where(QiAsset.is_active.is_(True))
        .where(QiMarketPriceDaily.trade_date >= cutoff)
        .group_by(
            QiAsset.id,
            QiAsset.symbol,
            QiAsset.asset_type,
            QiAsset.gics_sector,
            QiAsset.exchange_mic,
            QiAsset.metrics_cache,
        )
    ).all()

    asset_by_symbol: dict[str, dict[str, Any]] = {}
    for row in rows:
        metrics = row.metrics_cache if isinstance(row.metrics_cache, dict) else {}
        market_cap = None
        pe_ratio = None
        try:
            if metrics.get("market_cap") is not None:
                market_cap = float(metrics.get("market_cap"))
        except (TypeError, ValueError):
            market_cap = None
        try:
            if metrics.get("pe_ratio") is not None:
                pe_ratio = float(metrics.get("pe_ratio"))
        except (TypeError, ValueError):
            pe_ratio = None
        region = str(metrics.get("region", "")).lower()
        exchange = (row.exchange_mic or "").upper()
        is_domestic = exchange in {"XNYS", "XNAS"} or region == "us"
        asset_by_symbol[row.symbol] = {
            "asset_id": row.id,
            "symbol": row.symbol,
            "asset_type": row.asset_type,
            "gics_sector": row.gics_sector,
            "liq_score": float(row.liq_score or 0.0),
            "market_cap": market_cap,
            "pe_ratio": pe_ratio,
            "is_domestic": is_domestic,
        }

    def _pool_a_kind(symbol: str) -> str:
        if symbol in {"SPY", "QQQ", "IWM", "VTI", "EFA", "EEM", "VEA", "VWO"}:
            return "benchmark"
        if symbol in {"XLK", "XLV", "XLF", "XLY", "XLP", "XLI", "XLE", "XLB", "XLRE", "XLU", "XLC"}:
            return "sector"
        if symbol in {"TLT", "IEF", "SHY", "HYG", "LQD", "EMB"}:
            return "fixed_income"
        if symbol in {"GLD", "SLV", "USO", "DBA", "PDBC", "GDX", "COPX"}:
            return "commodity"
        return "regional"

    def _commodity_kind(symbol: str) -> str:
        if symbol in {"GLD", "SLV"}:
            return "metal"
        if symbol in {"USO", "UNG"}:
            return "energy"
        if symbol in {"DBA", "PDBC"}:
            return "agriculture"
        return "miner"

    run_id = new_cuid_like()
    now = dt.datetime.now(dt.timezone.utc)
    members: list[QiUniverseMember] = []
    global_rank = 1
    selected_asset_ids: set[str] = set()
    session.add(
        QiUniverseRun(
            id=run_id,
            run_at=now,
            model_version=MODEL_VERSION,
            gics_sector="GLOBAL",
            coverage_target=Decimal(str(coverage_target)),
            total_relevance_mass=Decimal("1.0"),
            metadata_={
                "algorithm": "three_pool_opportunity",
                "window_days": _LOOKBACK_DAYS,
                "equity_quota_per_sector": EQUITY_QUOTA_PER_SECTOR,
                "adr_quota_per_sector": ADR_QUOTA_PER_SECTOR,
            },
            is_accepted=True,
        )
    )
    session.flush()

    # Pool A: ETFs curados (intencional, sem corte por liquidez).
    pool_a = [asset_by_symbol[s] for s in POOL_A_ETF_CURATED if s in asset_by_symbol]
    n_a = max(1, len(pool_a))
    for i, item in enumerate(pool_a, start=1):
        if item["asset_id"] in selected_asset_ids:
            continue
        members.append(
            QiUniverseMember(
                id=new_cuid_like(),
                universe_run_id=run_id,
                asset_id=item["asset_id"],
                member_rank=global_rank,
                relevance_score=Decimal(str(item["liq_score"])),
                relevance_mass=Decimal(str(1.0 / n_a)),
                cumulative_coverage=Decimal(str(i / n_a)),
                is_etf=True,
                inclusion_reason={"pool": "etf_curated", "etf_type": _pool_a_kind(item["symbol"])},
            )
        )
        selected_asset_ids.add(item["asset_id"])
        global_rank += 1

    # Pool B: equities setoriais com score anti-concentração.
    overflow_candidates: list[dict[str, Any]] = []
    for sector in GICS_SECTORS:
        candidates = [
            a
            for a in asset_by_symbol.values()
            if a["asset_type"] == "EQUITY" and a["gics_sector"] == sector and a["liq_score"] > 0
        ]
        if not candidates:
            continue

        liqs = sorted([a["liq_score"] for a in candidates if a["liq_score"] > 0])
        med_liq = liqs[len(liqs) // 2] if liqs else 1.0
        mcs = sorted([a["market_cap"] for a in candidates if a["market_cap"] and a["market_cap"] > 0])
        p75 = mcs[int((len(mcs) - 1) * 0.75)] if mcs else None
        p90 = mcs[int((len(mcs) - 1) * 0.90)] if mcs else None
        pes = sorted([a["pe_ratio"] for a in candidates if a["pe_ratio"] and a["pe_ratio"] > 0])
        med_pe = pes[len(pes) // 2] if pes else None

        def score_equity_opportunity(asset: dict[str, Any]) -> tuple[float, float, float, float]:
            liq_rel_raw = asset["liq_score"] / med_liq if med_liq and med_liq > 0 else 0.0
            liquidity_score = min(liq_rel_raw, 2.0) / 2.0

            mcap = asset["market_cap"]
            if mcap is None or p75 is None or p90 is None:
                megacap_penalty = 0.6
            elif mcap < p75:
                megacap_penalty = 1.0
            elif mcap <= p90:
                megacap_penalty = 0.5
            else:
                megacap_penalty = 0.2

            pe = asset["pe_ratio"]
            if pe is None or med_pe is None or med_pe <= 0:
                fundamentals_score = 0.5
            else:
                ratio = pe / med_pe
                if 0.5 <= ratio <= 2.0:
                    fundamentals_score = 1.0
                elif 0.33 <= ratio <= 3.0:
                    fundamentals_score = 0.7
                else:
                    fundamentals_score = 0.3

            score = (
                0.4 * liquidity_score
                + 0.3 * megacap_penalty
                + 0.3 * fundamentals_score
            )
            return score, liquidity_score, megacap_penalty, fundamentals_score

        ranked: list[dict[str, Any]] = []
        for asset in candidates:
            score, liq_comp, mega_comp, fund_comp = score_equity_opportunity(asset)
            out = dict(asset)
            out.update(
                {
                    "opportunity_score": score,
                    "liquidity_component": liq_comp,
                    "megacap_penalty": mega_comp,
                    "fundamentals_score": fund_comp,
                    "is_adr": not asset["is_domestic"],
                }
            )
            ranked.append(out)

        domestic = sorted(
            [r for r in ranked if not r["is_adr"]],
            key=lambda r: r["opportunity_score"],
            reverse=True,
        )[:EQUITY_QUOTA_PER_SECTOR]
        adrs = sorted(
            [r for r in ranked if r["is_adr"]],
            key=lambda r: r["opportunity_score"],
            reverse=True,
        )[:ADR_QUOTA_PER_SECTOR]

        selected = domestic + adrs
        if not selected:
            continue
        selected_ids = {s["asset_id"] for s in selected}
        overflow_candidates.extend(
            [r for r in ranked if r["asset_id"] not in selected_ids]
        )

        total_sector_score = sum(max(s["opportunity_score"], 0.000001) for s in selected)
        for rank_sector, item in enumerate(selected, start=1):
            if item["asset_id"] in selected_asset_ids:
                continue
            score = max(item["opportunity_score"], 0.000001)
            mass = score / total_sector_score if total_sector_score > 0 else 0.0
            members.append(
                QiUniverseMember(
                    id=new_cuid_like(),
                    universe_run_id=run_id,
                    asset_id=item["asset_id"],
                    member_rank=global_rank,
                    relevance_score=Decimal(str(score)),
                    relevance_mass=Decimal(str(mass)),
                    cumulative_coverage=Decimal(str(rank_sector / len(selected))),
                    is_etf=False,
                    inclusion_reason={
                        "pool": "equity_sector",
                        "gics_sector": sector,
                        "rank_in_sector": rank_sector,
                        "is_adr": bool(item["is_adr"]),
                        "liquidity_score": round(item["liquidity_component"], 6),
                        "megacap_penalty": round(item["megacap_penalty"], 6),
                        "fundamentals_score": round(item["fundamentals_score"], 6),
                    },
                )
            )
            selected_asset_ids.add(item["asset_id"])
            global_rank += 1

    if len(members) < MIN_UNIVERSE_MEMBERS:
        overflow_sorted = sorted(
            [c for c in overflow_candidates if c["asset_id"] not in selected_asset_ids],
            key=lambda r: r["opportunity_score"],
            reverse=True,
        )
        for item in overflow_sorted:
            if len(members) >= MIN_UNIVERSE_MEMBERS:
                break
            members.append(
                QiUniverseMember(
                    id=new_cuid_like(),
                    universe_run_id=run_id,
                    asset_id=item["asset_id"],
                    member_rank=global_rank,
                    relevance_score=Decimal(str(max(item["opportunity_score"], 0.000001))),
                    relevance_mass=Decimal("0.0"),
                    cumulative_coverage=Decimal("1.0"),
                    is_etf=False,
                    inclusion_reason={
                        "pool": "equity_sector",
                        "gics_sector": item["gics_sector"],
                        "rank_in_sector": EQUITY_QUOTA_PER_SECTOR + ADR_QUOTA_PER_SECTOR + 1,
                        "is_adr": bool(item["is_adr"]),
                        "liquidity_score": round(item["liquidity_component"], 6),
                        "megacap_penalty": round(item["megacap_penalty"], 6),
                        "fundamentals_score": round(item["fundamentals_score"], 6),
                        "overflow_fill": True,
                    },
                )
            )
            selected_asset_ids.add(item["asset_id"])
            global_rank += 1

    # Pool C: commodities independentes.
    pool_c = [asset_by_symbol[s] for s in POOL_C_COMMODITIES if s in asset_by_symbol]
    n_c = max(1, len(pool_c))
    for i, item in enumerate(pool_c, start=1):
        if item["asset_id"] in selected_asset_ids:
            continue
        members.append(
            QiUniverseMember(
                id=new_cuid_like(),
                universe_run_id=run_id,
                asset_id=item["asset_id"],
                member_rank=global_rank,
                relevance_score=Decimal(str(item["liq_score"])),
                relevance_mass=Decimal(str(1.0 / n_c)),
                cumulative_coverage=Decimal(str(i / n_c)),
                is_etf=True,
                inclusion_reason={
                    "pool": "commodities",
                    "commodity_type": _commodity_kind(item["symbol"]),
                },
            )
        )
        selected_asset_ids.add(item["asset_id"])
        global_rank += 1

    for m in members:
        session.add(m)
    session.flush()
    return run_id, len(members), coverage_target


def main() -> None:
    with get_session() as session:
        jid = job_start(session, "YFINANCE", "universe_build")
        try:
            stats = build_global_universe(session)
            run_id, members, coverage = build_universe_members(session, coverage_target=_COVERAGE_TARGET)
            n_assets = session.scalar(select(func.count()).select_from(QiAsset))
            n_active = session.scalar(
                select(func.count()).select_from(QiAsset).where(QiAsset.is_active.is_(True))
            )
            job_finish(
                session,
                jid,
                True,
                rows_upserted=stats["sp500_upserted"] + stats["international_upserted"],
                cursor={
                    **stats,
                    "qi_asset_total": n_assets,
                    "qi_asset_active": n_active,
                    "global_universe_run_id": run_id,
                    "global_universe_members": members,
                    "global_coverage": coverage,
                },
            )
            print("=== qi:build-universe (global) ===")
            print(f"Seed CSV — upserts qi_asset:   {stats['seed_upserted']}")
            print(f"S&P 500 — linhas Wikipedia: {stats['sp500_wikipedia_rows']}")
            print(f"S&P 500 — upserts qi_asset:   {stats['sp500_upserted']}")
            print(f"Internacional — linhas CSV:    {stats['international_rows']}")
            print(f"Internacional — upserts:       {stats['international_upserted']}")
            print(f"Total qi_asset após build:     {n_assets}")
            print(f"Ativos ativos após build:      {n_active}")
            print(f"Universe run id:               {run_id}")
            print(f"Universe members:              {members}")
            print(f"Universe coverage final:       {coverage:.4f}")
        except Exception as e:
            session.rollback()
            job_finish(session, jid, False, error_message=str(e)[:2000])
            print(f"build_global_universe falhou: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
