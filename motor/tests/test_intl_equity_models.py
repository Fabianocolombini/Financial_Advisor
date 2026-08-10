"""Tests for international equity class models."""

from __future__ import annotations

from motor.src.calculo.intl_equity_security_score import compute_intl_equity_security_batch
from motor.src.calculo.models.intl_equity_regime_model import compute_intl_equity_regime


def test_intl_equity_regime_returns_model_fields():
    result = compute_intl_equity_regime()
    assert result["model"] == "intl_equity_regime_v1"
    assert "intl_equity_regime_score" in result
    assert result.get("calibrated") is False


def test_intl_equity_security_batch():
    batch = compute_intl_equity_security_batch(["EFA"], universe_tickers=["EFA", "VEA"])
    assert batch["EFA"]["model"] == "intl_equity_security_v1"
