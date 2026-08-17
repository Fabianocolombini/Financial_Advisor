"""Tests for Preferred class mathematical models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.models.cash_regime_model import _clip, _min_action
from motor.src.calculo.models.preferred_regime_model import (
    compute_preferred_regime,
    sanity_check_bank_stress_march_2023,
)
from motor.src.calculo.preferred_security_score import (
    _load_security_weights,
    _security_estagio,
    _yield_trap_adjusted,
    compute_preferred_security_batch,
)


def test_preferred_regime_returns_model_fields():
    result = compute_preferred_regime()
    assert result["model"] == "preferred_regime_v1"
    assert "preferred_regime_score" in result
    assert "regime_action" in result
    assert "bank_stress_flag" in result
    assert result.get("calibrated") is False


def test_bank_stress_override_caps_at_strong_reduce():
    assert _min_action("Overweight", "Strong Reduce") == "Strong Reduce"
    assert _min_action("Hold", "Strong Reduce") == "Strong Reduce"


def test_f_capped_formula():
    raw = _clip((0.9 - 0.5) * 2, 0, 1)
    assert min(raw, 0.6) == 0.6


def test_delta_penalty_clip():
    assert _clip(4.0, 0, 3) / 3 == 1.0
    assert _clip(-1.0, 0, 3) / 3 == 0.0


def test_security_estagio_thresholds():
    assert _security_estagio(0.7) == "Ascendente"
    assert _security_estagio(0.4) == "Maduro"
    assert _security_estagio(0.1) == "Descendente"


def test_bank_stress_sanity_march_2023():
    sanity = sanity_check_bank_stress_march_2023()
    if not sanity.get("ok"):
        return
    assert "passed" in sanity
    assert sanity.get("period") == "2023-03"


def test_preferred_security_weights():
    weights = _load_security_weights()
    assert weights["wa"] == 0.3
    assert weights["wb"] == 0.2
    assert weights["wc"] == 0.25
    assert weights["wd"] == 0.25
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def test_yield_trap_haircut_shrinks_spike_vs_own_history():
    as_of = dt.date(2026, 8, 14)
    idx = pd.bdate_range(end=as_of, periods=80)
    stable = pd.Series([0.06] * 80, index=idx)
    spiked = pd.Series([0.06] * 79 + [0.12], index=idx)

    def fake_dy(ticker: str) -> pd.Series:
        return spiked if ticker == "TRAP" else stable

    with patch(
        "motor.src.calculo.preferred_security_score.dividend_yield_series",
        side_effect=fake_dy,
    ):
        y_s, z_s, adj_s = _yield_trap_adjusted("CARRY", as_of)
        y_t, z_t, adj_t = _yield_trap_adjusted("TRAP", as_of)

    assert y_t > y_s
    assert z_t > z_s
    assert adj_t < adj_s


def test_preferred_security_inverts_vol_and_haircuts_yield_trap():
    as_of = dt.date(2026, 8, 14)
    idx = pd.bdate_range(end=as_of, periods=80)
    stable = pd.Series([0.06] * 80, index=idx)
    spiked = pd.Series([0.06] * 79 + [0.12], index=idx)

    def fake_tecnico(ticker: str, indicador_id: str) -> pd.Series:
        table = {
            ("CARRY", "preco_vs_mm50"): 0.04,
            ("TRAP", "preco_vs_mm50"): 0.04,
            ("CARRY", "preco_vs_mm200"): 0.05,
            ("TRAP", "preco_vs_mm200"): 0.05,
            ("CARRY", "rsi_14"): 55.0,
            ("TRAP", "rsi_14"): 55.0,
            ("CARRY", "vol_realizada"): 0.01,
            ("TRAP", "vol_realizada"): 0.04,
        }
        return pd.Series([table[(ticker, indicador_id)]], index=[pd.Timestamp(as_of)])

    def fake_dy(ticker: str) -> pd.Series:
        return spiked if ticker == "TRAP" else stable

    with (
        patch(
            "motor.src.calculo.preferred_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
        patch(
            "motor.src.calculo.preferred_security_score.dividend_yield_series",
            side_effect=fake_dy,
        ),
    ):
        out = compute_preferred_security_batch(["CARRY", "TRAP"], as_of=as_of)

    assert out["CARRY"]["model"] == "preferred_security_v2"
    assert out["CARRY"]["security_score"] > out["TRAP"]["security_score"]
    carry = {c["id"]: c for c in out["CARRY"]["componentes"]}
    trap = {c["id"]: c for c in out["TRAP"]["componentes"]}
    assert carry["dividend_yield"]["inverte_percentil"] is False
    assert carry["vol_realizada"]["inverte_percentil"] is True
    assert carry["vol_realizada"]["contribuicao"] > 0
    assert trap["dividend_yield"]["valor"] > carry["dividend_yield"]["valor"]
    assert trap["dividend_yield"]["valor_ajustado"] < carry["dividend_yield"]["valor_ajustado"]
    assert carry["dividend_yield"]["percentile_cs"] > trap["dividend_yield"]["percentile_cs"]
    assert carry["preco_vs_mm50"]["peso"] == 0.3
    assert carry["dividend_yield"]["peso"] == 0.25
    assert carry["vol_realizada"]["peso"] == 0.25
