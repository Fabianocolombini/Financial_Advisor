"""Tests for Cash class mathematical models."""

from __future__ import annotations

import datetime as dt

import pandas as pd

from motor.src.calculo.cash_security_score import (
    _cross_sectional_percentile,
    _directed_percentile,
    _load_security_weights,
    _security_estagio,
    compute_cash_security_batch,
)
from motor.src.calculo.indicadores_tecnicos import mm50_distance_zscore
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


def test_directed_percentile_inverts_raw_rank():
    values = {"A": 0.01, "B": 0.02, "C": 0.03}
    pct = _directed_percentile(values, invert=True)
    assert pct["A"] == 1.0
    assert pct["C"] == 0.0
    assert pct["B"] == 0.5
    direct = _directed_percentile(values, invert=False)
    assert direct["A"] == 0.0
    assert direct["C"] == 1.0


def test_security_weights_proposta_a():
    w = _load_security_weights()
    assert w["wa"] == 0.5
    assert w["wb"] == 0.35
    assert w["wc"] == 0.15
    assert abs(w["wa"] + w["wb"] + w["wc"] - 1.0) < 1e-9


def test_mm50_zscore_spike_larger_than_drift():
    idx = pd.date_range("2024-01-01", periods=80, freq="B")
    drift = pd.Series([100.0 + 0.01 * i for i in range(80)], index=idx)
    spiked = drift.copy()
    spiked.iloc[-1] = spiked.iloc[-2] + 2.0
    z_drift = float(mm50_distance_zscore(drift).iloc[-1])
    z_spike = float(mm50_distance_zscore(spiked).iloc[-1])
    assert abs(z_spike) > abs(z_drift) * 3


def test_cash_security_prefers_liquid_stable_on_mean():
    as_of = dt.date(2026, 8, 14)

    def fake_tecnico(ticker: str, indicador_id: str) -> pd.Series:
        table = {
            ("AAA", "volume_negociado"): 1.0,
            ("BBB", "volume_negociado"): 0.0,
            ("AAA", "vol_realizada"): 0.01,
            ("BBB", "vol_realizada"): 0.05,
            ("AAA", "preco_vs_mm50_z_abs"): 0.2,
            ("BBB", "preco_vs_mm50_z_abs"): 2.0,
        }
        val = table[(ticker, indicador_id)]
        return pd.Series([val], index=[as_of])

    from unittest.mock import patch

    with patch(
        "motor.src.calculo.cash_security_score.get_tecnico_series",
        side_effect=fake_tecnico,
    ):
        out = compute_cash_security_batch(["AAA", "BBB"], as_of=as_of)

    assert out["AAA"]["security_score"] == 1.0
    assert out["BBB"]["security_score"] == 0.0
    assert out["AAA"]["model"] == "cash_security_v3"
    by_id = {c["id"]: c for c in out["AAA"]["componentes"]}
    assert by_id["volume_negociado"]["inverte_percentil"] is False
    assert by_id["vol_realizada"]["inverte_percentil"] is True
    assert by_id["preco_vs_mm50_z_abs"]["inverte_percentil"] is True
    assert by_id["volume_negociado"]["peso"] == 0.5
    assert by_id["vol_realizada"]["peso"] == 0.35
    assert by_id["preco_vs_mm50_z_abs"]["peso"] == 0.15


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
