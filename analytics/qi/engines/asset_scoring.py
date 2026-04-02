"""Per-asset scores within each sector (momentum + value), universe-aware."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import (
    QiAsset,
    QiFundamentalSnapshot,
    QiMarketPriceDaily,
    QiUniverseConfig,
    QiUniverseMember,
    QiAssetScoreSnapshot,
)
from qi.ids import new_cuid_like


def _ret_126d(session: Session, asset_id: str) -> float | None:
    rows = session.scalars(
        select(QiMarketPriceDaily.close)
        .where(QiMarketPriceDaily.asset_id == asset_id, QiMarketPriceDaily.source == "POLYGON")
        .order_by(QiMarketPriceDaily.trade_date.desc())
        .limit(130)
    ).all()
    closes = [float(c) for c in reversed(rows)]
    if len(closes) < 30:
        return None
    last = closes[-1]
    past = closes[0]
    return last / past - 1.0 if past else None


def _pe_ttm(session: Session, asset_id: str) -> float | None:
    row = session.scalar(
        select(QiFundamentalSnapshot.pe_ratio)
        .where(QiFundamentalSnapshot.asset_id == asset_id)
        .order_by(QiFundamentalSnapshot.period_end.desc())
        .limit(1)
    )
    return float(row) if row is not None and float(row) > 0 else None


def run_asset_scoring(session: Session, as_of: dt.date) -> int:
    configs = session.scalars(select(QiUniverseConfig)).all()
    n = 0
    for cfg in configs:
        if not cfg.accepted_run_id:
            continue
        members = session.scalars(
            select(QiUniverseMember).where(
                QiUniverseMember.universe_run_id == cfg.accepted_run_id
            )
        ).all()
        if not members:
            continue
        rets: list[float] = []
        pes: list[float] = []
        for m in members:
            r = _ret_126d(session, m.asset_id)
            pe = _pe_ttm(session, m.asset_id)
            rets.append(r if r is not None else np.nan)
            pes.append(pe if pe is not None else np.nan)
        arr_r = np.array(rets, dtype=float)
        arr_inv_pe = np.array([1.0 / p if np.isfinite(p) and p > 0 else np.nan for p in pes])
        z_m = (arr_r - np.nanmean(arr_r)) / (np.nanstd(arr_r) or 1.0)
        z_v = (arr_inv_pe - np.nanmean(arr_inv_pe)) / (np.nanstd(arr_inv_pe) or 1.0)
        z_m = np.nan_to_num(z_m, nan=0.0)
        z_v = np.nan_to_num(z_v, nan=0.0)
        comp = 0.55 * z_m + 0.45 * z_v
        order = sorted(range(len(members)), key=lambda i: comp[i], reverse=True)
        for rank, i in enumerate(order, start=1):
            m = members[i]
            sym = session.scalar(select(QiAsset.symbol).where(QiAsset.id == m.asset_id))
            session.add(
                QiAssetScoreSnapshot(
                    id=new_cuid_like(),
                    asset_id=m.asset_id,
                    as_of_date=as_of,
                    model_version=MODEL_VERSION,
                    composite_score=Decimal(str(float(comp[i]))),
                    asset_rank=rank,
                    components={
                        "z_momentum_126d": float(z_m[i]),
                        "z_value_inv_pe": float(z_v[i]),
                        "return_126d": float(arr_r[i]) if np.isfinite(arr_r[i]) else None,
                        "pe": float(pes[i]) if np.isfinite(pes[i]) else None,
                        "symbol": sym,
                        "sector": cfg.gics_sector,
                        "weights": {"momentum": 0.55, "value": 0.45},
                    },
                    universe_run_id=cfg.accepted_run_id,
                )
            )
            n += 1
    return n
