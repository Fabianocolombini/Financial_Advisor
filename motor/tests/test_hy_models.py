"""Tests for HY class mathematical models."""

from __future__ import annotations

from motor.src.calculo.hy_security_score import _security_estagio
from motor.src.calculo.models.cash_regime_model import _clip, _min_action
from motor.src.calculo.models.hy_regime_model import (
    compute_hy_regime,
    sanity_check_hy_stress_h2_2008,
    sanity_check_hy_stress_march_2020,
)


def test_hy_regime_returns_model_fields():
    result = compute_hy_regime()
    assert result["model"] == "hy_regime_v1"
    assert "hy_regime_score" in result
    assert "regime_action" in result
    assert "hy_stress_flag" in result
    assert result.get("calibrated") is False


def test_hy_stress_override_caps_at_strong_reduce():
    assert _min_action("Overweight", "Strong Reduce") == "Strong Reduce"
    assert _min_action("Hold", "Strong Reduce") == "Strong Reduce"


def test_delta_penalty_clip():
    assert _clip(4.0, 0, 3) / 3 == 1.0
    assert _clip(-1.0, 0, 3) / 3 == 0.0


def test_security_estagio_thresholds():
    assert _security_estagio(0.7) == "Ascendente"
    assert _security_estagio(0.4) == "Maduro"
    assert _security_estagio(0.1) == "Descendente"


def test_hy_stress_sanity_march_2020():
    sanity = sanity_check_hy_stress_march_2020()
    if not sanity.get("ok"):
        return
    assert "passed" in sanity
    assert sanity.get("period") == "2020-03"


def test_hy_stress_sanity_h2_2008():
    sanity = sanity_check_hy_stress_h2_2008()
    if not sanity.get("ok"):
        return
    assert "passed" in sanity
    assert sanity.get("period") == "2008-H2"
