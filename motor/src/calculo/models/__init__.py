"""Statistical overlay models for snapshot export."""

from __future__ import annotations

from motor.src.calculo.models.cash_regime_model import compute_cash_regime
from motor.src.calculo.models.ewma_vol import compute_ewma_vol_forecasts
from motor.src.calculo.models.regime_model import compute_regime_risk


def build_models_snapshot() -> dict:
    regime = compute_regime_risk()
    ewma = compute_ewma_vol_forecasts()
    cash_regime = compute_cash_regime()
    return {
        "regime": regime,
        "ewma_vol": ewma,
        "cash_regime": {
            "cash_regime_score": cash_regime.get("cash_regime_score"),
            "regime_action": cash_regime.get("regime_action"),
            "stress_flag": cash_regime.get("stress_flag"),
            "calibrated": cash_regime.get("calibrated"),
            "calibration_note": cash_regime.get("calibration_note"),
            "explanation": cash_regime.get("explanation"),
        },
    }
