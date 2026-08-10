"""BDC / alternative credit class regime model (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.models.cash_regime_model import _action_from_score, _clip, _min_action, _percentile_0_1
from motor.src.calculo.models.ig_regime_model import _z_at
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.regime_series import nav_premium_series, non_accrual_series, sofr_proxy_pct
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "bdc_regime.json"


def compute_bdc_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    na_thr = float(cfg.get("na_percentile_threshold", 0.85))
    nav_thr = float(cfg.get("nav_premium_threshold", 0.90))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4, w5 = [float(w.get(f"w{i}", 0.2)) for i in range(1, 6)]
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})

    sofr_pct, sofr_val = sofr_proxy_pct(as_of, window)
    nav = nav_premium_series("ARCC")
    nav_pct, nav_val = _percentile_0_1(nav, as_of, min(window, 756)) if not nav.empty else (0.5, None)
    nav_cheap = 1.0 - nav_pct
    na = non_accrual_series("ARCC")
    na_pct, na_val = _percentile_0_1(na, as_of, min(window, 756)) if not na.empty else (0.5, None)
    na_pen = _clip(na_pct, 0.0, 1.0)
    hy = get_fred_series("BAMLH0A0HYM2")
    hy_pct, hy_val = _percentile_0_1(hy, as_of, window)
    hy_pen = hy_pct
    nav_delta = nav.diff() if len(nav) > 1 else pd.Series(dtype=float)
    persist_z, persist_val = _z_at(nav_delta, as_of, min(window, 756)) if not nav_delta.empty else (0.0, None)
    persist_pen = _clip(persist_z, 0.0, 3.0) / 3.0

    score = w1 * sofr_pct + w2 * nav_cheap - w3 * persist_pen - w4 * hy_pen - w5 * na_pen
    action_calc = _action_from_score(score, thresholds, labels)
    credit_stress = na_pct > na_thr or nav_pct > nav_thr
    regime_action = _min_action(action_calc, labels.get("reduce", "Reduce")) if credit_stress else action_calc

    componentes = [
        {"id": "sofr_proxy", "nome": "SOFR proxy", "valor": sofr_val, "percentile_0_1": sofr_pct, "peso": w1, "contribuicao": w1 * sofr_pct, "role": "funding"},
        {"id": "nav_cheap", "nome": "NAV discount cheap", "valor": nav_val, "peso": w2, "contribuicao": w2 * nav_cheap, "role": "valuation", "is_proxy": True},
        {"id": "nav_persist_penalty", "nome": "NAV persistence penalty", "valor": persist_val, "z_score": persist_z, "peso": w3, "contribuicao": -w3 * persist_pen, "role": "NAV trend", "is_proxy": True},
        {"id": "hy_spread_penalty", "nome": "HY spread penalty", "valor": hy_val, "percentile_0_1": hy_pct, "peso": w4, "contribuicao": -w4 * hy_pen, "role": "credit context"},
        {"id": "non_accrual", "nome": "Non-accrual proxy", "valor": na_val, "percentile_0_1": na_pct, "peso": w5, "contribuicao": -w5 * na_pen, "role": "credit quality", "is_proxy": True},
    ]
    result = build_regime_result(
        aba_id="credito_alternativo", nome="Crédito Alternativo (BDC)", score=score,
        score_key="bdc_regime_score", regime_action=regime_action, action_calc=action_calc,
        componentes=componentes, model="bdc_regime_v1",
        explanation=[f"BDCRegimeScore = {score:.3f} → **{regime_action}**." + (" NAV/NA stress override." if credit_stress else "")],
        calibrated=bool(cfg.get("calibrated", False)), calibration_note=cfg.get("note", ""),
        stress_flag=credit_stress, extra={"bdc_credit_stress_flag": credit_stress, "nav_stress_flag": credit_stress},
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_bdc_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = get_fred_series("SOFR")
    if ref.empty:
        ref = get_fred_series("DFF")
    if ref.empty:
        r = compute_bdc_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_bdc_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def bdc_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_bdc_regime(as_of)
    r["aba_id"] = aba_id
    return r
