from __future__ import annotations

import datetime as dt
import math
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import QiAsset, QiMarketPriceDaily, QiRegimeSnapshot, QiSectorScoreSnapshot
from qi.ids import new_cuid_like

REGIME_SECTOR_AFFINITY: dict[str, dict[str, float]] = {
    "EXPANSION": {
        "Information Technology": 0.90,
        "Consumer Discretionary": 0.85,
        "Industrials": 0.80,
        "Financials": 0.75,
        "Communication Services": 0.70,
        "Health Care": 0.55,
        "Materials": 0.60,
        "Energy": 0.50,
        "Real Estate": 0.45,
        "Consumer Staples": 0.35,
        "Utilities": 0.30,
        "Commodities": 0.40,
    },
    "INFLATION": {
        "Energy": 0.95,
        "Materials": 0.90,
        "Commodities": 0.90,
        "Real Estate": 0.75,
        "Utilities": 0.65,
        "Financials": 0.60,
        "Consumer Staples": 0.55,
        "Health Care": 0.50,
        "Industrials": 0.45,
        "Consumer Discretionary": 0.30,
        "Communication Services": 0.25,
        "Information Technology": 0.20,
    },
    "RECESSION": {
        "Consumer Staples": 0.90,
        "Health Care": 0.85,
        "Utilities": 0.80,
        "Commodities": 0.55,
        "Communication Services": 0.45,
        "Financials": 0.30,
        "Real Estate": 0.25,
        "Information Technology": 0.35,
        "Industrials": 0.20,
        "Consumer Discretionary": 0.15,
        "Energy": 0.20,
        "Materials": 0.20,
    },
    "STRESS": {
        "Commodities": 0.95,
        "Utilities": 0.80,
        "Consumer Staples": 0.75,
        "Health Care": 0.70,
        "Communication Services": 0.40,
        "Financials": 0.20,
        "Real Estate": 0.20,
        "Energy": 0.30,
        "Materials": 0.25,
        "Consumer Discretionary": 0.10,
        "Information Technology": 0.15,
        "Industrials": 0.15,
    },
}

SECTOR_ETF_MAP = {
    "Information Technology": "XLK",
    "Health Care": "XLV",
    "Financials": "XLF",
    "Consumer Discretionary": "XLY",
    "Consumer Staples": "XLP",
    "Industrials": "XLI",
    "Energy": "XLE",
    "Materials": "XLB",
    "Real Estate": "XLRE",
    "Utilities": "XLU",
    "Communication Services": "XLC",
    "Commodities": "GLD",
}


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


def _close_rows(session: Session, symbol: str, n: int = 95) -> list[float]:
    aid = session.scalar(select(QiAsset.id).where(QiAsset.symbol == symbol))
    if not aid:
        return []
    rows = session.scalars(
        select(QiMarketPriceDaily.close)
        .where(QiMarketPriceDaily.asset_id == aid)
        .order_by(QiMarketPriceDaily.trade_date.desc())
        .limit(n)
    ).all()
    return [float(x) for x in reversed(rows)]


def get_sector_momentum_90d(session: Session, etf_symbol: str) -> float:
    closes = _close_rows(session, etf_symbol, 95)
    if len(closes) < 30:
        return 0.0
    latest = closes[-1]
    past = closes[0]
    if past <= 0:
        return 0.0
    return latest / past - 1.0


def score_sector(
    sector: str,
    regime: str,
    regime_confidence: float,
    sector_momentum_90d: float,
    momentum_weight: float = 0.30,
) -> float:
    affinity = REGIME_SECTOR_AFFINITY.get(regime, REGIME_SECTOR_AFFINITY["EXPANSION"]).get(
        sector, 0.5
    )
    base_score = affinity * regime_confidence
    momentum_norm = _sigmoid(sector_momentum_90d * 6.0)
    return (1.0 - momentum_weight) * base_score + momentum_weight * momentum_norm


def run_sector_rotation(
    session: Session,
    region: str = "US",
    as_of: dt.date | None = None,
) -> list[dict[str, Any]]:
    as_of = as_of or dt.date.today()
    regime, conf = _latest_regime(session, as_of)
    rows: list[dict[str, Any]] = []

    for sector, etf in SECTOR_ETF_MAP.items():
        mom = get_sector_momentum_90d(session, etf)
        score = score_sector(sector, regime, conf, mom)
        rows.append({"sector": sector, "etf": etf, "momentum_90d": mom, "score": score})

    rows.sort(key=lambda x: x["score"], reverse=True)

    for rank, row in enumerate(rows, start=1):
        session.add(
            QiSectorScoreSnapshot(
                id=new_cuid_like(),
                sector_code=row["sector"],
                as_of_date=as_of,
                model_version=MODEL_VERSION,
                composite_score=Decimal(str(row["score"])),
                sector_rank=rank,
                regime_tag=regime,
                components={
                    "region": region,
                    "regime": regime,
                    "regime_confidence": conf,
                    "sector_etf": row["etf"],
                    "momentum_90d": row["momentum_90d"],
                    "score_formula": "0.7*(affinity*confidence)+0.3*sigmoid(momentum)",
                },
                universe_run_id=None,
            )
        )

    session.flush()
    return rows

