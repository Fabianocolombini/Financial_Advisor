"""Preferred securities class regime model — how much preferred to allocate (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import (
    compute_formula,
    get_fred_series,
    kre_vs_spy_60d_series,
    preferred_spread_series,
    sloos_forward_fill_series,
)
from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.models.cash_regime_model import (
    _action_from_score,
    _clip,
    _min_action,
    _percentile_0_1,
    _scalar_at,
    regime_action_to_estagio,
)
from motor.src.calculo.models.ig_regime_model import _delta_series, _z_at
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "preferred_regime.json"


def _load_config() -> dict[str, Any]:
    if not _CONFIG_PATH.is_file():
        return {
            "calibrated": False,
            "regime_weights": {
                "w1": 0.25,
                "w2": 0.20,
                "w3": 0.10,
                "w4": 0.15,
                "w5": 0.20,
                "w6": 0.10,
            },
            "thresholds": {"overweight": 0.65, "hold": 0.45, "reduce": 0.25},
            "percentile_window_days": 1260,
            "bank_z_window_days": 504,
            "delta_spread_days": 20,
            "bank_stress_z_threshold": -2.0,
            "fed_cut_cap": 0.6,
            "yield_10y_fred": "DGS10",
            "sloos_fred": "DRTSCILM",
        }
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def compute_preferred_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = _load_config()
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    bank_window = int(cfg.get("bank_z_window_days", 504))
    delta_days = int(cfg.get("delta_spread_days", 20))
    bank_z_thr = float(cfg.get("bank_stress_z_threshold", -2.0))
    fed_cap = float(cfg.get("fed_cut_cap", 0.6))
    weights = cfg.get("regime_weights", {})
    w1 = float(weights.get("w1", 0.25))
    w2 = float(weights.get("w2", 0.20))
    w3 = float(weights.get("w3", 0.10))
    w4 = float(weights.get("w4", 0.15))
    w5 = float(weights.get("w5", 0.20))
    w6 = float(weights.get("w6", 0.10))
    thresholds = cfg.get("thresholds", {})
    labels = cfg.get("action_labels", {})
    y10_fred = cfg.get("yield_10y_fred", "DGS10")
    sloos_fred = cfg.get("sloos_fred", "DRTSCILM")

    ps_series = preferred_spread_series()
    delta_ps_series = _delta_series(ps_series, delta_days)
    y10_series = get_fred_series(y10_fred)
    f_series = get_external_series("cme", "fed_cut_probability")
    bank_series = kre_vs_spy_60d_series()
    sloos_raw = get_fred_series(sloos_fred)
    sloos_series = sloos_forward_fill_series(sloos_fred)

    ps_pct, ps_val = _percentile_0_1(ps_series, as_of, window)
    delta_ps_z, delta_ps_val = _z_at(delta_ps_series, as_of, window)
    y10_pct, y10_val = _percentile_0_1(y10_series, as_of, window)
    y10_inv = 1.0 - y10_pct
    f_val = _scalar_at(f_series, as_of)
    if f_val is None:
        f_val = 0.5
    f_capped = min(_clip((f_val - 0.5) * 2.0, 0.0, 1.0), fed_cap)
    bank_z, bank_val = _z_at(bank_series, as_of, bank_window)
    sloos_pct, sloos_val = _percentile_0_1(sloos_series, as_of, window)

    sloos_ref_date = None
    if not sloos_raw.empty:
        cap = pd.Timestamp(as_of)
        truncated = sloos_raw.loc[pd.DatetimeIndex(pd.to_datetime(sloos_raw.index)) <= cap]
        if not truncated.empty:
            last_idx = truncated.index[-1]
            sloos_ref_date = (
                last_idx.date().isoformat()
                if hasattr(last_idx, "date")
                else str(last_idx)[:10]
            )

    delta_penalty = _clip(delta_ps_z, 0.0, 3.0) / 3.0
    bank_penalty = _clip(-bank_z, 0.0, 3.0) / 3.0

    preferred_regime_score = (
        w1 * ps_pct
        + w2 * y10_inv
        + w3 * f_capped
        - w4 * delta_penalty
        - w5 * bank_penalty
        - w6 * sloos_pct
    )

    bank_stress_flag = bank_z < bank_z_thr

    action_calc = _action_from_score(preferred_regime_score, thresholds, labels)
    regime_action = (
        _min_action(action_calc, labels.get("strong_reduce", "Strong Reduce"))
        if bank_stress_flag
        else action_calc
    )

    componentes = [
        {
            "id": "preferred_spread",
            "nome": "Preferred spread proxy (PS)",
            "valor": ps_val,
            "percentile_0_1": ps_pct,
            "peso": w1,
            "contribuicao": w1 * ps_pct,
            "role": "carry — PFF yield − DGS10 vs histórico 5y",
        },
        {
            "id": "yield_10y",
            "nome": "Yield nominal 10y (Y10)",
            "valor": y10_val,
            "percentile_0_1": y10_pct,
            "y10_inverted": y10_inv,
            "peso": w2,
            "contribuicao": w2 * y10_inv,
            "role": "contexto de taxas — invertido (taxas altas penalizam)",
        },
        {
            "id": "fed_cut_probability",
            "nome": "Fed cut probability 6m (F)",
            "valor": f_val,
            "f_capped": f_capped,
            "peso": w3,
            "contribuicao": w3 * f_capped,
            "role": "bônus capped — corte favorece preferred",
        },
        {
            "id": "delta_preferred_spread_20d",
            "nome": f"Δ preferred spread ({delta_days}d)",
            "valor": delta_ps_val,
            "z_score": delta_ps_z,
            "penalty_0_1": delta_penalty,
            "peso": w4,
            "contribuicao": -w4 * delta_penalty,
            "role": "widening rápido penaliza",
        },
        {
            "id": "kre_vs_spy_60d",
            "nome": "KRE vs SPY 60d (BANK)",
            "valor": bank_val,
            "z_score": bank_z,
            "penalty_0_1": bank_penalty,
            "peso": w5,
            "contribuicao": -w5 * bank_penalty,
            "role": "stress bancário — underperformance KRE penaliza",
        },
        {
            "id": "sloos",
            "nome": "SLOOS tightening (trimestral)",
            "valor": sloos_val,
            "percentile_0_1": sloos_pct,
            "reference_date": sloos_ref_date,
            "peso": w6,
            "contribuicao": -w6 * sloos_pct,
            "role": "aperto de crédito — forward-fill trimestral",
        },
    ]

    dominant = max(
        [c for c in componentes if c["peso"] > 0],
        key=lambda c: abs(c["contribuicao"]),
        default=None,
    )

    explanation = _build_explanation(
        preferred_regime_score=preferred_regime_score,
        regime_action=regime_action,
        action_calc=action_calc,
        bank_stress_flag=bank_stress_flag,
        ps_pct=ps_pct,
        ps_val=ps_val,
        y10_inv=y10_inv,
        f_capped=f_capped,
        delta_ps_z=delta_ps_z,
        bank_z=bank_z,
        sloos_pct=sloos_pct,
        sloos_ref_date=sloos_ref_date,
        calibrated=bool(cfg.get("calibrated", False)),
    )

    return {
        "aba_id": "fi_preferred",
        "nome": "Preferred Securities",
        "data": as_of.isoformat(),
        "preferred_regime_score": preferred_regime_score,
        "score_composto": preferred_regime_score,
        "regime_action": regime_action,
        "regime_action_calculated": action_calc,
        "bank_stress_flag": bank_stress_flag,
        "stress_flag": bank_stress_flag,
        "sloos_reference_date": sloos_ref_date,
        "estagio": regime_action_to_estagio(regime_action),
        "componentes": componentes,
        "indicador_dominante": dominant,
        "calibrated": bool(cfg.get("calibrated", False)),
        "calibration_note": cfg.get("note", ""),
        "model": "preferred_regime_v1",
        "explanation": explanation,
    }


def _build_explanation(
    *,
    preferred_regime_score: float,
    regime_action: str,
    action_calc: str,
    bank_stress_flag: bool,
    ps_pct: float,
    ps_val: float | None,
    y10_inv: float,
    f_capped: float,
    delta_ps_z: float,
    bank_z: float,
    sloos_pct: float,
    sloos_ref_date: str | None,
    calibrated: bool,
) -> list[str]:
    lines = [
        (
            f"PreferredRegimeScore = {preferred_regime_score:.3f} → ação **{regime_action}** "
            "(quanto alocar em preferred)."
        ),
        (
            f"Preferred spread: pct 5y = {ps_pct:.0%}"
            + (f", PS = {ps_val:.2f}" if ps_val is not None else "")
            + " — carry primário."
        ),
        f"Y10 inverted = {y10_inv:.0%}; F_capped = {f_capped:.2f}.",
        f"ΔPS z = {delta_ps_z:.2f}; BANK z = {bank_z:.2f}.",
        (
            f"SLOOS pct = {sloos_pct:.0%}"
            + (f" (ref trimestral: {sloos_ref_date})" if sloos_ref_date else "")
            + "."
        ),
    ]
    if bank_stress_flag:
        lines.append(
            f"Bank stress flag ON (BANK_z < −2) → "
            f"teto Strong Reduce (calculada: {action_calc})."
        )
    if not calibrated:
        lines.append("⚠ Pesos não calibrados (`calibrated: false`).")
    return lines


def backfill_preferred_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = preferred_spread_series()
    if ref.empty:
        ref = compute_formula("preferred_spread")
    if ref.empty:
        result = compute_preferred_regime(motor_as_of_date())
        persist_aba_score(result, estagio=result["estagio"])
        return 1

    as_of_cap = motor_as_of_date()
    eligible = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(as_of_cap)]
    dates = eligible[-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        result = compute_preferred_regime(d_date)
        persist_aba_score(result, estagio=result["estagio"])
        n += 1
    return n


def preferred_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    result = compute_preferred_regime(as_of)
    result["aba_id"] = aba_id
    return result


def sanity_check_bank_stress_march_2023() -> dict[str, Any]:
    """Cheap validation: bank_stress_flag during March 2023 SVB crisis."""
    hits: list[dict[str, str]] = []
    start = dt.date(2023, 3, 1)
    end = dt.date(2023, 3, 31)
    ref = kre_vs_spy_60d_series()
    if ref.empty:
        return {"ok": False, "error": "no KRE/SPY history"}
    for d in ref.index:
        d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
        if d_date < start or d_date > end:
            continue
        r = compute_preferred_regime(d_date)
        if r.get("bank_stress_flag"):
            hits.append({"date": d_date.isoformat(), "action": r.get("regime_action")})
    return {
        "ok": True,
        "period": "2023-03",
        "bank_stress_days": len(hits),
        "sample": hits[:5],
        "passed": len(hits) > 0,
    }
