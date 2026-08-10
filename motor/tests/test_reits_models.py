"""Tests for REITs class models."""

from __future__ import annotations

from motor.src.calculo.models.reits_regime_model import compute_reits_regime
from motor.src.calculo.reits_security_score import compute_reits_security_batch


def test_reits_regime_returns_model_fields():
    result = compute_reits_regime()
    assert result["model"] == "reits_regime_v1"
    assert "reits_regime_score" in result


def test_reits_security_batch_no_rsi():
    batch = compute_reits_security_batch(["VNQ"], universe_tickers=["VNQ", "IYR"])
    assert batch["VNQ"]["model"] == "reits_security_v1"
