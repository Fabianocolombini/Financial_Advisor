"""Turn sector + asset scores into a model recommendation (explainable JSON)."""

from __future__ import annotations

import datetime as dt
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import QiAssetScoreSnapshot, QiRecommendation, QiSectorScoreSnapshot
from qi.ids import new_cuid_like


def _softmax(xs: list[float], temperature: float = 1.0) -> list[float]:
    if not xs:
        return []
    m = max(xs)
    ex = [math.exp((x - m) / temperature) for x in xs]
    s = sum(ex)
    return [e / s for e in ex] if s > 0 else [1.0 / len(xs)] * len(xs)


def run_allocation(session: Session, as_of: dt.date) -> str | None:
    sectors = session.scalars(
        select(QiSectorScoreSnapshot)
        .where(
            QiSectorScoreSnapshot.as_of_date == as_of,
            QiSectorScoreSnapshot.model_version == MODEL_VERSION,
        )
        .order_by(QiSectorScoreSnapshot.sector_rank)
    ).all()
    if not sectors:
        return None

    all_asset_rows = session.scalars(
        select(QiAssetScoreSnapshot).where(
            QiAssetScoreSnapshot.as_of_date == as_of,
            QiAssetScoreSnapshot.model_version == MODEL_VERSION,
        )
    ).all()

    scores = [float(s.composite_score) for s in sectors]
    sw = _softmax(scores, temperature=0.35)
    max_sector_w = 0.25
    sw = [min(w, max_sector_w) for w in sw]
    ssum = sum(sw)
    sw = [w / ssum for w in sw] if ssum else sw

    target: dict[str, float] = {}
    rationale: dict = {"sector_layer": [], "asset_layer": []}

    for sec_row, w in zip(sectors, sw):
        if w < 0.02:
            continue
        assets = [
            a
            for a in all_asset_rows
            if (a.components or {}).get("sector") == sec_row.sector_code
        ]
        assets.sort(key=lambda a: a.asset_rank or 999)
        assets = assets[:3]

        if not assets:
            rationale["sector_layer"].append(
                {"sector": sec_row.sector_code, "weight": w, "assets": "none"}
            )
            continue

        aw = _softmax([float(a.composite_score) for a in assets], temperature=0.5)
        for a, awi in zip(assets, aw):
            contrib = w * awi
            target[a.asset_id] = target.get(a.asset_id, 0.0) + contrib
            rationale["asset_layer"].append(
                {
                    "asset_id": a.asset_id,
                    "symbol": (a.components or {}).get("symbol"),
                    "sector": sec_row.sector_code,
                    "weight": contrib,
                    "sector_weight": w,
                    "within_sector_weight": awi,
                    "asset_composite": float(a.composite_score),
                }
            )
        rationale["sector_layer"].append(
            {
                "sector": sec_row.sector_code,
                "weight": w,
                "sector_composite": float(sec_row.composite_score),
            }
        )

    tw = sum(target.values())
    if tw > 0:
        target = {k: v / tw for k, v in target.items()}

    rid = new_cuid_like()
    session.add(
        QiRecommendation(
            id=rid,
            portfolio_id=None,
            valid_from=as_of,
            valid_until=None,
            engine="allocation",
            model_version=MODEL_VERSION,
            status="draft",
            payload={
                "target_weights_by_asset_id": target,
                "rationale": rationale,
                "max_sector_weight_cap": max_sector_w,
            },
            universe_run_id=None,
        )
    )
    return rid
