from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from qi.config import MODEL_VERSION
from qi.db.models import QiMacroSeries, QiMacroSeriesPoint, QiRegimeSnapshot
from qi.ids import new_cuid_like

REGION_SERIES_MAP: dict[str, dict[str, str]] = {
    "US": {
        "gdp_growth": "GDPC1",
        "inflation": "CPIAUCSL",
        "policy_rate": "FEDFUNDS",
        "unemployment": "UNRATE",
        "yield_spread": "T10Y2Y",
        "vix": "VIXCLS",
    },
    "EU": {
        "gdp_growth": "CLVMNACSCAB1GQEU272020",
        "inflation": "CP0000EZ19M086NEST",
        "policy_rate": "IRSTCI01EZM156N",
        "unemployment": "LRHUTTTTEZM156S",
        "yield_spread": "IRLTLT01EZM156N",
        "vix": "VIXCLS",
    },
    "JP": {
        "gdp_growth": "JPNRGDPEXP",
        "inflation": "JPNCPIALLMINMEI",
        "policy_rate": "IRSTCI01JPM156N",
        "unemployment": "LRHUTTTTJPM156S",
        "yield_spread": "IRLTLT01JPM156N",
        "vix": "VIXCLS",
    },
    "EM": {
        "gdp_growth": "NYGDPMKTPCDWLD",
        "inflation": "FPCPITOTLZGEM",
        "policy_rate": "FR.INR.LEND",
        "unemployment": "SLUEMTOTLZSEM",
        "yield_spread": "BAMLEMCBPIOAS",
        "vix": "VIXCLS",
    },
}


def _series_id(session: Session, external_id: str) -> str | None:
    return session.scalar(
        select(QiMacroSeries.id).where(
            QiMacroSeries.provider == "FRED",
            QiMacroSeries.external_id == external_id,
        )
    )


def _last_n_values(session: Session, external_id: str, n: int) -> list[float]:
    sid = _series_id(session, external_id)
    if not sid:
        return []
    rows = session.scalars(
        select(QiMacroSeriesPoint.value)
        .where(QiMacroSeriesPoint.series_id == sid)
        .order_by(QiMacroSeriesPoint.observed_on.desc())
        .limit(n)
    ).all()
    return [float(v) for v in rows if v is not None]


def _signal_value(session: Session, external_id: str, fallback: str) -> tuple[float | None, bool]:
    vals = _last_n_values(session, external_id, 2)
    if vals:
        return vals[0], False
    fvals = _last_n_values(session, fallback, 2)
    if fvals:
        return fvals[0], True
    return None, True


def _compute_signals(session: Session, region: str) -> dict[str, Any]:
    mapping = REGION_SERIES_MAP.get(region, REGION_SERIES_MAP["US"])
    out: dict[str, Any] = {"region": region, "proxy_used": []}

    for key, ext in mapping.items():
        value, proxied = _signal_value(session, ext, REGION_SERIES_MAP["US"][key])
        out[key] = value
        if proxied:
            out["proxy_used"].append(key)

    gdp = _last_n_values(session, mapping["gdp_growth"], 3)
    if len(gdp) >= 2 and gdp[1] != 0:
        out["gdp_growth"] = ((gdp[0] / gdp[1]) - 1.0) * 100.0

    cpi = _last_n_values(session, mapping["inflation"], 14)
    if len(cpi) >= 13 and cpi[12] != 0:
        out["inflation"] = ((cpi[0] / cpi[12]) - 1.0) * 100.0

    un = _last_n_values(session, mapping["unemployment"], 12)
    if un:
        out["unemployment"] = un[0]
        out["unemployment_12m_avg"] = sum(un) / len(un)

    r = _last_n_values(session, mapping["policy_rate"], 4)
    if r:
        out["policy_rate"] = r[0]
        out["policy_rate_3m_ago"] = r[min(3, len(r) - 1)]

    return out


def classify_regime(signals: dict[str, Any], region: str) -> tuple[str, float, dict[str, Any]]:
    detail: dict[str, Any] = {"region": region}
    vix = float(signals.get("vix") or 20.0)
    spread = float(signals.get("yield_spread") or 1.0)
    gdp = float(signals.get("gdp_growth") or 2.0)
    unemp = float(signals.get("unemployment") or 4.0)
    unemp_trend = float(signals.get("unemployment_12m_avg") or unemp)
    cpi = float(signals.get("inflation") or 2.0)
    rate = float(signals.get("policy_rate") or 2.0)
    rate_prev = float(signals.get("policy_rate_3m_ago") or rate)

    stress_score = 0
    if vix > 30:
        stress_score += 1
        detail["vix_stress"] = True
    if spread < -0.5:
        stress_score += 1
        detail["inverted_curve"] = True
    if stress_score >= 1:
        return "STRESS", min(stress_score / 2.0 + 0.5, 1.0), detail

    recession_score = 0
    if gdp < 0:
        recession_score += 2
        detail["negative_gdp"] = True
    if unemp > unemp_trend + 1.5:
        recession_score += 1
        detail["rising_unemployment"] = True
    if recession_score >= 2:
        return "RECESSION", min(recession_score / 3.0, 1.0), detail

    inflation_score = 0
    if cpi > 4.0:
        inflation_score += 2
        detail["high_cpi"] = True
    if rate > rate_prev:
        inflation_score += 1
        detail["rising_rates"] = True
    if spread > 0:
        inflation_score += 1
        detail["positive_spread"] = True
    if inflation_score >= 2:
        return "INFLATION", min(inflation_score / 4.0, 1.0), detail

    expansion_score = 0
    if gdp > 0:
        expansion_score += 1
        detail["positive_gdp"] = True
    if unemp < unemp_trend:
        expansion_score += 1
        detail["falling_unemployment"] = True
    if 1.5 <= cpi <= 4.0:
        expansion_score += 1
        detail["moderate_cpi"] = True
    return "EXPANSION", min(expansion_score / 3.0, 1.0), detail


def run_regime_engine(
    session: Session,
    regions: list[str] | None = None,
    as_of: dt.date | None = None,
) -> list[dict[str, Any]]:
    regions = regions or ["US", "EU", "JP", "EM"]
    as_of = as_of or dt.date.today()
    out: list[dict[str, Any]] = []

    for region in regions:
        signals = _compute_signals(session, region)
        regime, confidence, detail = classify_regime(signals, region)
        region_model = f"{MODEL_VERSION}:{region}"
        components = {
            **signals,
            **detail,
            "regime": regime,
            "confidence": confidence,
            "region": region,
            "model": "phase3_regime_engine_v1",
        }

        ins = pg_insert(QiRegimeSnapshot).values(
            id=new_cuid_like(),
            kind="MACRO",
            as_of_date=as_of,
            model_version=region_model,
            regime_label=regime,
            composite_score=Decimal(str(confidence)),
            components=components,
        )
        stmt = ins.on_conflict_do_update(
            index_elements=["kind", "as_of_date", "model_version"],
            set_={
                "regime_label": ins.excluded.regime_label,
                "composite_score": ins.excluded.composite_score,
                "components": ins.excluded.components,
            },
        )
        session.execute(stmt)
        out.append(
            {"region": region, "regime": regime, "confidence": confidence, "signals": components}
        )

    session.flush()
    return out

