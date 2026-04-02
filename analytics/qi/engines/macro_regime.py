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
