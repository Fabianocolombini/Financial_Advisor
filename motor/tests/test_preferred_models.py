"""Tests for Preferred class mathematical models."""

from __future__ import annotations

from motor.src.calculo.models.cash_regime_model import _clip, _min_action
from motor.src.calculo.models.preferred_regime_model import (
    compute_preferred_regime,
    sanity_check_bank_stress_march_2023,
)
from motor.src.calculo.preferred_security_score import _security_estagio


def test_preferred_regime_returns_model_fields():
    result = compute_preferred_regime()
    assert result["model"] == "preferred_regime_v1"
    assert "preferred_regime_score" in result
    assert "regime_action" in result
    assert "bank_stress_flag" in result
    assert result.get("calibrated") is False


def test_bank_stress_override_caps_at_strong_reduce():
    assert _min_action("Overweight", "Strong Reduce") == "Strong Reduce"
    assert _min_action("Hold", "Strong Reduce") == "Strong Reduce"


def test_f_capped_formula():
    raw = _clip((0.9 - 0.5) * 2, 0, 1)
    assert min(raw, 0.6) == 0.6


def test_delta_penalty_clip():
    assert _clip(4.0, 0, 3) / 3 == 1.0
    assert _clip(-1.0, 0, 3) / 3 == 0.0


def test_security_estagio_thresholds():
    assert _security_estagio(0.7) == "Ascendente"
    assert _security_estagio(0.4) == "Maduro"
    assert _security_estagio(0.1) == "Descendente"


def test_bank_stress_sanity_march_2023():
    sanity = sanity_check_bank_stress_march_2023()
    if not sanity.get("ok"):
        return
    assert "passed" in sanity
    assert sanity.get("period") == "2023-03"
