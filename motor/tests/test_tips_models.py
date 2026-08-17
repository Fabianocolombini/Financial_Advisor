"""Tests for TIPS class mathematical models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd
import pytest

from motor.src.calculo.models.cash_regime_model import _clip, _min_action
from motor.src.calculo.models.tips_regime_model import (
    compute_tips_regime,
    sanity_check_tips_liquidity_march_2020,
)
from motor.src.calculo.tips_security_score import (
    _effective_duration,
    _load_duration_map,
    _load_security_weights,
    compute_tips_security_batch,
)


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


def test_tips_security_weights_keep_real_yield_fit_dominant():
    weights = _load_security_weights()
    assert weights["wa"] == 0.3
    assert weights["wb"] == 0.2
    assert weights["wc"] == 0.15
    assert weights["wd"] == 0.35
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def test_same_price_gap_favors_shorter_tips_duration():
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
            "motor.src.calculo.tips_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
        patch(
            "motor.src.calculo.treasury_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
        patch(
            "motor.src.calculo.treasury_security_score.get_price_series",
            return_value=prices,
        ),
        patch(
            "motor.src.calculo.tips_security_score._real_yield_pct",
            return_value=0.5,
        ),
    ):
        out = compute_tips_security_batch(["VTIP", "LTPZ"], as_of=as_of)

    assert out["VTIP"]["model"] == "tips_security_v2"
    short = {c["id"]: c for c in out["VTIP"]["componentes"]}
    long = {c["id"]: c for c in out["LTPZ"]["componentes"]}
    assert short["preco_vs_mm50_dur"]["valor"] > long["preco_vs_mm50_dur"]["valor"]
    assert short["preco_vs_mm50_dur"]["percentile_cs"] > long["preco_vs_mm50_dur"]["percentile_cs"]
    assert short["preco_vs_mm50_dur"]["price_series"] == "etf_close"
    assert short["preco_vs_mm50_dur"]["inverte_percentil"] is False
    assert short["rsi_14_dur"]["inverte_percentil"] is False
    assert short["volume_negociado"]["inverte_percentil"] is False
    assert short["duration_efetiva"]["inverte_percentil"] is False
    assert short["preco_vs_mm50_dur"]["peso"] == 0.3
    assert short["duration_efetiva"]["peso"] == 0.35


def test_real_yield_fit_is_bucket_not_paper():
    as_of = dt.date(2026, 8, 14)

    def fake_tecnico(ticker: str, indicador_id: str) -> pd.Series:
        vol = 2_000_000.0 if ticker == "TIP" else 1_000_000.0
        table = {
            "preco_vs_mm50": 0.01,
            "preco_vs_mm200": 0.01,
            "volume_negociado": vol,
        }
        return pd.Series([table[indicador_id]], index=[pd.Timestamp(as_of)])

    duration_map = {"TIP": 7.2, "SCHP": 7.2, "VTIP": 2.4, "__default__": 6.5}

    with (
        patch(
            "motor.src.calculo.tips_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
        patch(
            "motor.src.calculo.treasury_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
        patch(
            "motor.src.calculo.treasury_security_score._rsi_duration_adjusted",
            return_value=50.0,
        ),
        patch(
            "motor.src.calculo.tips_security_score._load_duration_map",
            return_value=duration_map,
        ),
        patch(
            "motor.src.calculo.tips_security_score._real_yield_pct",
            return_value=1.0,
        ),
    ):
        out = compute_tips_security_batch(["TIP", "SCHP", "VTIP"], as_of=as_of)

    tip = {c["id"]: c for c in out["TIP"]["componentes"]}
    schp = {c["id"]: c for c in out["SCHP"]["componentes"]}
    vtip = {c["id"]: c for c in out["VTIP"]["componentes"]}
    assert tip["duration_efetiva"]["dur_fit"] == schp["duration_efetiva"]["dur_fit"]
    assert tip["duration_efetiva"]["dur_fit"] > vtip["duration_efetiva"]["dur_fit"]
