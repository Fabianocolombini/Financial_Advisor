"""Risk regime from realized SPY volatility (20d)."""

from __future__ import annotations


import datetime as dt
from decimal import Decimal
from math import sqrt

from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import QiAsset, QiMarketPriceDaily, QiRegimeSnapshot
from qi.ids import new_cuid_like


def _spy_daily_returns(session: Session, n: int = 22) -> list[float]:
    aid = session.scalar(select(QiAsset.id).where(QiAsset.symbol == "SPY"))
    if not aid:
        return []
    rows = session.scalars(
        select(QiMarketPriceDaily.close)
        .where(QiMarketPriceDaily.asset_id == aid, QiMarketPriceDaily.source == "POLYGON")
        .order_by(QiMarketPriceDaily.trade_date.desc())
        .limit(n + 1)
    ).all()
    closes = [float(c) for c in reversed(rows)]
    if len(closes) < 3:
        return []
    return [closes[i] / closes[i - 1] - 1.0 for i in range(1, len(closes))]


def run_risk_regime(session: Session, as_of: dt.date) -> str:
    rets = _spy_daily_returns(session, 22)
    if len(rets) < 5:
        label = "UNKNOWN"
        vol = None
    else:
        m = sum(rets) / len(rets)
        v = sum((r - m) ** 2 for r in rets) / (len(rets) - 1)
        vol_ann = sqrt(v) * sqrt(252) * 100
        vol = float(vol_ann)
        if vol_ann > 28:
            label = "HIGH_VOL"
        elif vol_ann < 14:
            label = "LOW_VOL"
        else:
            label = "NORMAL_VOL"

    session.add(
        QiRegimeSnapshot(
            id=new_cuid_like(),
            kind="RISK",
            as_of_date=as_of,
            model_version=MODEL_VERSION,
            regime_label=label,
            composite_score=Decimal(str(vol)) if vol is not None else None,
            components={"spy_realized_vol_ann_pct": vol, "window": 20},
        )
    )
    return label
