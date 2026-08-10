"""Tests for energy MLP class models."""

from __future__ import annotations

from motor.src.calculo.energy_mlp_security_score import compute_energy_mlp_security_batch
from motor.src.calculo.models.energy_mlp_regime_model import compute_energy_mlp_regime


def test_mlp_regime_returns_model_fields():
    result = compute_energy_mlp_regime()
    assert result["model"] == "energy_mlp_regime_v1"
    assert "energy_mlp_regime_score" in result


def test_mlp_security_batch():
    batch = compute_energy_mlp_security_batch(["AMLP"], universe_tickers=["AMLP", "MLPX"])
    assert batch["AMLP"]["model"] == "energy_mlp_security_v1"
