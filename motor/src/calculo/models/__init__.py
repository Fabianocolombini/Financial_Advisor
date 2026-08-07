"""Statistical overlay models for snapshot export."""

from __future__ import annotations

from motor.src.calculo.models.ewma_vol import compute_ewma_vol_forecasts
from motor.src.calculo.models.regime_model import compute_regime_risk


def build_models_snapshot() -> dict:
    regime = compute_regime_risk()
    ewma = compute_ewma_vol_forecasts()
    return {
        "regime": regime,
        "ewma_vol": ewma,
    }
