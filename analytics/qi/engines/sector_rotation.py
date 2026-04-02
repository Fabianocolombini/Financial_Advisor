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
