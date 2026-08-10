"""Tests for FX pace class models."""

from __future__ import annotations

from motor.src.calculo.fx_security_score import compute_fx_security_batch
from motor.src.calculo.models.fx_regime_model import compute_fx_regime
from motor.src.calculo.models.regime_result import pace_action_from_score


def test_fx_regime_returns_pace_fields():
    result = compute_fx_regime()
    assert result["model"] == "fx_regime_v1"
    assert result["output_type"] == "pace"
    assert "fx_regime_score" in result
    assert result["regime_action"] in {"Acelerar", "Ritmo base", "Desacelerar", "Pausar"}


def test_pace_action_thresholds():
    labels = {
        "accelerate": "Acelerar",
        "base": "Ritmo base",
        "decelerate": "Desacelerar",
        "pause": "Pausar",
    }
    thresholds = {"accelerate": 0.65, "base": 0.45, "decelerate": 0.25}
    assert pace_action_from_score(0.8, thresholds, labels) == "Acelerar"
    assert pace_action_from_score(0.5, thresholds, labels) == "Ritmo base"
    assert pace_action_from_score(0.1, thresholds, labels) == "Pausar"


def test_fx_security_batch():
    batch = compute_fx_security_batch(["UUP"], universe_tickers=["UUP", "FXE"])
    assert batch["UUP"]["model"] == "fx_security_v1"
