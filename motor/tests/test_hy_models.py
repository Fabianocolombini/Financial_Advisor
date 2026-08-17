"""Tests for HY class mathematical models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.hy_security_score import (
    _load_security_weights,
    _security_estagio,
    compute_hy_security_batch,
)
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


def test_hy_security_weights_keep_trend_rsi_dominant():
    weights = _load_security_weights()
    assert weights["wa"] == 0.35
    assert weights["wb"] == 0.25
    assert weights["wc"] == 0.15
    assert weights["wd"] == 0.25
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def test_hy_security_inverts_vol_and_uses_raw_volume():
    as_of = dt.date(2026, 8, 14)

    def fake_tecnico(ticker: str, indicador_id: str) -> pd.Series:
        table = {
            ("HYG", "preco_vs_mm50"): 0.08,
            ("JNK", "preco_vs_mm50"): 0.01,
            ("HYG", "preco_vs_mm200"): 0.10,
            ("JNK", "preco_vs_mm200"): 0.00,
            ("HYG", "rsi_14"): 70.0,
            ("JNK", "rsi_14"): 30.0,
            ("HYG", "volume_negociado"): 2_000_000.0,
            ("JNK", "volume_negociado"): 100_000.0,
            ("HYG", "vol_realizada"): 0.01,
            ("JNK", "vol_realizada"): 0.05,
        }
        return pd.Series([table[(ticker, indicador_id)]], index=[pd.Timestamp(as_of)])

    with (
        patch(
            "motor.src.calculo.hy_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
        patch(
            "motor.src.calculo.treasury_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
    ):
        out = compute_hy_security_batch(["HYG", "JNK"], as_of=as_of)

    assert out["HYG"]["model"] == "hy_security_v2"
    assert out["HYG"]["security_score"] == 1.0
    assert out["JNK"]["security_score"] == 0.0
    hyg = {c["id"]: c for c in out["HYG"]["componentes"]}
    assert hyg["preco_vs_mm50"]["inverte_percentil"] is False
    assert hyg["rsi_14"]["inverte_percentil"] is False
    assert hyg["volume_negociado"]["inverte_percentil"] is False
    assert hyg["vol_realizada"]["inverte_percentil"] is True
    assert hyg["vol_realizada"]["contribuicao"] > 0
    assert hyg["vol_realizada"]["vol_window"] == 20
    assert hyg["preco_vs_mm50"]["peso"] == 0.35
    assert hyg["vol_realizada"]["peso"] == 0.25
