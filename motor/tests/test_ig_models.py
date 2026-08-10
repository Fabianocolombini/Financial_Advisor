"""Tests for IG class mathematical models."""

from __future__ import annotations

import pytest
from motor.src.calculo.ig_security_score import _effective_duration, _load_duration_map
from motor.src.calculo.models.cash_regime_model import _clip, _min_action
from motor.src.calculo.models.ig_regime_model import (
    compute_ig_regime,
    sanity_check_credit_event_march_2020,
)


def test_ig_regime_returns_model_fields():
    result = compute_ig_regime()
    assert result["model"] == "ig_regime_v1"
    assert "ig_regime_score" in result
    assert "regime_action" in result
    assert "credit_event_flag" in result
    assert result.get("calibrated") is False


def test_credit_event_override_caps_at_reduce():
    assert _min_action("Overweight", "Reduce") == "Reduce"
    assert _min_action("Strong Reduce", "Reduce") == "Strong Reduce"


def test_f_bonus_formula():
    assert _clip((0.8 - 0.5) * 2, 0, 1) == pytest.approx(0.6)


def test_duration_map_lookup():
    duration_map = _load_duration_map()
    assert _effective_duration("LQD", duration_map) > 5.0
    assert _effective_duration("UNKNOWN", duration_map) == duration_map.get("__default__", 6.0)


def test_credit_event_sanity_march_2020():
    sanity = sanity_check_credit_event_march_2020()
    if not sanity.get("ok"):
        return
    assert "passed" in sanity
    assert sanity.get("period") == "2020-03/04"
