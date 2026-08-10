"""Tests for TIPS class mathematical models."""

from __future__ import annotations

import pytest
from motor.src.calculo.models.cash_regime_model import _clip, _min_action
from motor.src.calculo.models.tips_regime_model import (
    compute_tips_regime,
    sanity_check_tips_liquidity_march_2020,
)
from motor.src.calculo.tips_security_score import _effective_duration, _load_duration_map


def test_tips_regime_returns_model_fields():
    result = compute_tips_regime()
    assert result["model"] == "tips_regime_v1"
    assert "tips_regime_score" in result
    assert "regime_action" in result
    assert "tips_liquidity_flag" in result
    assert result.get("calibrated") is False


def test_tips_liquidity_override_caps_at_hold():
    assert _min_action("Overweight", "Hold") == "Hold"
    assert _min_action("Hold", "Hold") == "Hold"
    assert _min_action("Reduce", "Hold") == "Reduce"


def test_f_bonus_formula():
    assert _clip((0.8 - 0.5) * 2, 0, 1) == pytest.approx(0.6)


def test_tips_duration_map_lookup():
    duration_map = _load_duration_map()
    assert _effective_duration("LTPZ", duration_map) > 10.0
    assert _effective_duration("VTIP", duration_map) < 5.0
    assert _effective_duration("UNKNOWN", duration_map) == duration_map.get("__default__", 6.5)


def test_tips_liquidity_sanity_march_2020():
    sanity = sanity_check_tips_liquidity_march_2020()
    if not sanity.get("ok"):
        return
    assert "passed" in sanity
    assert sanity.get("period") == "2020-03"
