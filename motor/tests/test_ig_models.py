"""Tests for IG class mathematical models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd
import pytest

from motor.src.calculo.ig_security_score import (
    _effective_duration,
    _load_duration_map,
    _load_security_weights,
    compute_ig_security_batch,
)
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


def test_ig_security_weights_keep_duration_fit_dominant():
    weights = _load_security_weights()
    assert weights["wa"] == 0.3
    assert weights["wb"] == 0.2
    assert weights["wc"] == 0.15
    assert weights["wd"] == 0.35
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def test_same_price_gap_favors_shorter_ig_duration():
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
            "motor.src.calculo.ig_security_score.get_tecnico_series",
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
            "motor.src.calculo.ig_security_score._term_premium_pct",
            return_value=0.5,
        ),
    ):
        out = compute_ig_security_batch(["VCSH", "IGLB"], as_of=as_of)

    assert out["VCSH"]["model"] == "ig_security_v2"
    short = {c["id"]: c for c in out["VCSH"]["componentes"]}
    long = {c["id"]: c for c in out["IGLB"]["componentes"]}
    assert short["preco_vs_mm50_dur"]["valor"] > long["preco_vs_mm50_dur"]["valor"]
    assert short["preco_vs_mm50_dur"]["percentile_cs"] > long["preco_vs_mm50_dur"]["percentile_cs"]
    assert short["preco_vs_mm50_dur"]["inverte_percentil"] is False
    assert short["rsi_14_dur"]["inverte_percentil"] is False
    assert short["volume_negociado"]["inverte_percentil"] is False
    assert short["duration_efetiva"]["inverte_percentil"] is False
    assert short["preco_vs_mm50_dur"]["peso"] == 0.3
    assert short["duration_efetiva"]["peso"] == 0.35


def test_duration_fit_is_bucket_not_issuer():
    """Same duration band → same fit, regardless of ticker name."""
    as_of = dt.date(2026, 8, 14)

    def fake_tecnico(ticker: str, indicador_id: str) -> pd.Series:
        vol = 2_000_000.0 if ticker == "LQD" else 1_000_000.0
        table = {
            "preco_vs_mm50": 0.01,
            "preco_vs_mm200": 0.01,
            "volume_negociado": vol,
        }
        return pd.Series([table[indicador_id]], index=[pd.Timestamp(as_of)])

    duration_map = {"LQD": 8.4, "USIG": 8.4, "VCSH": 2.7, "__default__": 6.0}

    with (
        patch(
            "motor.src.calculo.ig_security_score.get_tecnico_series",
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
            "motor.src.calculo.ig_security_score._load_duration_map",
            return_value=duration_map,
        ),
        patch(
            "motor.src.calculo.ig_security_score._term_premium_pct",
            return_value=1.0,
        ),
    ):
        out = compute_ig_security_batch(["LQD", "USIG", "VCSH"], as_of=as_of)

    lqd = {c["id"]: c for c in out["LQD"]["componentes"]}
    usig = {c["id"]: c for c in out["USIG"]["componentes"]}
    vcsh = {c["id"]: c for c in out["VCSH"]["componentes"]}
    assert lqd["duration_efetiva"]["dur_fit"] == usig["duration_efetiva"]["dur_fit"]
    assert lqd["duration_efetiva"]["dur_fit"] > vcsh["duration_efetiva"]["dur_fit"]
