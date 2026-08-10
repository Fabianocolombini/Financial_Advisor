"""Tests for energy commodities class models."""

from __future__ import annotations

from motor.src.calculo.commodities_energy_security_score import compute_commodities_energy_security_batch
from motor.src.calculo.models.commodities_energy_regime_model import compute_commodities_energy_regime


def test_energy_regime_returns_model_fields():
    result = compute_commodities_energy_regime()
    assert result["model"] == "commodities_energy_regime_v1"
    assert "commodities_energy_regime_score" in result


def test_energy_security_batch():
    batch = compute_commodities_energy_security_batch(["USO"], universe_tickers=["USO", "XLE"])
    assert batch["USO"]["model"] == "commodities_energy_security_v1"
