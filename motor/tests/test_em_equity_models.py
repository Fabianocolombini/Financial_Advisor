"""Tests for EM equity class models."""

from __future__ import annotations

from motor.src.calculo.em_equity_security_score import compute_em_equity_security_batch
from motor.src.calculo.models.cash_regime_model import _min_action
from motor.src.calculo.models.em_equity_regime_model import compute_em_equity_regime


def test_em_equity_regime_returns_model_fields():
    result = compute_em_equity_regime()
    assert result["model"] == "em_equity_regime_v1"
    assert "em_equity_regime_score" in result
    assert "em_stress_flag" in result


def test_em_stress_override_caps_strong_reduce():
    assert _min_action("Overweight", "Strong Reduce") == "Strong Reduce"


def test_em_equity_security_batch():
    batch = compute_em_equity_security_batch(["EEM"], universe_tickers=["EEM", "VWO"])
    assert batch["EEM"]["model"] == "em_equity_security_v1"
