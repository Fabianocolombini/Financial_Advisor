from __future__ import annotations

import datetime as dt
import math
from statistics import median
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import (
    QiAsset,
    QiMarketPriceDaily,
    QiRecommendation,
    QiRegimeSnapshot,
    QiSectorScoreSnapshot,
    QiUniverseMember,
)
from qi.ids import new_cuid_like


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _latest_regime(session: Session, as_of: dt.date) -> tuple[str, float]:
    row = session.scalar(
        select(QiRegimeSnapshot)
        .where(
            QiRegimeSnapshot.kind == "MACRO",
            QiRegimeSnapshot.as_of_date == as_of,
            QiRegimeSnapshot.model_version == f"{MODEL_VERSION}:US",
        )
        .order_by(QiRegimeSnapshot.created_at.desc())
        .limit(1)
    )
    if not row:
        return "EXPANSION", 0.5
    return row.regime_label, float(row.composite_score or 0.5)


def _latest_sector_scores(session: Session, as_of: dt.date) -> list[QiSectorScoreSnapshot]:
    return session.scalars(
        select(QiSectorScoreSnapshot)
        .where(
            QiSectorScoreSnapshot.as_of_date == as_of,
            QiSectorScoreSnapshot.model_version == MODEL_VERSION,
        )
        .order_by(QiSectorScoreSnapshot.sector_rank.asc())
    ).all()


def _asset_momentum(session: Session, asset_id: str, lookback: int) -> float:
    rows = session.scalars(
        select(QiMarketPriceDaily.close)
        .where(QiMarketPriceDaily.asset_id == asset_id)
        .order_by(QiMarketPriceDaily.trade_date.desc())
        .limit(lookback + 5)
    ).all()
    closes = [float(c) for c in reversed(rows)]
    if len(closes) < 5:
        return 0.0
    past = closes[0]
    if past <= 0:
        return 0.0
    return closes[-1] / past - 1.0


def score_conviction(asset: dict[str, Any], sector_score: float, regime: str) -> dict[str, Any]:
    metrics = asset.get("metrics_cache") or {}
    rank_in_sector = int(asset.get("rank_in_sector", 8))

    sector_component = sector_score * 0.40

    momentum_30d = float(asset.get("momentum_30d", 0.0))
    momentum_90d = float(asset.get("momentum_90d", 0.0))
    momentum_component = _sigmoid((momentum_30d - momentum_90d) * 10.0) * 0.30

    pe = metrics.get("pe_ratio")
    sector_pe_median = asset.get("sector_pe_median", pe)
    if pe and sector_pe_median:
        pe_score = max(0.0, min(1.0, 1.0 - (float(pe) - float(sector_pe_median)) / float(sector_pe_median)))
    else:
        pe_score = 0.5
    fundamental_component = pe_score * 0.20

    anticrowding_base = 0.3 if rank_in_sector <= 5 else 1.0
    anticrowding_component = anticrowding_base * 0.10

    total = sector_component + momentum_component + fundamental_component + anticrowding_component

    return {
        "conviction_score": round(total, 4),
        "sector_alignment": round(sector_component, 4),
        "price_momentum": round(momentum_component, 4),
        "fundamental_quality": round(fundamental_component, 4),
        "anti_crowding": round(anticrowding_component, 4),
        "pe_ratio": pe,
        "sector_pe_median": sector_pe_median,
        "momentum_30d_pct": round(momentum_30d * 100, 2),
        "momentum_90d_pct": round(momentum_90d * 100, 2),
        "rank_in_sector": rank_in_sector,
        "regime": regime,
    }


