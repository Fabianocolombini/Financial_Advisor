"""Build per-sector universe runs (~90% relevance mass) + hysteresis vs last accepted run."""

from __future__ import annotations

import datetime as dt
import os
from decimal import Decimal
from typing import Any, Sequence

import numpy as np
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import (
    QiAsset,
    QiFundamentalSnapshot,
    QiMarketPriceDaily,
    QiUniverseConfig,
    QiUniverseMember,
    QiUniverseRun,
)
from qi.ids import new_cuid_like
from qi.universe.relevance import compute_masses

COVERAGE_TARGET = Decimal("0.9000")
MAX_PER_SECTOR = int(os.environ.get("QI_UNIVERSE_MAX_PER_SECTOR", "120"))


def _sectors_from_db(session: Session) -> list[str]:
    q = (
        select(QiAsset.gics_sector)
        .where(QiAsset.gics_sector.is_not(None), QiAsset.is_active.is_(True))
        .distinct()
    )
    return sorted({r for r in session.scalars(q).all() if r})


def _latest_market_cap(session: Session, asset_id: str) -> float:
    row = session.scalar(
        select(QiFundamentalSnapshot.market_cap)
        .where(QiFundamentalSnapshot.asset_id == asset_id)
        .order_by(QiFundamentalSnapshot.period_end.desc())
        .limit(1)
    )
    if row is None:
        return 0.0
    return float(row)


def _avg_dollar_volume_20d(session: Session, asset_id: str) -> float:
    q = (
        select(QiMarketPriceDaily.close, QiMarketPriceDaily.volume)
        .where(
            QiMarketPriceDaily.asset_id == asset_id,
            QiMarketPriceDaily.source == "POLYGON",
        )
        .order_by(QiMarketPriceDaily.trade_date.desc())
        .limit(20)
    )
    rows = session.execute(q).all()
    if not rows:
        return 0.0
    tot = 0.0
    for c, v in rows:
        tot += float(c) * float(v)
    return tot / len(rows)


def _eligible_assets(session: Session, sector: str) -> list[QiAsset]:
    return list(
        session.scalars(
            select(QiAsset).where(
                QiAsset.gics_sector == sector,
                QiAsset.is_active.is_(True),
            )
        ).all()
    )


def _greedy_coverage(
    order: Sequence[str],
    mass_by_id: dict[str, float],
    target: float,
) -> list[str]:
    total = sum(mass_by_id[i] for i in order)
    if total <= 0:
        return list(order)[:MAX_PER_SECTOR]
    cum = 0.0
    out: list[str] = []
    for aid in order:
        if cum / total >= target and len(out) >= 3:
            break
        out.append(aid)
        cum += mass_by_id[aid]
        if len(out) >= MAX_PER_SECTOR:
            break
    return out


def build_sector_universe(session: Session, sector: str, metadata: dict[str, Any] | None = None) -> str:
    eligible = _eligible_assets(session, sector)
    if not eligible:
        return ""

    caps = np.array([_latest_market_cap(session, a.id) for a in eligible], dtype=float)
    liqs = np.array([_avg_dollar_volume_20d(session, a.id) for a in eligible], dtype=float)
    is_etf = np.array([1.0 if a.asset_type == "ETF" else 0.0 for a in eligible], dtype=float)

    masses, breakdowns = compute_masses(market_caps=caps, dollar_vols=liqs, is_etf=is_etf)
    mass_by_id = {eligible[i].id: float(masses[i]) for i in range(len(eligible))}
    score_by_id = {eligible[i].id: float(breakdowns[i].relevance_raw) for i in range(len(eligible))}
    order = sorted(eligible, key=lambda a: mass_by_id[a.id], reverse=True)
    order_ids = [a.id for a in order]

    cfg = session.get(QiUniverseConfig, sector)
    prev_ids: set[str] = set()
    if cfg and cfg.accepted_run_id:
        prev_ids = set(
            session.scalars(
                select(QiUniverseMember.asset_id).where(
                    QiUniverseMember.universe_run_id == cfg.accepted_run_id
                )
            ).all()
        )

    eligible_ids = {a.id for a in eligible}
    raw_pick = _greedy_coverage(order_ids, mass_by_id, float(COVERAGE_TARGET))
    merged_ids = set(raw_pick) | (prev_ids & eligible_ids)
    merged_order = sorted(merged_ids, key=lambda i: mass_by_id.get(i, 0.0), reverse=True)
    final_ids = _greedy_coverage(merged_order, mass_by_id, float(COVERAGE_TARGET))

    total_mass = float(sum(mass_by_id.values()))
    run_id = new_cuid_like()
    meta = {
        "coverage_target": float(COVERAGE_TARGET),
        "max_per_sector": MAX_PER_SECTOR,
        "hysteresis": True,
        "prev_accepted_count": len(prev_ids),
        **(metadata or {}),
    }
    session.add(
        QiUniverseRun(
            id=run_id,
            model_version=MODEL_VERSION,
            gics_sector=sector,
            coverage_target=COVERAGE_TARGET,
            total_relevance_mass=Decimal(str(total_mass)) if total_mass else None,
            metadata_=meta,
            is_accepted=False,
        )
    )
    session.flush()

    cum = 0.0
    for rank, aid in enumerate(final_ids, start=1):
        a = next(x for x in eligible if x.id == aid)
        i = next(ii for ii, e in enumerate(eligible) if e.id == aid)
        bd = breakdowns[i]
        m = mass_by_id[aid]
        cum += m
        cov = (cum / total_mass) if total_mass > 0 else 0.0
        session.add(
            QiUniverseMember(
                id=new_cuid_like(),
                universe_run_id=run_id,
                asset_id=aid,
                member_rank=rank,
                relevance_score=Decimal(str(score_by_id[aid])),
                relevance_mass=Decimal(str(m)),
                cumulative_coverage=Decimal(str(min(cov, 1.0))),
                is_etf=a.asset_type == "ETF",
                inclusion_reason={
                    "z_log_cap": bd.z_log_cap,
                    "z_log_liq": bd.z_log_liq,
                    "z_etf_vehicle": bd.z_etf_vehicle,
                    "z_purity": bd.z_purity,
                    "weights": bd.weights,
                    "market_cap": caps[i],
                    "dollar_vol_20d": liqs[i],
                },
            )
        )

    session.execute(
        update(QiUniverseRun)
        .where(
            QiUniverseRun.gics_sector == sector,
            QiUniverseRun.is_accepted.is_(True),
        )
        .values(is_accepted=False)
    )
    run_row = session.get(QiUniverseRun, run_id)
    if run_row:
        run_row.is_accepted = True
    if cfg:
        cfg.accepted_run_id = run_id
        cfg.updated_at = dt.datetime.now(dt.timezone.utc)
    else:
        session.add(
            QiUniverseConfig(
                gics_sector=sector,
                accepted_run_id=run_id,
                updated_at=dt.datetime.now(dt.timezone.utc),
            )
        )
    session.flush()
    return run_id


def build_all_sectors(session: Session) -> list[str]:
    out: list[str] = []
    for sec in _sectors_from_db(session):
        rid = build_sector_universe(session, sec)
        if rid:
            out.append(rid)
    return out
