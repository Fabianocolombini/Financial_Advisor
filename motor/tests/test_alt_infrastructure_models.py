"""Tests for infrastructure class models."""

from __future__ import annotations

from motor.src.calculo.alt_infrastructure_security_score import compute_alt_infrastructure_security_batch
from motor.src.calculo.models.alt_infrastructure_regime_model import compute_alt_infrastructure_regime


def test_infra_regime_returns_model_fields():
    result = compute_alt_infrastructure_regime()
    assert result["model"] == "alt_infrastructure_regime_v1"
    assert "alt_infrastructure_regime_score" in result


def test_infra_security_batch():
    batch = compute_alt_infrastructure_security_batch(["IGF"], universe_tickers=["IGF", "IFRA"])
    assert batch["IGF"]["model"] == "alt_infrastructure_security_v1"
