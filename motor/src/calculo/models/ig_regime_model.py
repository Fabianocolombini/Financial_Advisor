"""IG credit class regime model — how much IG credit to allocate (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.models.cash_regime_model import (
    _action_from_score,
    _clip,
    _min_action,
    _percentile_0_1,
    _scalar_at,
    regime_action_to_estagio,
)
from motor.src.calculo.models.treasury_regime_model import _term_premium_series
from motor.src.calculo.zscore import zscore_latest_detail
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "ig_regime.json"


def _load_config() -> dict[str, Any]:
    if not _CONFIG_PATH.is_file():
        return {
            "calibrated": False,
            "regime_weights": {
                "w1": 0.30,
                "w2": 0.20,
                "w3": 0.15,
                "w4": 0.25,
                "w5": 0.10,
            },
            "thresholds": {"overweight": 0.65, "hold": 0.45, "reduce": 0.25},
            "percentile_window_days": 1260,
            "delta_spread_days": 20,
            "credit_event_z_threshold": 2.0,
            "term_premium_fred": "THREEFYTP10",
            "ig_spread_fred": "BAMLC0A0CM",
            "ig_aaa_fred": "BAMLC0A1CAAA",
            "ig_bbb_fred": "BAMLC0A4CBBB",
        }
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def _delta_series(series: pd.Series, days: int) -> pd.Series:
    if series.empty:
        return pd.Series(dtype=float)
    return series - series.shift(days)


def _quality_spread_series(bbb_fred: str, aaa_fred: str) -> pd.Series:
    bbb = get_fred_series(bbb_fred)
    aaa = get_fred_series(aaa_fred)
    if bbb.empty or aaa.empty:
        return pd.Series(dtype=float)
    return bbb - aaa


def _z_at(series: pd.Series, as_of: dt.date, window: int) -> tuple[float, float | None]:
    if series.empty:
        return 0.0, None
    cap = pd.Timestamp(as_of)
    truncated = series.loc[pd.DatetimeIndex(pd.to_datetime(series.index)) <= cap]
    if truncated.empty:
        return 0.0, None
    z, latest, _ = zscore_latest_detail(truncated, window=min(window, len(truncated)))
    return z, latest


def compute_ig_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = _load_config()
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    delta_days = int(cfg.get("delta_spread_days", 20))
    credit_z_thr = float(cfg.get("credit_event_z_threshold", 2.0))
    weights = cfg.get("regime_weights", {})
    w1 = float(weights.get("w1", 0.30))
    w2 = float(weights.get("w2", 0.20))
    w3 = float(weights.get("w3", 0.15))
    w4 = float(weights.get("w4", 0.25))
    w5 = float(weights.get("w5", 0.10))
    thresholds = cfg.get("thresholds", {})
    labels = cfg.get("action_labels", {})
    tp_fred = cfg.get("term_premium_fred", "THREEFYTP10")
    ig_fred = cfg.get("ig_spread_fred", "BAMLC0A0CM")
    aaa_fred = cfg.get("ig_aaa_fred", "BAMLC0A1CAAA")
    bbb_fred = cfg.get("ig_bbb_fred", "BAMLC0A4CBBB")

    s_series = get_fred_series(ig_fred)
    tp_series = _term_premium_series(tp_fred)
    f_series = get_external_series("cme", "fed_cut_probability")
    q_series = _quality_spread_series(bbb_fred, aaa_fred)
    delta_s_series = _delta_series(s_series, delta_days)

    s_pct, s_val = _percentile_0_1(s_series, as_of, window)
    tp_pct, tp_val = _percentile_0_1(tp_series, as_of, window)
    f_val = _scalar_at(f_series, as_of)
    if f_val is None:
        f_val = 0.5
    f_bonus = _clip((f_val - 0.5) * 2.0, 0.0, 1.0)
    q_pct, q_val = _percentile_0_1(q_series, as_of, window)
    delta_s_z, delta_s_val = _z_at(delta_s_series, as_of, window)

    delta_penalty = _clip(delta_s_z, 0.0, 3.0) / 3.0
    ig_regime_score = (
        w1 * s_pct + w2 * tp_pct + w3 * f_bonus - w4 * delta_penalty - w5 * q_pct
    )

    credit_event_flag = delta_s_z > credit_z_thr

    action_calc = _action_from_score(ig_regime_score, thresholds, labels)
    regime_action = (
        _min_action(action_calc, labels.get("reduce", "Reduce"))
        if credit_event_flag
        else action_calc
    )

    componentes = [
        {
            "id": "ig_oas",
            "nome": "Spread OAS IG (S)",
            "valor": s_val,
            "percentile_0_1": s_pct,
            "peso": w1,
            "contribuicao": w1 * s_pct,
            "role": "carry — spread IG vs histórico 5y",
        },
        {
            "id": "term_premium",
            "nome": "Term premium 10y (TP)",
            "valor": tp_val,
            "percentile_0_1": tp_pct,
            "peso": w2,
            "contribuicao": w2 * tp_pct,
            "role": "contexto de duration — THREEFYTP10",
        },
        {
            "id": "fed_cut_probability",
            "nome": "Fed cut probability 6m (F)",
            "valor": f_val,
            "bonus_0_1": f_bonus,
            "peso": w3,
            "contribuicao": w3 * f_bonus,
            "role": "bônus — corte favorece crédito IG",
        },
        {
            "id": "delta_ig_spread_20d",
            "nome": f"Δ spread IG ({delta_days}d)",
            "valor": delta_s_val,
            "z_score": delta_s_z,
            "penalty_0_1": delta_penalty,
            "peso": w4,
            "contribuicao": -w4 * delta_penalty,
            "role": "widening rápido penaliza — credit event override",
        },
        {
            "id": "ig_bbb_aaa_spread",
            "nome": "Spread BBB−AAA (Q)",
            "valor": q_val,
            "percentile_0_1": q_pct,
            "peso": w5,
            "contribuicao": -w5 * q_pct,
            "role": "deterioração de qualidade dentro do IG",
        },
    ]

    dominant = max(
        [c for c in componentes if c["peso"] > 0],
        key=lambda c: abs(c["contribuicao"]),
        default=None,
    )

    explanation = _build_explanation(
        ig_regime_score=ig_regime_score,
        regime_action=regime_action,
        action_calc=action_calc,
        credit_event_flag=credit_event_flag,
        s_pct=s_pct,
        s_val=s_val,
        tp_pct=tp_pct,
        f_val=f_val,
        f_bonus=f_bonus,
        delta_s_z=delta_s_z,
        q_pct=q_pct,
        calibrated=bool(cfg.get("calibrated", False)),
    )

    return {
        "aba_id": "fi_ig",
        "nome": "Renda Fixa Corporativa IG",
        "data": as_of.isoformat(),
        "ig_regime_score": ig_regime_score,
        "score_composto": ig_regime_score,
        "regime_action": regime_action,
        "regime_action_calculated": action_calc,
        "credit_event_flag": credit_event_flag,
        "stress_flag": credit_event_flag,
        "estagio": regime_action_to_estagio(regime_action),
        "componentes": componentes,
        "indicador_dominante": dominant,
        "calibrated": bool(cfg.get("calibrated", False)),
        "calibration_note": cfg.get("note", ""),
        "model": "ig_regime_v1",
        "explanation": explanation,
    }


def _build_explanation(
    *,
    ig_regime_score: float,
    regime_action: str,
    action_calc: str,
    credit_event_flag: bool,
    s_pct: float,
    s_val: float | None,
    tp_pct: float,
    f_val: float,
    f_bonus: float,
    delta_s_z: float,
    q_pct: float,
    calibrated: bool,
) -> list[str]:
    lines = [
        (
            f"IGRegimeScore = {ig_regime_score:.3f} → ação **{regime_action}** "
            "(quanto alocar em crédito IG)."
        ),
        (
            f"Spread IG OAS: pct 5y = {s_pct:.0%}"
            + (f", S = {s_val:.2f}" if s_val is not None else "")
            + " — driver primário de carry."
        ),
        f"Term premium: pct 5y = {tp_pct:.0%} — contexto de duration.",
        f"Fed cut prob: {f_val:.0%}, F_bonus = {f_bonus:.2f}.",
        f"ΔS z-score 20d = {delta_s_z:.2f}; spread BBB−AAA pct = {q_pct:.0%}.",
    ]
    if credit_event_flag:
        lines.append(
            f"Credit event flag ON (ΔS_z > 2) → teto Reduce "
            f"(ação calculada: {action_calc})."
        )
    if not calibrated:
        lines.append("⚠ Pesos não calibrados (`calibrated: false`).")
    return lines


def backfill_ig_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = get_fred_series(_load_config().get("ig_spread_fred", "BAMLC0A0CM"))
    if ref.empty:
        result = compute_ig_regime(motor_as_of_date())
        persist_aba_score(result, estagio=result["estagio"])
        return 1

    as_of_cap = motor_as_of_date()
    eligible = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(as_of_cap)]
    dates = eligible[-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        result = compute_ig_regime(d_date)
        persist_aba_score(result, estagio=result["estagio"])
        n += 1
    return n


def ig_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    result = compute_ig_regime(as_of)
    result["aba_id"] = aba_id
    return result


def sanity_check_credit_event_march_2020() -> dict[str, Any]:
    """Cheap validation: credit_event_flag during COVID credit widening."""
    hits: list[dict[str, str]] = []
    start = dt.date(2020, 3, 1)
    end = dt.date(2020, 4, 30)
    ref = get_fred_series(_load_config().get("ig_spread_fred", "BAMLC0A0CM"))
    if ref.empty:
        return {"ok": False, "error": "no IG OAS history"}
    for d in ref.index:
        d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
        if d_date < start or d_date > end:
            continue
        r = compute_ig_regime(d_date)
        if r.get("credit_event_flag"):
            hits.append({"date": d_date.isoformat(), "action": r.get("regime_action")})
    return {
        "ok": True,
        "period": "2020-03/04",
        "credit_event_days": len(hits),
        "sample": hits[:5],
        "passed": len(hits) > 0,
    }
