"""Tests for precious metals class models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.commodities_precious_security_score import (
    _load_security_weights,
    compute_commodities_precious_security_batch,
)
from motor.src.calculo.models.commodities_precious_regime_model import (
    compute_commodities_precious_regime,
)


def test_precious_regime_returns_model_fields():
    result = compute_commodities_precious_regime()
    assert result["model"] == "commodities_precious_regime_v1"
    assert "commodities_precious_regime_score" in result


def test_precious_security_batch_v2():
    batch = compute_commodities_precious_security_batch(["GLD"], universe_tickers=["GLD", "IAU"])
    assert batch["GLD"]["model"] == "commodities_precious_security_v2"
    ids = {c["id"] for c in batch["GLD"]["componentes"]}
    assert "cot_net_position" not in ids
    assert "cot_gold_net" not in ids
    assert "expense_ratio" in ids
    assert "volume_dolar" in ids
    assert "rsi_14" in ids


def test_precious_security_weights():
    weights = _load_security_weights()
    assert weights["wa"] == 0.35
    assert weights["wb"] == 0.25
    assert weights["wc"] == 0.25
    assert weights["wd"] == 0.15
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def _fake_tecnico(as_of: dt.date, table: dict[tuple[str, str], float]):
    def fake(ticker: str, indicador_id: str) -> pd.Series:
        key = (ticker, indicador_id)
        if key not in table:
            return pd.Series(dtype=float)
        return pd.Series([table[key]], index=[pd.Timestamp(as_of)])

    return fake


def test_precious_inverts_expense_and_uses_dollar_volume():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("GLD", "preco_vs_mm50"): 0.04,
        ("IAU", "preco_vs_mm50"): 0.04,
        ("GLD", "preco_vs_mm200"): 0.05,
        ("IAU", "preco_vs_mm200"): 0.05,
        ("GLD", "rsi_14"): 55.0,
        ("IAU", "rsi_14"): 55.0,
    }

    def fake_er(ticker: str) -> float:
        return 0.004 if ticker == "GLD" else 0.0025

    with (
        patch(
            "motor.src.calculo.commodities_precious_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.commodities_precious_security_score.expense_ratio_value",
            side_effect=fake_er,
        ),
        patch(
            "motor.src.calculo.commodities_precious_security_score._dollar_volume",
            side_effect=lambda ticker, _as_of: 8_000_000.0 if ticker == "IAU" else 1_000_000.0,
        ),
    ):
        out = compute_commodities_precious_security_batch(["GLD", "IAU"], as_of=as_of)

    assert out["IAU"]["model"] == "commodities_precious_security_v2"
    gld = {c["id"]: c for c in out["GLD"]["componentes"]}
    iau = {c["id"]: c for c in out["IAU"]["componentes"]}
    assert gld["preco_vs_mm50"]["inverte_percentil"] is False
    assert gld["rsi_14"]["inverte_percentil"] is False
    assert gld["volume_dolar"]["inverte_percentil"] is False
    assert gld["expense_ratio"]["inverte_percentil"] is True
    assert iau["expense_ratio"]["contribuicao"] > 0
    assert iau["expense_ratio"]["valor"] < gld["expense_ratio"]["valor"]
    assert iau["expense_ratio"]["percentile_cs"] > gld["expense_ratio"]["percentile_cs"]
    assert iau["volume_dolar"]["percentile_cs"] > gld["volume_dolar"]["percentile_cs"]
    assert out["IAU"]["security_score"] > out["GLD"]["security_score"]


def test_precious_dollar_volume_beats_cheap_high_share_count():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("CHEAP", "preco_vs_mm50"): 0.03,
        ("RICH", "preco_vs_mm50"): 0.03,
        ("CHEAP", "preco_vs_mm200"): 0.03,
        ("RICH", "preco_vs_mm200"): 0.03,
        ("CHEAP", "rsi_14"): 50.0,
        ("RICH", "rsi_14"): 50.0,
    }

    with (
        patch(
            "motor.src.calculo.commodities_precious_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.commodities_precious_security_score.expense_ratio_value",
            return_value=0.004,
        ),
        patch(
            "motor.src.calculo.commodities_precious_security_score._dollar_volume",
            side_effect=lambda ticker, _as_of: 10_000_000.0 if ticker == "RICH" else 5_000_000.0,
        ),
    ):
        out = compute_commodities_precious_security_batch(["CHEAP", "RICH"], as_of=as_of)

    cheap = {c["id"]: c for c in out["CHEAP"]["componentes"]}
    rich = {c["id"]: c for c in out["RICH"]["componentes"]}
    assert rich["volume_dolar"]["percentile_cs"] > cheap["volume_dolar"]["percentile_cs"]
    assert out["RICH"]["security_score"] > out["CHEAP"]["security_score"]
