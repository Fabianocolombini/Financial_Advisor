"""Tests for REITs class models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.models.reits_regime_model import compute_reits_regime
from motor.src.calculo.reits_security_score import (
    _load_security_weights,
    compute_reits_security_batch,
)


def test_reits_regime_returns_model_fields():
    result = compute_reits_regime()
    assert result["model"] == "reits_regime_v1"
    assert "reits_regime_score" in result


def test_reits_security_batch_no_rsi():
    batch = compute_reits_security_batch(["VNQ"], universe_tickers=["VNQ", "IYR"])
    assert batch["VNQ"]["model"] == "reits_security_v2"
    ids = {c["id"] for c in batch["VNQ"]["componentes"]}
    assert "rsi_14" not in ids


def test_reits_security_weights():
    weights = _load_security_weights()
    assert weights["wa"] == 0.3
    assert weights["wb"] == 0.35
    assert weights["wc"] == 0.2
    assert weights["wd"] == 0.15
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def _fake_tecnico(as_of: dt.date, table: dict[tuple[str, str], float]):
    def fake(ticker: str, indicador_id: str) -> pd.Series:
        key = (ticker, indicador_id)
        if key not in table:
            return pd.Series(dtype=float)
        return pd.Series([table[key]], index=[pd.Timestamp(as_of)])

    return fake


def test_reits_inverts_vol_haircuts_yield_trap_and_uses_dollar_volume():
    as_of = dt.date(2026, 8, 14)
    idx = pd.bdate_range(end=as_of, periods=80)
    stable = pd.Series([0.06] * 80, index=idx)
    spiked = pd.Series([0.06] * 79 + [0.12], index=idx)
    table = {
        ("CARRY", "preco_vs_mm50"): 0.04,
        ("TRAP", "preco_vs_mm50"): 0.04,
        ("CARRY", "preco_vs_mm200"): 0.05,
        ("TRAP", "preco_vs_mm200"): 0.05,
        ("CARRY", "vol_realizada"): 0.01,
        ("TRAP", "vol_realizada"): 0.04,
    }

    def fake_dy(ticker: str) -> pd.Series:
        return spiked if ticker == "TRAP" else stable

    with (
        patch(
            "motor.src.calculo.reits_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.preferred_security_score.dividend_yield_series",
            side_effect=fake_dy,
        ),
        patch(
            "motor.src.calculo.reits_security_score._dollar_volume",
            side_effect=lambda ticker, _as_of: 8_000_000.0 if ticker == "CARRY" else 1_000_000.0,
        ),
        patch(
            "motor.src.calculo.reits_security_score.get_fred_series",
            return_value=pd.Series([4.2], index=[pd.Timestamp(as_of)]),
        ),
    ):
        out = compute_reits_security_batch(["CARRY", "TRAP"], as_of=as_of)

    assert out["CARRY"]["model"] == "reits_security_v2"
    carry = {c["id"]: c for c in out["CARRY"]["componentes"]}
    trap = {c["id"]: c for c in out["TRAP"]["componentes"]}
    assert "rsi_14" not in carry
    assert carry["preco_vs_mm50"]["inverte_percentil"] is False
    assert carry["dividend_yield"]["inverte_percentil"] is False
    assert carry["volume_dolar"]["inverte_percentil"] is False
    assert carry["vol_realizada"]["inverte_percentil"] is True
    assert carry["vol_realizada"]["contribuicao"] > 0
    assert carry["dividend_yield"]["peso"] == 0.35
    assert trap["dividend_yield"]["valor"] > carry["dividend_yield"]["valor"]
    assert trap["dividend_yield"]["valor_ajustado"] < carry["dividend_yield"]["valor_ajustado"]
    assert carry["dividend_yield"]["percentile_cs"] > trap["dividend_yield"]["percentile_cs"]
    assert carry["dividend_yield"]["dgs10"] == 0.042
    assert out["CARRY"]["security_score"] > out["TRAP"]["security_score"]


def test_dgs10_does_not_change_cross_sectional_yield_rank():
    """y − DGS10 ranks the same as y because DGS10 is class-level that day."""
    as_of = dt.date(2026, 8, 14)
    idx = pd.bdate_range(end=as_of, periods=80)
    high = pd.Series([0.05] * 80, index=idx)
    low = pd.Series([0.03] * 80, index=idx)
    table = {
        ("HIGH", "preco_vs_mm50"): 0.02,
        ("LOW", "preco_vs_mm50"): 0.02,
        ("HIGH", "preco_vs_mm200"): 0.02,
        ("LOW", "preco_vs_mm200"): 0.02,
        ("HIGH", "vol_realizada"): 0.02,
        ("LOW", "vol_realizada"): 0.02,
    }

    def fake_dy(ticker: str) -> pd.Series:
        return high if ticker == "HIGH" else low

    with (
        patch(
            "motor.src.calculo.reits_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.preferred_security_score.dividend_yield_series",
            side_effect=fake_dy,
        ),
        patch(
            "motor.src.calculo.reits_security_score._dollar_volume",
            return_value=3_000_000.0,
        ),
        patch(
            "motor.src.calculo.reits_security_score.get_fred_series",
            return_value=pd.Series([4.0], index=[pd.Timestamp(as_of)]),
        ),
    ):
        out = compute_reits_security_batch(["HIGH", "LOW"], as_of=as_of)

    hi = {c["id"]: c for c in out["HIGH"]["componentes"]}["dividend_yield"]
    lo = {c["id"]: c for c in out["LOW"]["componentes"]}["dividend_yield"]
    assert hi["yield_spread"] > lo["yield_spread"]
    assert hi["percentile_cs"] > lo["percentile_cs"]
    assert hi["dgs10"] == lo["dgs10"]
    # Flat yield history must not invent a trap haircut from float-noise std.
    assert abs(hi["z_score"]) < 1e-9
    assert abs(lo["z_score"]) < 1e-9
    assert hi["valor_ajustado"] == hi["valor"]
