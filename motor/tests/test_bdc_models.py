"""Tests for BDC / alternative credit class models."""

from __future__ import annotations

from motor.src.calculo.bdc_security_score import compute_bdc_security_batch
from motor.src.calculo.models.bdc_regime_model import compute_bdc_regime
from motor.src.calculo.models.cash_regime_model import _min_action


def test_bdc_regime_returns_model_fields():
    result = compute_bdc_regime()
    assert result["model"] == "bdc_regime_v1"
    assert "bdc_regime_score" in result
    assert "bdc_credit_stress_flag" in result


def test_bdc_stress_override_caps_reduce():
    assert _min_action("Overweight", "Reduce") == "Reduce"


def test_bdc_security_batch():
    batch = compute_bdc_security_batch(["ARCC"], universe_tickers=["ARCC", "MAIN"])
    assert batch["ARCC"]["model"] == "bdc_security_v1"
