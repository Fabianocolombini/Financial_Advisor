"""Energy commodities regime model (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.models.cash_regime_model import _action_from_score, _clip, _percentile_0_1
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.regime_series import (
    crude_backwardation_proxy,
    energy_crowding_z,
    inventory_tightness_pct,
    rig_discount_proxy,
)
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "commodities_energy_regime.json"


def compute_commodities_energy_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4, w5 = [float(w.get(f"w{i}", 0.2)) for i in range(1, 6)]
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})

    curve_back, _ = crude_backwardation_proxy(as_of, window)
    inv_tight, _ = inventory_tightness_pct(as_of, window)
    rig_disc, _ = rig_discount_proxy(as_of, window)
    wti = get_fred_series("DCOILWTICO")
    spot_pct, spot_val = _percentile_0_1(wti, as_of, window)
    spot_contrib = 0.5 * spot_pct
    crowd_z, _ = energy_crowding_z(as_of, window)
    crowd_pen = _clip(crowd_z, 0.0, 3.0) / 3.0

    score = w1 * curve_back + w2 * inv_tight + w3 * rig_disc + w4 * spot_contrib - w5 * crowd_pen
    action_calc = _action_from_score(score, thresholds, labels)

    componentes = [
        {"id": "curve_backwardation", "nome": "Curve backwardation proxy", "peso": w1, "contribuicao": w1 * curve_back, "role": "term structure", "is_proxy": True},
        {"id": "inventory_tight", "nome": "Inventory tightness", "peso": w2, "contribuicao": w2 * inv_tight, "role": "supply"},
        {"id": "rig_discount", "nome": "Rig/capex discount", "peso": w3, "contribuicao": w3 * rig_disc, "role": "capex cycle", "is_proxy": True},
        {"id": "spot_wti", "nome": "WTI spot (×0.5)", "valor": spot_val, "peso": w4, "contribuicao": w4 * spot_contrib, "role": "price momentum"},
        {"id": "crowding", "nome": "COT crowding", "z_score": crowd_z, "peso": w5, "contribuicao": -w5 * crowd_pen, "role": "positioning"},
    ]
    result = build_regime_result(
        aba_id="commodities_energy", nome="Energia", score=score,
        score_key="commodities_energy_regime_score", regime_action=action_calc, action_calc=action_calc,
        componentes=componentes, model="commodities_energy_regime_v1",
        explanation=[f"EnergyRegimeScore = {score:.3f} → **{action_calc}**."],
        calibrated=bool(cfg.get("calibrated", False)),
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_commodities_energy_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score
    ref = get_fred_series("DCOILWTICO")
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:] if not ref.empty else []
    if not len(dates):
        r = compute_commodities_energy_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_commodities_energy_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def commodities_energy_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_commodities_energy_regime(as_of)
    r["aba_id"] = aba_id
    return r
