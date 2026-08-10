"""Tests for Cash class mathematical models."""

from __future__ import annotations

import datetime as dt

import pandas as pd

from motor.src.calculo.cash_security_score import (
    _cross_sectional_percentile,
    _security_estagio,
)
from motor.src.calculo.models.cash_regime_model import (
    _action_from_score,
    _clip,
    _max_action,
    regime_action_to_estagio,
)


def test_clip_bounds():
    assert _clip(1.5, 0, 1) == 1.0
    assert _clip(-0.2, 0, 1) == 0.0
    assert _clip(0.4, 0, 1) == 0.4


def test_curve_signal_inverted_favors_cash():
    c_neg = -0.5
    c_signal = _clip((-c_neg + 2) / 4, 0, 1)
    assert c_signal > 0.5

    c_pos_high = 1.5
    c_signal_low = _clip((-c_pos_high + 2) / 4, 0, 1)
    assert c_signal_low < c_signal


def test_action_thresholds():
    thresholds = {"overweight": 0.65, "hold": 0.45, "reduce": 0.25}
    labels = {
        "overweight": "Overweight",
        "hold": "Hold",
        "reduce": "Reduce",
        "strong_reduce": "Strong Reduce",
    }
    assert _action_from_score(0.7, thresholds, labels) == "Overweight"
    assert _action_from_score(0.5, thresholds, labels) == "Hold"
    assert _action_from_score(0.3, thresholds, labels) == "Reduce"
    assert _action_from_score(0.1, thresholds, labels) == "Strong Reduce"


def test_stress_override_floor_hold():
    assert _max_action("Strong Reduce", "Hold") == "Hold"
    assert _max_action("Overweight", "Hold") == "Overweight"


def test_regime_action_to_estagio():
    assert regime_action_to_estagio("Overweight") == "Ascendente"
    assert regime_action_to_estagio("Strong Reduce") == "ForteDescendente"


def test_cross_sectional_percentile_ranking():
    values = {"A": 10.0, "B": 20.0, "C": 30.0}
    pct = _cross_sectional_percentile(values)
    assert pct["A"] == 0.0
    assert pct["C"] == 1.0
    assert pct["B"] == 0.5


def test_security_estagio_thresholds():
    assert _security_estagio(0.7) == "Ascendente"
    assert _security_estagio(0.4) == "Maduro"
    assert _security_estagio(0.1) == "Descendente"


def test_fed_penalty_formula():
    assert _clip((0.3 - 0.5) * 2, 0, 1) == 0.0
    assert abs(_clip((0.8 - 0.5) * 2, 0, 1) - 0.6) < 1e-9
    assert _clip((1.0 - 0.5) * 2, 0, 1) == 1.0


def test_percentile_monotonic_series():
    from motor.src.calculo.zscore import percentile_latest_detail

    idx = pd.date_range("2020-01-01", periods=300, freq="B")
    series = pd.Series(range(300), index=idx)
    pct, latest, _ = percentile_latest_detail(series, window=252)
    assert pct > 90
    assert latest == 299.0
