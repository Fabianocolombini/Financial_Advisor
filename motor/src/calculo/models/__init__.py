"""Statistical overlay models for snapshot export."""

from __future__ import annotations

from motor.src.calculo.models.cash_regime_model import compute_cash_regime
from motor.src.calculo.models.treasury_regime_model import compute_treasury_regime
from motor.src.calculo.models.ewma_vol import compute_ewma_vol_forecasts
from motor.src.calculo.models.regime_model import compute_regime_risk


def build_models_snapshot() -> dict:
    regime = compute_regime_risk()
    ewma = compute_ewma_vol_forecasts()
    cash_regime = compute_cash_regime()
    treasury_regime = compute_treasury_regime()
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
        "treasury_regime": {
            "treasury_regime_score": treasury_regime.get("treasury_regime_score"),
            "regime_action": treasury_regime.get("regime_action"),
            "flight_to_quality_flag": treasury_regime.get("flight_to_quality_flag"),
            "inflation_shock_flag": treasury_regime.get("inflation_shock_flag"),
            "calibrated": treasury_regime.get("calibrated"),
            "calibration_note": treasury_regime.get("calibration_note"),
            "explanation": treasury_regime.get("explanation"),
        },
    }
