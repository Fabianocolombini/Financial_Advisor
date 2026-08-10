"""Energy MLP class regime model (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import distribution_yield_spread_series, get_fred_series
from motor.src.calculo.models.cash_regime_model import _action_from_score, _clip, _percentile_0_1
from motor.src.calculo.models.ig_regime_model import _z_at
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.regime_series import delta_dys_series
from motor.src.dates import motor_as_of_date
from motor.src.ingestao.yfinance_client import get_price_series
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "energy_mlp_regime.json"


def compute_energy_mlp_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    delta_days = int(cfg.get("delta_spread_days", 20))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4, w5 = [float(w.get(f"w{i}", 0.2)) for i in range(1, 6)]
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})

    dys = distribution_yield_spread_series()
    dys_pct, dys_val = _percentile_0_1(dys, as_of, window)
    y10 = get_fred_series("DGS10")
    y10_pct, y10_val = _percentile_0_1(y10, as_of, window)
    y10_low = 1.0 - y10_pct
    amlp = get_price_series("AMLP")
    vol_z, _ = _z_at(amlp.pct_change(), as_of, 63) if not amlp.empty else (0.0, None)
    vol_contrib = max(0.0, min(1.0, (vol_z + 2.0) / 4.0))
    wti = get_fred_series("DCOILWTICO")
    wti_pct, wti_val = _percentile_0_1(wti, as_of, window)
    wti_contrib = 0.5 * wti_pct
    delta_dys = delta_dys_series(delta_days)
    delta_z, delta_val = _z_at(delta_dys, as_of, window)
    delta_pen = _clip(delta_z, 0.0, 3.0) / 3.0

    score = w1 * dys_pct + w2 * y10_low + w3 * vol_contrib + w4 * wti_contrib - w5 * delta_pen
    action_calc = _action_from_score(score, thresholds, labels)

    componentes = [
        {"id": "distribution_yield_spread", "nome": "Distribution yield spread", "valor": dys_val, "percentile_0_1": dys_pct, "peso": w1, "contribuicao": w1 * dys_pct, "role": "carry"},
        {"id": "yield_10y_low", "nome": "10y yield low", "valor": y10_val, "peso": w2, "contribuicao": w2 * y10_low, "role": "rates"},
        {"id": "amlp_vol_z", "nome": "AMLP vol z", "z_score": vol_z, "peso": w3, "contribuicao": w3 * vol_contrib, "role": "vol regime"},
        {"id": "wti_spot", "nome": "WTI spot (×0.5)", "valor": wti_val, "peso": w4, "contribuicao": w4 * wti_contrib, "role": "commodity"},
        {"id": "delta_dys", "nome": f"Δ DYS {delta_days}d", "valor": delta_val, "z_score": delta_z, "peso": w5, "contribuicao": -w5 * delta_pen, "role": "spread widening penalty"},
    ]
    result = build_regime_result(
        aba_id="energy_mlp", nome="Energy MLP", score=score,
        score_key="energy_mlp_regime_score", regime_action=action_calc, action_calc=action_calc,
        componentes=componentes, model="energy_mlp_regime_v1",
        explanation=[f"MLPRegimeScore = {score:.3f} → **{action_calc}**."],
        calibrated=bool(cfg.get("calibrated", False)), calibration_note=cfg.get("note", ""),
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_energy_mlp_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = distribution_yield_spread_series()
    if ref.empty:
        r = compute_energy_mlp_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_energy_mlp_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def energy_mlp_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_energy_mlp_regime(as_of)
    r["aba_id"] = aba_id
    return r
