"""Treasury class regime model — how much duration to allocate (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.proxy_indicators import compute_proxy_series
from motor.src.calculo.models.cash_regime_model import (
    _action_from_score,
    _clip,
    _max_action,
    _min_action,
    _percentile_0_1,
    _scalar_at,
    regime_action_to_estagio,
)
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "treasury_regime.json"


def _load_config() -> dict[str, Any]:
    if not _CONFIG_PATH.is_file():
        return {
            "calibrated": False,
            "regime_weights": {"w1": 0.45, "w2": 0.35, "w3": 0.2},
            "thresholds": {"overweight": 0.65, "hold": 0.45, "reduce": 0.25},
            "stress_percentile": 0.8,
            "percentile_window_days": 1260,
            "delta_yield_days": 20,
            "term_premium_fred": "ACMTP10",
        }
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def _term_premium_series(fred_id: str) -> pd.Series:
    s = get_fred_series(fred_id)
    if not s.empty:
        return s
    ext = get_external_series("ny_fed", "term_premium_10y")
    return ext


def _delta_yield_real_series(days: int) -> pd.Series:
    dfii = get_fred_series("DFII10")
    if dfii.empty:
        return pd.Series(dtype=float)
    return dfii - dfii.shift(days)


def compute_treasury_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = _load_config()
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    delta_days = int(cfg.get("delta_yield_days", 20))
    weights = cfg.get("regime_weights", {})
    w1 = float(weights.get("w1", 0.45))
    w2 = float(weights.get("w2", 0.35))
    w3 = float(weights.get("w3", 0.2))
    thresholds = cfg.get("thresholds", {})
    labels = cfg.get("action_labels", {})
    stress_thr = float(cfg.get("stress_percentile", 0.8))
    tp_fred = cfg.get("term_premium_fred", "ACMTP10")

    tp_series = _term_premium_series(tp_fred)
    f_series = get_external_series("cme", "fed_cut_probability")
    bv_series = compute_proxy_series("bond_vol_proxy")
    v_series = get_fred_series("VIXCLS")
    dy_series = _delta_yield_real_series(delta_days)

    tp_pct, tp_val = _percentile_0_1(tp_series, as_of, window)
    f_val = _scalar_at(f_series, as_of)
    if f_val is None:
        f_val = 0.5
    f_bonus = _clip((f_val - 0.5) * 2.0, 0.0, 1.0)
    bv_pct, bv_val = _percentile_0_1(bv_series, as_of, window)
    v_pct, v_val = _percentile_0_1(v_series, as_of, window)
    delta_y = _scalar_at(dy_series, as_of)

    treasury_regime_score = w1 * tp_pct + w2 * f_bonus - w3 * bv_pct

    flight_to_quality = v_pct > stress_thr and delta_y is not None and delta_y < 0
    inflation_shock = v_pct > stress_thr and delta_y is not None and delta_y > 0

    action_calc = _action_from_score(treasury_regime_score, thresholds, labels)
    regime_action = action_calc
    if flight_to_quality:
        regime_action = _max_action(regime_action, labels.get("overweight", "Overweight"))
    elif inflation_shock:
        regime_action = _min_action(regime_action, labels.get("reduce", "Reduce"))

    componentes = [
        {
            "id": "term_premium",
            "nome": "Term premium 10y (TP)",
            "valor": tp_val,
            "percentile_0_1": tp_pct,
            "peso": w1,
            "contribuicao": w1 * tp_pct,
            "role": "compensação por risco de duration — ACM/NY Fed",
        },
        {
            "id": "fed_cut_probability",
            "nome": "Fed cut probability (F)",
            "valor": f_val,
            "bonus_0_1": f_bonus,
            "peso": w2,
            "contribuicao": w2 * f_bonus,
            "role": "bônus — corte eleva preço de duration (oposto ao Cash)",
        },
        {
            "id": "bond_vol_proxy",
            "nome": "Bond vol proxy (BV)",
            "valor": bv_val,
            "percentile_0_1": bv_pct,
            "peso": w3,
            "contribuicao": -w3 * bv_pct,
            "role": "vol de juros — penaliza drawdown",
        },
        {
            "id": "vix",
            "nome": "VIX (V)",
            "valor": v_val,
            "percentile_0_1": v_pct,
            "peso": 0.0,
            "contribuicao": 0.0,
            "role": "stress — duas faces com ΔY real",
        },
        {
            "id": "delta_yield_real_20d",
            "nome": f"Δ yield real 10y ({delta_days}d)",
            "valor": delta_y,
            "peso": 0.0,
            "contribuicao": 0.0,
            "role": "diferencia fuga à qualidade vs choque inflação (2022)",
        },
    ]

    dominant = max(
        [c for c in componentes if c["peso"] > 0],
        key=lambda c: abs(c["contribuicao"]),
        default=None,
    )

    explanation = _build_explanation(
        treasury_regime_score=treasury_regime_score,
        regime_action=regime_action,
        action_calc=action_calc,
        flight_to_quality=flight_to_quality,
        inflation_shock=inflation_shock,
        tp_pct=tp_pct,
        tp_val=tp_val,
        f_val=f_val,
        f_bonus=f_bonus,
        bv_pct=bv_pct,
        v_pct=v_pct,
        delta_y=delta_y,
        calibrated=bool(cfg.get("calibrated", False)),
    )

    return {
        "aba_id": "fi_treasury",
        "nome": "Renda Fixa Soberana",
        "data": as_of.isoformat(),
        "treasury_regime_score": treasury_regime_score,
        "score_composto": treasury_regime_score,
        "regime_action": regime_action,
        "regime_action_calculated": action_calc,
        "flight_to_quality_flag": flight_to_quality,
        "inflation_shock_flag": inflation_shock,
        "stress_flag": flight_to_quality or inflation_shock,
        "estagio": regime_action_to_estagio(regime_action),
        "componentes": componentes,
        "indicador_dominante": dominant,
        "calibrated": bool(cfg.get("calibrated", False)),
        "calibration_note": cfg.get("note", ""),
        "model": "treasury_regime_v1",
        "explanation": explanation,
    }


def _build_explanation(
    *,
    treasury_regime_score: float,
    regime_action: str,
    action_calc: str,
    flight_to_quality: bool,
    inflation_shock: bool,
    tp_pct: float,
    tp_val: float | None,
    f_val: float,
    f_bonus: float,
    bv_pct: float,
    v_pct: float,
    delta_y: float | None,
    calibrated: bool,
) -> list[str]:
    lines = [
        (
            f"TreasuryRegimeScore = {treasury_regime_score:.3f} → ação **{regime_action}** "
            "(quanto alocar em duration)."
        ),
        (
            f"Term premium: pct 5y = {tp_pct:.0%}"
            + (f", TP = {tp_val:.2f}" if tp_val is not None else "")
            + " — compensação primária por risco de duration."
        ),
        (
            f"Fed cut prob: {f_val:.0%}, F_bonus = {f_bonus:.2f} "
            "(bônus — oposto ao modelo Cash)."
        ),
        f"Bond vol proxy: pct 5y = {bv_pct:.0%} — penalidade de drawdown.",
    ]
    if delta_y is not None:
        lines.append(f"Δ yield real 20d (DFII10): {delta_y:.3f}.")
    if flight_to_quality:
        lines.append(
            f"Flight-to-quality ON (V pct {v_pct:.0%}, ΔY<0) → "
            f"piso Overweight (calculada: {action_calc})."
        )
    elif inflation_shock:
        lines.append(
            f"Inflation-shock ON (V pct {v_pct:.0%}, ΔY>0) → "
            f"teto Reduce (padrão 2022; calculada: {action_calc})."
        )
    else:
        lines.append(f"VIX pct {v_pct:.0%} — sem override dual de stress.")
    if not calibrated:
        lines.append("⚠ Pesos não calibrados (`calibrated: false`).")
    return lines


def backfill_treasury_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = get_fred_series("DFII10")
    if ref.empty:
        ref = _term_premium_series(_load_config().get("term_premium_fred", "ACMTP10"))
    if ref.empty:
        result = compute_treasury_regime(motor_as_of_date())
        persist_aba_score(result, estagio=result["estagio"])
        return 1

    as_of_cap = motor_as_of_date()
    eligible = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(as_of_cap)]
    dates = eligible[-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        result = compute_treasury_regime(d_date)
        persist_aba_score(result, estagio=result["estagio"])
        n += 1
    return n


def treasury_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    result = compute_treasury_regime(as_of)
    result["aba_id"] = aba_id
    return result


def sanity_check_inflation_shock_2022() -> dict[str, Any]:
    """Cheap validation: did inflation_shock fire during 2022 stress window?"""
    hits: list[dict[str, str]] = []
    start = dt.date(2022, 1, 1)
    end = dt.date(2022, 12, 31)
    ref = get_fred_series("DFII10")
    if ref.empty:
        return {"ok": False, "error": "no DFII10 history"}
    for d in ref.index:
        d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
        if d_date < start or d_date > end:
            continue
        r = compute_treasury_regime(d_date)
        if r.get("inflation_shock_flag"):
            hits.append({"date": d_date.isoformat(), "action": r.get("regime_action")})
    return {
        "ok": True,
        "period": "2022",
        "inflation_shock_days": len(hits),
        "sample": hits[:5],
        "passed": len(hits) > 0,
    }
