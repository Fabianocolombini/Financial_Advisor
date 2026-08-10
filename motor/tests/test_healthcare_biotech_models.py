"""Tests for healthcare / biotech class models."""

from __future__ import annotations

from motor.src.calculo.healthcare_biotech_security_score import compute_healthcare_biotech_security_batch
from motor.src.calculo.models.healthcare_biotech_regime_model import compute_healthcare_biotech_regime


def test_biotech_regime_returns_model_fields():
    result = compute_healthcare_biotech_regime()
    assert result["model"] == "healthcare_biotech_regime_v1"
    assert "healthcare_biotech_regime_score" in result


def test_biotech_security_batch():
    batch = compute_healthcare_biotech_security_batch(["IBB"], universe_tickers=["IBB", "XBI"])
    assert batch["IBB"]["model"] == "healthcare_biotech_security_v1"
