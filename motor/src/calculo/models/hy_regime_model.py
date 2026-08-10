"""High yield class regime model — how much HY to allocate (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.models.cash_regime_model import (
    _action_from_score,
    _clip,
    _min_action,
    _percentile_0_1,
    _scalar_at,
    regime_action_to_estagio,
)
from motor.src.calculo.models.ig_regime_model import _delta_series, _z_at
from motor.src.calculo.proxy_indicators import compute_proxy_series
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "hy_regime.json"


def _load_config() -> dict[str, Any]:
    if not _CONFIG_PATH.is_file():
        return {
            "calibrated": False,
            "regime_weights": {"w1": 0.35, "w2": 0.30, "w3": 0.20, "w4": 0.15},
            "thresholds": {"overweight": 0.65, "hold": 0.45, "reduce": 0.25},
            "stress_percentile": 0.80,
            "percentile_window_days": 1260,
            "delta_spread_days": 20,
            "hy_stress_delta_z_threshold": 1.5,
            "hy_oas_fred": "BAMLH0A0HYM2",
            "hy_ccc_fred": "BAMLH0A3HYC",
        }
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def _quality_ratio_series(hy_fred: str, ccc_fred: str) -> pd.Series:
    h = get_fred_series(hy_fred)
    cc = get_fred_series(ccc_fred)
    if h.empty or cc.empty:
        return pd.Series(dtype=float)
    combined = pd.concat([cc, h], axis=1, join="inner")
    combined.columns = ["cc", "h"]
    combined = combined.dropna()
    if combined.empty:
        return pd.Series(dtype=float)
    ratio = combined["cc"] / combined["h"].replace(0, pd.NA)
    return ratio.dropna()


def compute_hy_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = _load_config()
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    delta_days = int(cfg.get("delta_spread_days", 20))
    stress_thr = float(cfg.get("stress_percentile", 0.80))
    delta_z_thr = float(cfg.get("hy_stress_delta_z_threshold", 1.5))
    weights = cfg.get("regime_weights", {})
    w1 = float(weights.get("w1", 0.35))
    w2 = float(weights.get("w2", 0.30))
    w3 = float(weights.get("w3", 0.20))
    w4 = float(weights.get("w4", 0.15))
    thresholds = cfg.get("thresholds", {})
    labels = cfg.get("action_labels", {})
    hy_fred = cfg.get("hy_oas_fred", "BAMLH0A0HYM2")
    ccc_fred = cfg.get("hy_ccc_fred", "BAMLH0A3HYC")

    h_series = get_fred_series(hy_fred)
    r_series = _quality_ratio_series(hy_fred, ccc_fred)
    d_series = compute_proxy_series("hy_distress_proxy_score")
    v_series = get_fred_series("VIXCLS")
    delta_h_series = _delta_series(h_series, delta_days)

    h_pct, h_val = _percentile_0_1(h_series, as_of, window)
    r_pct, r_val = _percentile_0_1(r_series, as_of, window)
    d_pct, d_val = _percentile_0_1(d_series, as_of, window)
    v_pct, v_val = _percentile_0_1(v_series, as_of, window)
    delta_h_z, delta_h_val = _z_at(delta_h_series, as_of, window)

    delta_penalty = _clip(delta_h_z, 0.0, 3.0) / 3.0
    hy_regime_score = w1 * h_pct - w2 * delta_penalty - w3 * r_pct - w4 * d_pct

    hy_stress_flag = delta_h_z > delta_z_thr and v_pct > stress_thr

    action_calc = _action_from_score(hy_regime_score, thresholds, labels)
    regime_action = (
        _min_action(action_calc, labels.get("strong_reduce", "Strong Reduce"))
        if hy_stress_flag
        else action_calc
    )

    componentes = [
        {
            "id": "hy_oas",
            "nome": "Spread OAS HY (H)",
            "valor": h_val,
            "percentile_0_1": h_pct,
            "peso": w1,
            "contribuicao": w1 * h_pct,
            "role": "carry — spread HY vs histórico 5y",
        },
        {
            "id": "delta_hy_spread_20d",
            "nome": f"Δ spread HY ({delta_days}d)",
            "valor": delta_h_val,
            "z_score": delta_h_z,
            "penalty_0_1": delta_penalty,
            "peso": w2,
            "contribuicao": -w2 * delta_penalty,
            "role": "widening rápido penaliza",
        },
        {
            "id": "hy_quality_ratio",
            "nome": "CCC/HY quality ratio (R)",
            "valor": r_val,
            "percentile_0_1": r_pct,
            "peso": w3,
            "contribuicao": -w3 * r_pct,
            "role": "deterioração de qualidade no universo HY",
        },
        {
            "id": "hy_distress_proxy_score",
            "nome": "HY distress proxy (D)",
            "valor": d_val,
            "percentile_0_1": d_pct,
            "peso": w4,
            "contribuicao": -w4 * d_pct,
            "role": "proxy CCC OAS + vol HYG",
        },
        {
            "id": "vix",
            "nome": "VIX (V)",
            "valor": v_val,
            "percentile_0_1": v_pct,
            "peso": 0.0,
            "contribuicao": 0.0,
            "role": "stress override com ΔH_z",
        },
    ]

    dominant = max(
        [c for c in componentes if c["peso"] > 0],
        key=lambda c: abs(c["contribuicao"]),
        default=None,
    )

    explanation = _build_explanation(
        hy_regime_score=hy_regime_score,
        regime_action=regime_action,
        action_calc=action_calc,
        hy_stress_flag=hy_stress_flag,
        h_pct=h_pct,
        h_val=h_val,
        delta_h_z=delta_h_z,
        r_pct=r_pct,
        d_pct=d_pct,
        v_pct=v_pct,
        calibrated=bool(cfg.get("calibrated", False)),
    )

    return {
        "aba_id": "fi_hy",
        "nome": "High Yield Corporativo",
        "data": as_of.isoformat(),
        "hy_regime_score": hy_regime_score,
        "score_composto": hy_regime_score,
        "regime_action": regime_action,
        "regime_action_calculated": action_calc,
        "hy_stress_flag": hy_stress_flag,
        "stress_flag": hy_stress_flag,
        "estagio": regime_action_to_estagio(regime_action),
        "componentes": componentes,
        "indicador_dominante": dominant,
        "calibrated": bool(cfg.get("calibrated", False)),
        "calibration_note": cfg.get("note", ""),
        "model": "hy_regime_v1",
        "explanation": explanation,
    }


def _build_explanation(
    *,
    hy_regime_score: float,
    regime_action: str,
    action_calc: str,
    hy_stress_flag: bool,
    h_pct: float,
    h_val: float | None,
    delta_h_z: float,
    r_pct: float,
    d_pct: float,
    v_pct: float,
    calibrated: bool,
) -> list[str]:
    lines = [
        (
            f"HYRegimeScore = {hy_regime_score:.3f} → ação **{regime_action}** "
            "(quanto alocar em HY)."
        ),
        (
            f"Spread HY OAS: pct 5y = {h_pct:.0%}"
            + (f", H = {h_val:.2f}" if h_val is not None else "")
            + " — carry primário."
        ),
        f"ΔH z-score 20d = {delta_h_z:.2f}; quality ratio pct = {r_pct:.0%}.",
        f"Distress proxy pct = {d_pct:.0%}; VIX pct = {v_pct:.0%}.",
        "Sem fed_cut_probability — modelo HY não usa F.",
    ]
    if hy_stress_flag:
        lines.append(
            f"HY stress flag ON (ΔH_z > 1.5 e V pct > 80%) → "
            f"teto Strong Reduce (calculada: {action_calc})."
        )
    if not calibrated:
        lines.append("⚠ Pesos não calibrados (`calibrated: false`).")
    return lines


def backfill_hy_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = get_fred_series(_load_config().get("hy_oas_fred", "BAMLH0A0HYM2"))
    if ref.empty:
        result = compute_hy_regime(motor_as_of_date())
        persist_aba_score(result, estagio=result["estagio"])
        return 1

    as_of_cap = motor_as_of_date()
    eligible = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(as_of_cap)]
    dates = eligible[-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        result = compute_hy_regime(d_date)
        persist_aba_score(result, estagio=result["estagio"])
        n += 1
    return n


def hy_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    result = compute_hy_regime(as_of)
    result["aba_id"] = aba_id
    return result


def sanity_check_hy_stress_march_2020() -> dict[str, Any]:
    """Cheap validation: hy_stress_flag during March 2020."""
    hits: list[dict[str, str]] = []
    start = dt.date(2020, 3, 1)
    end = dt.date(2020, 3, 31)
    hy_fred = _load_config().get("hy_oas_fred", "BAMLH0A0HYM2")
    ref = get_fred_series(hy_fred)
    if ref.empty:
        return {"ok": False, "error": "no HY OAS history"}
    earliest = pd.Timestamp(ref.index.min()).date()
    if earliest > start:
        return {
            "ok": False,
            "error": f"HY OAS desde {earliest}, precisa {start} (FRED ICE/BofA: janela ~3y)",
            "history_start": earliest.isoformat(),
        }
    for d in ref.index:
        d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
        if d_date < start or d_date > end:
            continue
        r = compute_hy_regime(d_date)
        if r.get("hy_stress_flag"):
            hits.append({"date": d_date.isoformat(), "action": r.get("regime_action")})
    return {
        "ok": True,
        "period": "2020-03",
        "hy_stress_days": len(hits),
        "sample": hits[:5],
        "passed": len(hits) > 0,
    }


def sanity_check_hy_stress_h2_2008() -> dict[str, Any]:
    """Cheap validation: hy_stress_flag during H2 2008 GFC."""
    hits: list[dict[str, str]] = []
    start = dt.date(2008, 7, 1)
    end = dt.date(2008, 12, 31)
    ref = get_fred_series(_load_config().get("hy_oas_fred", "BAMLH0A0HYM2"))
    if ref.empty:
        return {"ok": False, "error": "no HY OAS history"}
    for d in ref.index:
        d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
        if d_date < start or d_date > end:
            continue
        r = compute_hy_regime(d_date)
        if r.get("hy_stress_flag"):
            hits.append({"date": d_date.isoformat(), "action": r.get("regime_action")})
    return {
        "ok": True,
        "period": "2008-H2",
        "hy_stress_days": len(hits),
        "sample": hits[:5],
        "passed": len(hits) > 0,
    }