def generate_recommendations(
    session: Session,
    region: str = "US",
    top_n_sectors: int = 3,
    candidates_per_sector: int = 5,
    as_of: dt.date | None = None,
) -> list[dict[str, Any]]:
    as_of = as_of or dt.date.today()
    regime, regime_confidence = _latest_regime(session, as_of)
    sector_scores = _latest_sector_scores(session, as_of)
    if not sector_scores:
        return []

    top_sectors = [s for s in sector_scores if s.sector_rank <= top_n_sectors]

    latest_run_id = session.scalar(
        select(QiUniverseMember.universe_run_id).order_by(QiUniverseMember.id.desc()).limit(1)
    )
    if not latest_run_id:
        return []

    members = session.scalars(
        select(QiUniverseMember).where(QiUniverseMember.universe_run_id == latest_run_id)
    ).all()
    by_sector: dict[str, list[QiUniverseMember]] = {}
    for m in members:
        inc = m.inclusion_reason or {}
        if inc.get("pool") != "equity_sector":
            continue
        sector = inc.get("gics_sector")
        if sector:
            by_sector.setdefault(sector, []).append(m)

    recommendations: list[dict[str, Any]] = []
    for srow in top_sectors:
        sector = srow.sector_code
        cands = by_sector.get(sector, [])
        if not cands:
            continue

        pe_values: list[float] = []
        assets: list[tuple[QiUniverseMember, QiAsset]] = []
        for m in cands:
            a = session.get(QiAsset, m.asset_id)
            if not a:
                continue
            assets.append((m, a))
            mc = a.metrics_cache or {}
            pe = mc.get("pe_ratio")
            if pe is not None:
                try:
                    pe_values.append(float(pe))
                except (TypeError, ValueError):
                    pass
        sector_pe_median = median(pe_values) if pe_values else None

        scored_assets: list[tuple[dict[str, Any], QiAsset, str]] = []
        for m, a in assets:
            mom30 = _asset_momentum(session, a.id, 30)
            mom90 = _asset_momentum(session, a.id, 90)
            conv = score_conviction(
                {
                    "metrics_cache": a.metrics_cache or {},
                    "rank_in_sector": (m.inclusion_reason or {}).get("rank_in_sector", 8),
                    "momentum_30d": mom30,
                    "momentum_90d": mom90,
                    "sector_pe_median": sector_pe_median,
                },
                sector_score=float(srow.composite_score),
                regime=regime,
            )
            action = "BUY" if conv["conviction_score"] >= 0.65 else ("HOLD" if conv["conviction_score"] >= 0.45 else "AVOID")
            scored_assets.append((conv, a, action))

        scored_assets.sort(key=lambda x: x[0]["conviction_score"], reverse=True)
        for conv, a, action in scored_assets[:candidates_per_sector]:
            target_weight = round(conv["conviction_score"] / max(1, top_n_sectors * candidates_per_sector), 4)
            rationale = {
                "regime": regime,
                "regime_confidence": regime_confidence,
                "sector": sector,
                "sector_rank": srow.sector_rank,
                "sector_score": float(srow.composite_score),
                "conviction": conv["conviction_score"],
                "components": {
                    "sector_alignment": {
                        "score": conv["sector_alignment"],
                        "weight": "40%",
                        "explanation": f"{sector} rank {srow.sector_rank} score={float(srow.composite_score):.3f}",
                    },
                    "price_momentum": {
                        "score": conv["price_momentum"],
                        "weight": "30%",
                        "explanation": f"30d={conv['momentum_30d_pct']}% vs 90d={conv['momentum_90d_pct']}%",
                    },
                    "fundamental_quality": {
                        "score": conv["fundamental_quality"],
                        "weight": "20%",
                        "explanation": f"PE={conv['pe_ratio']} vs setor={conv['sector_pe_median']}",
                    },
                    "anti_crowding": {
                        "score": conv["anti_crowding"],
                        "weight": "10%",
                        "explanation": f"rank_in_sector={conv['rank_in_sector']}",
                    },
                },
                "action": action,
                "target_weight_pct": round(target_weight * 100, 2),
                "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
            payload = {
                "symbol": a.symbol,
                "gics_sector": sector,
                "region": region,
                "regime": regime,
                "action": action,
                "conviction": conv["conviction_score"],
                "target_weight": target_weight,
                "rationale": rationale,
            }
            session.add(
                QiRecommendation(
                    id=new_cuid_like(),
                    portfolio_id=None,
                    valid_from=as_of,
                    valid_until=None,
                    engine="recommendation_engine",
                    model_version=MODEL_VERSION,
                    status="draft",
                    payload=payload,
                    universe_run_id=latest_run_id,
                )
            )
            recommendations.append(payload)

    # Add commodities recommendations in stress/inflation.
    if regime in {"STRESS", "INFLATION"}:
        comm = [
            m for m in members
            if (m.inclusion_reason or {}).get("pool") == "commodities"
        ][:3]
        for m in comm:
            a = session.get(QiAsset, m.asset_id)
            if not a:
                continue
            payload = {
                "symbol": a.symbol,
                "gics_sector": "Commodities",
                "region": region,
                "regime": regime,
                "action": "BUY",
                "conviction": 0.6,
                "target_weight": 0.02,
                "rationale": {
                    "regime": regime,
                    "components": {
                        "anti_crowding": {"score": 0.1, "weight": "10%", "explanation": "commodity hedge"}
                    },
                },
            }
            session.add(
                QiRecommendation(
                    id=new_cuid_like(),
                    portfolio_id=None,
                    valid_from=as_of,
                    valid_until=None,
                    engine="recommendation_engine",
                    model_version=MODEL_VERSION,
                    status="draft",
                    payload=payload,
                    universe_run_id=latest_run_id,
                )
            )
            recommendations.append(payload)

    session.flush()
    return recommendations

