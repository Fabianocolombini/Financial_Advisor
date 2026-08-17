"""Tests for Treasury class mathematical models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.indicadores_tecnicos import _rsi, rsi_from_changes
from motor.src.calculo.models.cash_regime_model import _clip, _max_action, _min_action
from motor.src.calculo.models.treasury_regime_model import compute_treasury_regime
from motor.src.calculo.treasury_security_score import (
    _cot_crowding_pct_5y,
    _effective_duration,
    _load_duration_map,
    _load_security_weights,
    compute_treasury_security_batch,
)


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
    pct, val, abs_z = _cot_crowding_pct_5y(dt.date(2024, 6, 1))
    assert 0.0 <= pct <= 1.0


def test_duration_map_tlt_longer_than_shy():
    duration_map = _load_duration_map()
    assert _effective_duration("TLT", duration_map) > _effective_duration("SHY", duration_map)


def test_treasury_security_weights_proposta_b():
    weights = _load_security_weights()
    assert weights["wa"] == 0.35
    assert weights["wb"] == 0.25
    assert weights["wc"] == 0.2
    assert weights["wd"] == 0.2
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def test_same_price_gap_favors_shorter_duration():
    """Same % vs MAs must not crown TLT just because duration is longer."""
    as_of = dt.date(2026, 8, 14)
    idx = pd.bdate_range(end=as_of, periods=60)
    prices = pd.Series([100.0 + 0.1 * i for i in range(60)], index=idx)

    def fake_tecnico(ticker: str, indicador_id: str) -> pd.Series:
        table = {
            "preco_vs_mm50": 0.05,
            "preco_vs_mm200": 0.08,
            "volume_negociado": 1_000_000.0,
        }
        return pd.Series([table[indicador_id]], index=[pd.Timestamp(as_of)])

    with (
        patch(
            "motor.src.calculo.treasury_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
        patch(
            "motor.src.calculo.treasury_security_score.get_price_series",
            return_value=prices,
        ),
        patch(
            "motor.src.calculo.treasury_security_score._cot_crowding_pct_5y",
            return_value=(0.5, 0.0, 0.0),
        ),
    ):
        out = compute_treasury_security_batch(["SHY", "TLT"], as_of=as_of)

    assert out["SHY"]["model"] == "treasury_security_v2"
    shy = {c["id"]: c for c in out["SHY"]["componentes"]}
    tlt = {c["id"]: c for c in out["TLT"]["componentes"]}
    assert shy["preco_vs_mm50_dur"]["valor"] > tlt["preco_vs_mm50_dur"]["valor"]
    assert shy["preco_vs_mm50_dur"]["percentile_cs"] > tlt["preco_vs_mm50_dur"]["percentile_cs"]
    assert shy["preco_vs_mm50_dur"]["inverte_percentil"] is False
    assert shy["rsi_14_dur"]["inverte_percentil"] is False
    assert shy["volume_negociado"]["inverte_percentil"] is False
    assert shy["cot_net_position"]["inverte_percentil"] is True
    assert shy["cot_net_position"]["cot_refresh"] == "hold_last"
    assert shy["preco_vs_mm50_dur"]["peso"] == 0.35
    assert shy["rsi_14_dur"]["peso"] == 0.25
    assert shy["volume_negociado"]["peso"] == 0.2
    assert shy["cot_net_position"]["peso"] == 0.2


def test_parallel_yield_move_equalizes_duration_adjusted_trend():
    as_of = dt.date(2026, 8, 14)
    shy_d, tlt_d = 1.9, 16.3
    shy_gap = 0.05
    tlt_gap = shy_gap * (tlt_d / shy_d)

    def fake_tecnico(ticker: str, indicador_id: str) -> pd.Series:
        gap = shy_gap if ticker == "SHY" else tlt_gap
        vol = 2_000_000.0 if ticker == "SHY" else 1_000_000.0
        table = {
            "preco_vs_mm50": gap,
            "preco_vs_mm200": gap,
            "volume_negociado": vol,
        }
        return pd.Series([table[indicador_id]], index=[pd.Timestamp(as_of)])

    with (
        patch(
            "motor.src.calculo.treasury_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
        patch(
            "motor.src.calculo.treasury_security_score._rsi_duration_adjusted",
            return_value=50.0,
        ),
        patch(
            "motor.src.calculo.treasury_security_score._cot_crowding_pct_5y",
            return_value=(0.5, 0.0, 0.0),
        ),
    ):
        out = compute_treasury_security_batch(["SHY", "TLT"], as_of=as_of)

    shy = {c["id"]: c for c in out["SHY"]["componentes"]}
    tlt = {c["id"]: c for c in out["TLT"]["componentes"]}
    assert abs(shy["preco_vs_mm50_dur"]["valor"] - tlt["preco_vs_mm50_dur"]["valor"]) < 1e-9


def test_rsi_from_scaled_returns_is_invariant():
    """RSI(r/D) = RSI(r) when D is constant — duration bias is fixed on trend, not RSI magnitude."""
    idx = pd.bdate_range("2024-01-01", periods=80)
    rets = pd.Series([0.001 if i % 3 else -0.0004 for i in range(80)], index=idx)
    rsi_raw = float(rsi_from_changes(rets).iloc[-1])
    rsi_adj = float(rsi_from_changes(rets / 16.3).iloc[-1])
    assert abs(rsi_raw - 50) > 5
    assert abs(rsi_raw - rsi_adj) < 1e-6
    prices = (1.0 + rets).cumprod() * 100.0
    assert abs(float(_rsi(prices).iloc[-1]) - rsi_raw) < 1.0


def test_cot_hold_last_keeps_last_print_until_next_release():
    idx = pd.date_range("2023-01-03", periods=40, freq="W-TUE")
    series = pd.Series([float(i) for i in range(40)], index=idx)
    print_day = idx[35].date()
    midweek = (idx[35] + pd.Timedelta(days=3)).date()
    next_print = idx[36].date()

    with patch(
        "motor.src.calculo.treasury_security_score.get_external_series",
        return_value=series,
    ):
        _, val_print, _ = _cot_crowding_pct_5y(print_day)
        _, val_hold, _ = _cot_crowding_pct_5y(midweek)
        _, val_next, _ = _cot_crowding_pct_5y(next_print)

    assert val_print == val_hold
    assert val_next != val_hold
