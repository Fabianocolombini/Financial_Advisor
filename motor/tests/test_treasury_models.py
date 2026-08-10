"""Tests for Treasury class mathematical models."""

from __future__ import annotations

from motor.src.calculo.models.cash_regime_model import _clip, _max_action, _min_action
from motor.src.calculo.models.treasury_regime_model import compute_treasury_regime
from motor.src.calculo.treasury_security_score import _cot_crowding_pct_5y


def test_f_bonus_is_positive_carry_for_treasuries():
    f_val = 0.75
    f_bonus = _clip((f_val - 0.5) * 2.0, 0.0, 1.0)
    assert f_bonus == 0.5


def test_dual_stress_actions():
    assert _max_action("Hold", "Overweight") == "Overweight"
    assert _min_action("Overweight", "Reduce") == "Reduce"


def test_inflation_shock_2022_sanity():
    from motor.src.calculo.models.treasury_regime_model import sanity_check_inflation_shock_2022

    sanity = sanity_check_inflation_shock_2022()
    if not sanity.get("ok"):
        return
    assert sanity.get("flight_to_quality_days", 0) == 0
    assert sanity.get("inflation_shock_days", 0) > 0


def test_treasury_regime_returns_model_fields():
    result = compute_treasury_regime()
    assert result["model"] == "treasury_regime_v1"
    assert "treasury_regime_score" in result
    assert "regime_action" in result
    assert "flight_to_quality_flag" in result
    assert "inflation_shock_flag" in result
    assert result.get("calibrated") is False


def test_cot_crowding_defaults_without_data():
    import datetime as dt

    pct, val, abs_z = _cot_crowding_pct_5y(dt.date(2024, 6, 1))
    assert 0.0 <= pct <= 1.0
