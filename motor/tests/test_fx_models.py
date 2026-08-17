"""Tests for FX pace class models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

from motor.src.calculo.fx_security_score import (
    _as_percent,
    _load_security_weights,
    compute_fx_security_batch,
)
from motor.src.calculo.models.fx_regime_model import compute_fx_regime
from motor.src.calculo.models.regime_result import pace_action_from_score


def test_fx_regime_returns_pace_fields():
    result = compute_fx_regime()
    assert result["model"] == "fx_regime_v1"
    assert result["output_type"] == "pace"
    assert "fx_regime_score" in result
    assert result["regime_action"] in {"Acelerar", "Ritmo base", "Desacelerar", "Pausar"}


def test_pace_action_thresholds():
    labels = {
        "accelerate": "Acelerar",
        "base": "Ritmo base",
        "decelerate": "Desacelerar",
        "pause": "Pausar",
    }
    thresholds = {"accelerate": 0.65, "base": 0.45, "decelerate": 0.25}
    assert pace_action_from_score(0.8, thresholds, labels) == "Acelerar"
    assert pace_action_from_score(0.5, thresholds, labels) == "Ritmo base"
    assert pace_action_from_score(0.1, thresholds, labels) == "Pausar"


def test_as_percent_aligns_ecb_and_fed_units():
    assert _as_percent(4.33) == 4.33
    assert abs(_as_percent(0.0375) - 3.75) < 1e-9


def test_fx_security_weights():
    weights = _load_security_weights()
    assert weights["wa"] == 0.2
    assert weights["wb"] == 0.2
    assert weights["wc"] == 0.15
    assert weights["wd"] == 0.3
    assert weights["we"] == 0.15
    assert abs(sum(weights.values()) - 1.0) < 1e-9


def test_fx_v2_inverts_expense_and_te_ranks_carry_drops_trend():
    as_of = dt.date(2026, 8, 14)

    def fake_er(ticker: str) -> float:
        return 0.002 if ticker == "FXE" else 0.008

    def fake_vol(ticker: str, _as_of) -> float:
        return 8_000_000.0 if ticker == "FXE" else 1_000_000.0

    def fake_beta(ticker: str, benchmark: str, window: int = 63, as_of=None) -> float:
        return 0.8 if ticker == "FXE" else -0.8

    def fake_carry(ticker: str, _as_of):
        return 1.5 if ticker == "FXE" else -2.0

    def fake_te(ticker: str, _as_of):
        return 0.01 if ticker == "FXE" else 0.06

    with (
        patch(
            "motor.src.calculo.fx_security_score.expense_ratio_value",
            side_effect=fake_er,
        ),
        patch(
            "motor.src.calculo.fx_security_score._dollar_volume",
            side_effect=fake_vol,
        ),
        patch(
            "motor.src.calculo.fx_security_score.rolling_beta",
            side_effect=fake_beta,
        ),
        patch(
            "motor.src.calculo.fx_security_score._fx_carry",
            side_effect=fake_carry,
        ),
        patch(
            "motor.src.calculo.fx_security_score._tracking_error",
            side_effect=fake_te,
        ),
    ):
        out = compute_fx_security_batch(["FXE", "UUP"], as_of=as_of)

    assert out["FXE"]["model"] == "fx_security_v2"
    fxe = {c["id"]: c for c in out["FXE"]["componentes"]}
    uup = {c["id"]: c for c in out["UUP"]["componentes"]}
    ids = set(fxe)
    assert "rsi_14" not in ids
    assert "preco_vs_mm50" not in ids
    assert fxe["expense_ratio"]["inverte_percentil"] is True
    assert fxe["tracking_error"]["inverte_percentil"] is True
    assert fxe["fx_carry"]["inverte_percentil"] is False
    assert fxe["dollar_fit"]["tipo_metrica"] == "distancia_ao_alvo"
    assert fxe["expense_ratio"]["peso"] == 0.2
    assert fxe["fx_carry"]["peso"] == 0.3
    assert fxe["expense_ratio"]["percentile_cs"] > uup["expense_ratio"]["percentile_cs"]
    assert fxe["fx_carry"]["percentile_cs"] > uup["fx_carry"]["percentile_cs"]
    assert fxe["tracking_error"]["percentile_cs"] > uup["tracking_error"]["percentile_cs"]
    assert fxe["volume_dolar"]["percentile_cs"] > uup["volume_dolar"]["percentile_cs"]
    # same |beta| → same dollar fit
    assert fxe["dollar_fit"]["percentile_cs"] == uup["dollar_fit"]["percentile_cs"]
    assert out["FXE"]["security_score"] > out["UUP"]["security_score"]


def test_fx_missing_spot_sits_at_median_on_tracking_error():
    as_of = dt.date(2026, 8, 14)

    def fake_te(ticker: str, _as_of):
        return None if ticker == "CEW" else 0.02

    with (
        patch(
            "motor.src.calculo.fx_security_score.expense_ratio_value",
            return_value=0.004,
        ),
        patch(
            "motor.src.calculo.fx_security_score._dollar_volume",
            return_value=2_000_000.0,
        ),
        patch(
            "motor.src.calculo.fx_security_score.rolling_beta",
            return_value=0.4,
        ),
        patch(
            "motor.src.calculo.fx_security_score._fx_carry",
            return_value=0.5,
        ),
        patch(
            "motor.src.calculo.fx_security_score._tracking_error",
            side_effect=fake_te,
        ),
    ):
        out = compute_fx_security_batch(["FXE", "CEW"], as_of=as_of)

    cew = {c["id"]: c for c in out["CEW"]["componentes"]}
    assert cew["tracking_error"]["percentile_cs"] == 0.5
    assert cew["tracking_error"]["valor"] is None
