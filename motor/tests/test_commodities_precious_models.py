"""Tests for precious metals class models."""

from __future__ import annotations

from motor.src.calculo.commodities_precious_security_score import compute_commodities_precious_security_batch
from motor.src.calculo.models.commodities_precious_regime_model import compute_commodities_precious_regime


def test_precious_regime_returns_model_fields():
    result = compute_commodities_precious_regime()
    assert result["model"] == "commodities_precious_regime_v1"
    assert "commodities_precious_regime_score" in result


def test_precious_security_batch():
    batch = compute_commodities_precious_security_batch(["GLD"], universe_tickers=["GLD", "IAU"])
    assert batch["GLD"]["model"] == "commodities_precious_security_v1"
