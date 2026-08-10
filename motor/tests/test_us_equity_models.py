"""Tests for US equity class models."""

from __future__ import annotations

from motor.src.calculo.models.cash_regime_model import _min_action
from motor.src.calculo.models.us_equity_regime_model import compute_us_equity_regime
from motor.src.calculo.us_equity_security_score import compute_us_equity_security_batch
from motor.src.calculo.security_score_helpers import security_estagio


def test_us_equity_regime_returns_model_fields():
    result = compute_us_equity_regime()
    assert result["model"] == "us_equity_regime_v1"
    assert "us_equity_regime_score" in result
    assert "regime_action" in result
    assert result.get("calibrated") is False
    assert result.get("output_type", "allocation") == "allocation"


def test_recession_warning_caps_at_reduce():
    assert _min_action("Overweight", "Reduce") == "Reduce"
    assert _min_action("Hold", "Reduce") == "Reduce"


def test_us_equity_security_batch_shape():
    batch = compute_us_equity_security_batch(["SPY"], universe_tickers=["SPY", "QQQ"])
    assert "SPY" in batch
    assert "security_score" in batch["SPY"]
    assert batch["SPY"]["model"] == "us_equity_security_v1"


def test_security_estagio_thresholds():
    assert security_estagio(0.7) == "Ascendente"
    assert security_estagio(0.4) == "Maduro"
