"""
Risk Regime Engine v0.2.0 — separado do macro regime.
Classifica: CRISIS | STRESS | WARNING | CALM

HY (BAMLH0A0HYM2): percentagem FRED; limiar 5% ≈ 500 bps para stress com HY.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import QiMacroSeries, QiMacroSeriesPoint, QiRegimeSnapshot
from qi.ids import new_cuid_like

_HY_STRESS_MIN_PCT = 5.0


def _latest(session: Session, ext_id: str) -> float | None:
    sid = session.scalar(
        select(QiMacroSeries.id).where(
            QiMacroSeries.provider == "FRED",
            QiMacroSeries.external_id == ext_id,
        )
    )
    if not sid:
        return None
    val = session.scalar(
        select(QiMacroSeriesPoint.value)
        .where(QiMacroSeriesPoint.series_id == sid)
        .order_by(QiMacroSeriesPoint.observed_on.desc())
        .limit(1)
    )
    return float(val) if val is not None else None


def run_risk_regime(session: Session, as_of: dt.date) -> str:
    vix = _latest(session, "VIXCLS")
    hy_spread = _latest(session, "BAMLH0A0HYM2")
    t10y2y = _latest(session, "T10Y2Y")

    label = "CALM"
    score = Decimal("0")
    reason: list[str] = []

    if vix is not None and vix > 40:
        label = "CRISIS"
        score = Decimal("1")
        reason.append(f"VIX={vix:.1f}>40")

    elif vix is not None and (vix > 28 or (hy_spread is not None and hy_spread > _HY_STRESS_MIN_PCT)):
        label = "STRESS"
        score = Decimal("0.75")
        if vix > 28:
            reason.append(f"VIX={vix:.1f}>28")
        else:
            reason.append(f"HY={hy_spread:.2f}%>{_HY_STRESS_MIN_PCT}")

    elif vix is not None and vix > 20:
        label = "WARNING"
        score = Decimal("0.5")
        reason.append(f"VIX={vix:.1f}>20")

    components = {
        "vix": vix,
        "hy_spread_pct": hy_spread,
        "t10y2y": t10y2y,
        "reason": reason,
        "model": "v0.2.0 risk — CRISIS | STRESS | WARNING | CALM",
    }

    ins = pg_insert(QiRegimeSnapshot).values(
        id=new_cuid_like(),
        kind="RISK",
        as_of_date=as_of,
        model_version=MODEL_VERSION,
        regime_label=label,
        composite_score=score,
        components=components,
    )
    upsert = ins.on_conflict_do_update(
        index_elements=["kind", "as_of_date", "model_version"],
        set_={
            "regime_label": ins.excluded.regime_label,
            "composite_score": ins.excluded.composite_score,
            "components": ins.excluded.components,
        },
    )
    session.execute(upsert)

    return label
