"""Tests for energy commodities class models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.commodities_energy_security_score import (
    _load_security_weights,
    _oil_scale,
    compute_commodities_energy_security_batch,
)
from motor.src.calculo.models.commodities_energy_regime_model import (
    compute_commodities_energy_regime,
)


def test_energy_regime_returns_model_fields():
    result = compute_commodities_energy_regime()
    assert result["model"] == "commodities_energy_regime_v1"
    assert "commodities_energy_regime_score" in result


def test_energy_security_batch_v2():
    batch = compute_commodities_energy_security_batch(["USO"], universe_tickers=["USO", "XLE"])
    assert batch["USO"]["model"] == "commodities_energy_security_v2"
    ids = {c["id"] for c in batch["USO"]["componentes"]}
    assert "preco_vs_mm50_oil" in ids
    assert "rsi_14_oil" in ids
    assert "volume_dolar" in ids
    assert "beta_fit" in ids


def test_energy_security_weights():
    weights = _load_security_weights()
    assert weights["wa"] == 0.35
    assert weights["wb"] == 0.2
    assert weights["wc"] == 0.2
    assert weights["wd"] == 0.25
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def test_oil_scale_floors_near_zero_beta():
    assert _oil_scale(1.5) == 1.5
    assert _oil_scale(-1.5) == 1.5
    assert _oil_scale(0.05) == 0.25


def _fake_tecnico(as_of: dt.date, table: dict[tuple[str, str], float]):
    def fake(ticker: str, indicador_id: str) -> pd.Series:
        key = (ticker, indicador_id)
        if key not in table:
            return pd.Series(dtype=float)
        return pd.Series([table[key]], index=[pd.Timestamp(as_of)])

    return fake


def test_same_price_gap_favors_lower_oil_beta():
    """Same % vs MAs must not crown XOP just because oil beta is higher."""
    as_of = dt.date(2026, 8, 14)
    table = {
        ("XLE", "preco_vs_mm50"): 0.05,
        ("XOP", "preco_vs_mm50"): 0.05,
        ("XLE", "preco_vs_mm200"): 0.08,
        ("XOP", "preco_vs_mm200"): 0.08,
    }
    betas = {"XLE": 0.5, "XOP": 1.5}

    with (
        patch(
            "motor.src.calculo.commodities_energy_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.commodities_energy_security_score.rolling_beta",
            side_effect=lambda ticker, _b, **_k: betas[ticker],
        ),
        patch(
            "motor.src.calculo.commodities_energy_security_score._rsi_oil_adjusted",
            return_value=50.0,
        ),
        patch(
            "motor.src.calculo.commodities_energy_security_score._dollar_volume",
            return_value=3_000_000.0,
        ),
    ):
        out = compute_commodities_energy_security_batch(["XLE", "XOP"], as_of=as_of)

    assert out["XLE"]["model"] == "commodities_energy_security_v2"
    xle = {c["id"]: c for c in out["XLE"]["componentes"]}
    xop = {c["id"]: c for c in out["XOP"]["componentes"]}
    assert xle["preco_vs_mm50_oil"]["valor"] > xop["preco_vs_mm50_oil"]["valor"]
    assert xle["preco_vs_mm50_oil"]["percentile_cs"] > xop["preco_vs_mm50_oil"]["percentile_cs"]
    assert xle["preco_vs_mm50_oil"]["inverte_percentil"] is False
    assert xle["rsi_14_oil"]["inverte_percentil"] is False
    assert xle["volume_dolar"]["inverte_percentil"] is False
    assert xle["beta_fit"]["inverte_percentil"] is False
    assert xle["beta_fit"]["tipo_metrica"] == "distancia_ao_alvo"
    assert xle["beta_fit"]["alvo_percentil"] == 0.7
    assert xle["preco_vs_mm50_oil"]["peso"] == 0.35
    assert xle["beta_fit"]["peso"] == 0.25


def test_oil_fit_is_distance_to_class_target():
    """Closer USO-beta percentile to 0.70 beats a more extreme oil loading."""
    as_of = dt.date(2026, 8, 14)
    names = ("LOW", "MID", "HIGH")
    table = {}
    for n in names:
        table[(n, "preco_vs_mm50")] = 0.04
        table[(n, "preco_vs_mm200")] = 0.04
    betas = {"LOW": 0.20, "MID": 0.80, "HIGH": 1.50}

    with (
        patch(
            "motor.src.calculo.commodities_energy_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.commodities_energy_security_score.rolling_beta",
            side_effect=lambda ticker, _b, **_k: betas[ticker],
        ),
        patch(
            "motor.src.calculo.commodities_energy_security_score._rsi_oil_adjusted",
            return_value=50.0,
        ),
        patch(
            "motor.src.calculo.commodities_energy_security_score._dollar_volume",
            return_value=3_000_000.0,
        ),
    ):
        out = compute_commodities_energy_security_batch(list(names), as_of=as_of)

    fits = {n: {c["id"]: c for c in out[n]["componentes"]}["beta_fit"]["beta_fit"] for n in names}
    assert fits["MID"] > fits["HIGH"]
    assert fits["MID"] > fits["LOW"]


def test_energy_dollar_volume_beats_cheap_high_share_count():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("CHEAP", "preco_vs_mm50"): 0.03,
        ("RICH", "preco_vs_mm50"): 0.03,
        ("CHEAP", "preco_vs_mm200"): 0.03,
        ("RICH", "preco_vs_mm200"): 0.03,
    }

    with (
        patch(
            "motor.src.calculo.commodities_energy_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.commodities_energy_security_score.rolling_beta",
            return_value=0.8,
        ),
        patch(
            "motor.src.calculo.commodities_energy_security_score._rsi_oil_adjusted",
            return_value=50.0,
        ),
        patch(
            "motor.src.calculo.commodities_energy_security_score._dollar_volume",
            side_effect=lambda ticker, _as_of: 10_000_000.0 if ticker == "RICH" else 5_000_000.0,
        ),
    ):
        out = compute_commodities_energy_security_batch(["CHEAP", "RICH"], as_of=as_of)

    cheap = {c["id"]: c for c in out["CHEAP"]["componentes"]}
    rich = {c["id"]: c for c in out["RICH"]["componentes"]}
    assert rich["volume_dolar"]["percentile_cs"] > cheap["volume_dolar"]["percentile_cs"]
    assert out["RICH"]["security_score"] > out["CHEAP"]["security_score"]
