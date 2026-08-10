"""REITs class regime model (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series, nareit_yield_spread_series
from motor.src.calculo.models.cash_regime_model import _action_from_score, _clip, _percentile_0_1
from motor.src.calculo.models.ig_regime_model import _z_at
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.regime_series import delta_nareit_spread_series, reit_valuation_cheap_pct, refi_stress_pct
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "reits_regime.json"


def compute_reits_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    delta_days = int(cfg.get("delta_spread_days", 20))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4, w5 = [float(w.get(f"w{i}", 0.2)) for i in range(1, 6)]
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})

    ns = nareit_yield_spread_series()
    ns_pct, ns_val = _percentile_0_1(ns, as_of, window)
    ry = get_fred_series("DFII10")
    ry_pct, ry_val = _percentile_0_1(ry, as_of, window)
    ry_low = 1.0 - ry_pct
    rv_cheap, rv_val = reit_valuation_cheap_pct(as_of, window)
    delta_ns = delta_nareit_spread_series(delta_days)
    delta_z, delta_val = _z_at(delta_ns, as_of, window)
    delta_pen = _clip(delta_z, 0.0, 3.0) / 3.0
    refi_pct, refi_val = refi_stress_pct(as_of, window)

    score = w1 * ns_pct + w2 * ry_low + w3 * rv_cheap - w4 * delta_pen - w5 * refi_pct
    action_calc = _action_from_score(score, thresholds, labels)

    componentes = [
        {"id": "nareit_spread", "nome": "Nareit yield spread", "valor": ns_val, "percentile_0_1": ns_pct, "peso": w1, "contribuicao": w1 * ns_pct, "role": "carry"},
        {"id": "real_yield_low", "nome": "Real yield low", "valor": ry_val, "peso": w2, "contribuicao": w2 * ry_low, "role": "rates"},
        {"id": "reit_valuation", "nome": "REIT valuation cheap", "valor": rv_val, "peso": w3, "contribuicao": w3 * rv_cheap, "role": "valuation", "is_proxy": True},
        {"id": "delta_ry_spread", "nome": f"Δ spread {delta_days}d", "valor": delta_val, "z_score": delta_z, "peso": w4, "contribuicao": -w4 * delta_pen, "role": "widening penalty"},
        {"id": "refi_stress", "nome": "Refi stress (10y)", "valor": refi_val, "percentile_0_1": refi_pct, "peso": w5, "contribuicao": -w5 * refi_pct, "role": "refinancing"},
    ]
    result = build_regime_result(
        aba_id="reits", nome="REITs", score=score, score_key="reits_regime_score",
        regime_action=action_calc, action_calc=action_calc, componentes=componentes,
        model="reits_regime_v1", explanation=[f"REITsRegimeScore = {score:.3f} → **{action_calc}**."],
        calibrated=bool(cfg.get("calibrated", False)), calibration_note=cfg.get("note", ""),
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_reits_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score
    ref = nareit_yield_spread_series()
    if ref.empty:
        r = compute_reits_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_reits_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def reits_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_reits_regime(as_of)
    r["aba_id"] = aba_id
    return r
