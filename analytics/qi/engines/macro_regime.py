"""
Macro Regime Engine v0.2.0
Classifica: STRESS | RECESSION | INFLATION | EXPANSION
Hierarquia: primeiro match vence.
Persistência: upsert em qi_regime_snapshot (kind, as_of_date, model_version).

HY (BAMLH0A0HYM2): valores FRED estão em **percentagem** (~3–8). 500 bps = 5% → limiar 5.0.
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

# HY OAS em % no FRED; 500 bps = 5 pontos percentuais
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


def _last_n(session: Session, ext_id: str, n: int) -> list[float]:
    """Últimos N valores (mais recente primeiro)."""
    sid = session.scalar(
        select(QiMacroSeries.id).where(
            QiMacroSeries.provider == "FRED",
            QiMacroSeries.external_id == ext_id,
        )
    )
    if not sid:
        return []
    rows = session.scalars(
        select(QiMacroSeriesPoint.value)
        .where(QiMacroSeriesPoint.series_id == sid)
        .order_by(QiMacroSeriesPoint.observed_on.desc())
        .limit(n)
    ).all()
    return [float(r) for r in rows]


def _is_rising(values: list[float], lookback: int = 3) -> bool:
    """True se o valor mais recente é maior que a média dos anteriores (até lookback)."""
    if len(values) < 2:
        return False
    recent = values[0]
    past = values[1 : lookback + 1]
    if not past:
        return False
    return recent > sum(past) / len(past)


def _cpi_yoy(session: Session) -> float | None:
    """CPI YoY a partir dos últimos 13 meses (CPIAUCSL mensal)."""
    vals = _last_n(session, "CPIAUCSL", 14)
    if len(vals) < 13:
        return None
    return (vals[0] / vals[12] - 1.0) * 100


def run_macro_regime(session: Session, as_of: dt.date) -> str:
    vix = _latest(session, "VIXCLS")
    t10y2y = _latest(session, "T10Y2Y")
    hy_spread = _latest(session, "BAMLH0A0HYM2")
    nfci = _latest(session, "NFCI")
    fed_funds = _last_n(session, "FEDFUNDS", 4)
    unrate = _last_n(session, "UNRATE", 4)
    cpi_yoy = _cpi_yoy(session)

    fed_funds_now = fed_funds[0] if fed_funds else None
    ff_rising = _is_rising(fed_funds, lookback=2)
    unemp_rising = _is_rising(unrate, lookback=2)

    label = "EXPANSION"
    score = Decimal("0")
    reason: list[str] = []

    if (
        vix is not None
        and hy_spread is not None
        and vix > 30
        and hy_spread > _HY_STRESS_MIN_PCT
    ):
        label = "STRESS"
        score = Decimal("1")
        reason = [f"VIX={vix:.1f}>30", f"HY={hy_spread:.2f}%>{_HY_STRESS_MIN_PCT}"]

    elif t10y2y is not None and unemp_rising and t10y2y < 0:
        label = "RECESSION"
        score = Decimal("0.75")
        reason = [f"T10Y2Y={t10y2y:.2f}<0", "unemployment rising"]

    elif (
        cpi_yoy is not None
        and cpi_yoy > 3.5
        and fed_funds_now is not None
        and fed_funds_now > 3.0
        and ff_rising
    ):
        label = "INFLATION"
        score = Decimal("0.5")
        reason = [
            f"CPI_YoY={cpi_yoy:.1f}%>3.5%",
            f"FEDFUNDS={fed_funds_now:.2f}%",
            "fed_funds rising",
        ]

    elif vix is not None and vix > 22:
        label = "STRESS"
        score = Decimal("0.8")
        reason = [f"VIX={vix:.1f}>22 (standalone)"]

    elif nfci is not None and nfci < 0 and (vix is None or vix < 15):
        label = "EXPANSION"
        score = Decimal("-0.5")
        reason = [f"NFCI={nfci:.3f}<0 (easy financial conditions)"]

    components = {
        "vix": vix,
        "t10y2y": t10y2y,
        "hy_spread_pct": hy_spread,
        "nfci": nfci,
        "fed_funds": fed_funds_now,
        "fed_funds_rising": ff_rising,
        "cpi_yoy_pct": cpi_yoy,
        "unemployment_rising": unemp_rising,
        "reason": reason,
        "model": "v0.2.0 — hierarchy: STRESS > RECESSION > INFLATION > EXPANSION",
    }

    ins = pg_insert(QiRegimeSnapshot).values(
        id=new_cuid_like(),
        kind="MACRO",
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
