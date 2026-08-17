"""Tests for EM equity class models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.em_equity_security_score import (
    _load_security_weights,
    compute_em_equity_security_batch,
)
from motor.src.calculo.models.cash_regime_model import _min_action
from motor.src.calculo.models.em_equity_regime_model import compute_em_equity_regime


def test_em_equity_regime_returns_model_fields():
    result = compute_em_equity_regime()
    assert result["model"] == "em_equity_regime_v1"
    assert "em_equity_regime_score" in result
    assert "em_stress_flag" in result


def test_em_stress_override_caps_strong_reduce():
    assert _min_action("Overweight", "Strong Reduce") == "Strong Reduce"


def test_em_equity_security_batch():
    batch = compute_em_equity_security_batch(["EEM"], universe_tickers=["EEM", "VWO"])
    assert batch["EEM"]["model"] == "em_equity_security_v2"


def test_em_equity_security_weights_keep_trend_and_china_dominant():
    weights = _load_security_weights()
    assert weights["wa"] == 0.3
    assert weights["wb"] == 0.2
    assert weights["wc"] == 0.2
    assert weights["wd"] == 0.3
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def _fake_tecnico(as_of: dt.date, table: dict[tuple[str, str], float]):
    def fake(ticker: str, indicador_id: str) -> pd.Series:
        key = (ticker, indicador_id)
        if key not in table:
            return pd.Series(dtype=float)
        return pd.Series([table[key]], index=[pd.Timestamp(as_of)])

    return fake


def test_em_equity_uses_dollar_volume_and_distance_schema():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("EEM", "preco_vs_mm50"): 0.08,
        ("EMXC", "preco_vs_mm50"): 0.01,
        ("EEM", "preco_vs_mm200"): 0.10,
        ("EMXC", "preco_vs_mm200"): 0.00,
        ("EEM", "rsi_14"): 70.0,
        ("EMXC", "rsi_14"): 30.0,
    }
    dollars = {"EEM": 10_000_000.0, "EMXC": 1_000_000.0}
    betas = {"EEM": 0.70, "EMXC": 0.10}

    with (
        patch(
            "motor.src.calculo.em_equity_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.em_equity_security_score._dollar_volume",
            side_effect=lambda ticker, _as_of: dollars[ticker],
        ),
        patch(
            "motor.src.calculo.em_equity_security_score.rolling_beta",
            side_effect=lambda ticker, _b, **_k: betas[ticker],
        ),
    ):
        out = compute_em_equity_security_batch(["EEM", "EMXC"], as_of=as_of)

    assert out["EEM"]["model"] == "em_equity_security_v2"
    eem = {c["id"]: c for c in out["EEM"]["componentes"]}
    assert eem["preco_vs_mm50"]["inverte_percentil"] is False
    assert eem["rsi_14"]["inverte_percentil"] is False
    assert eem["volume_dolar"]["inverte_percentil"] is False
    assert eem["volume_dolar"]["peso"] == 0.2
    assert eem["china_fit"]["tipo_metrica"] == "distancia_ao_alvo"
    assert eem["china_fit"]["inverte_percentil"] is False
    assert eem["china_fit"]["peso"] == 0.3
    assert eem["china_fit"]["alvo_percentil"] == 0.6
    assert out["EEM"]["security_score"] > out["EMXC"]["security_score"]


def test_china_fit_is_distance_to_class_target():
    """Closer FXI-beta percentile to 0.60 beats a more extreme China loading."""
    as_of = dt.date(2026, 8, 14)
    table = {
        ("LOW", "preco_vs_mm50"): 0.04,
        ("MID", "preco_vs_mm50"): 0.04,
        ("HIGH", "preco_vs_mm50"): 0.04,
        ("LOW", "preco_vs_mm200"): 0.04,
        ("MID", "preco_vs_mm200"): 0.04,
        ("HIGH", "preco_vs_mm200"): 0.04,
        ("LOW", "rsi_14"): 55.0,
        ("MID", "rsi_14"): 55.0,
        ("HIGH", "rsi_14"): 55.0,
    }
    betas = {"LOW": 0.10, "MID": 0.55, "HIGH": 0.95}

    with (
        patch(
            "motor.src.calculo.em_equity_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.em_equity_security_score._dollar_volume",
            return_value=5_000_000.0,
        ),
        patch(
            "motor.src.calculo.em_equity_security_score.rolling_beta",
            side_effect=lambda ticker, _b, **_k: betas[ticker],
        ),
    ):
        out = compute_em_equity_security_batch(["LOW", "MID", "HIGH"], as_of=as_of)

    fits = {t: {c["id"]: c for c in out[t]["componentes"]}["china_fit"] for t in ("LOW", "MID", "HIGH")}
    assert fits["MID"]["china_fit"] > fits["LOW"]["china_fit"]
    assert fits["MID"]["china_fit"] > fits["HIGH"]["china_fit"]
    assert out["MID"]["security_score"] > out["LOW"]["security_score"]
    assert out["MID"]["security_score"] > out["HIGH"]["security_score"]


def test_china_fit_is_bucket_not_issuer():
    """Same FXI beta → same China-exposure fit, regardless of ticker name."""
    as_of = dt.date(2026, 8, 14)
    table = {
        ("EEM", "preco_vs_mm50"): 0.08,
        ("VWO", "preco_vs_mm50"): 0.01,
        ("EEM", "preco_vs_mm200"): 0.08,
        ("VWO", "preco_vs_mm200"): 0.01,
        ("EEM", "rsi_14"): 70.0,
        ("VWO", "rsi_14"): 30.0,
    }

    with (
        patch(
            "motor.src.calculo.em_equity_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.em_equity_security_score._dollar_volume",
            side_effect=lambda ticker, _as_of: 8_000_000.0 if ticker == "EEM" else 2_000_000.0,
        ),
        patch(
            "motor.src.calculo.em_equity_security_score.rolling_beta",
            return_value=0.62,
        ),
    ):
        out = compute_em_equity_security_batch(["EEM", "VWO"], as_of=as_of)

    eem = {c["id"]: c for c in out["EEM"]["componentes"]}["china_fit"]
    vwo = {c["id"]: c for c in out["VWO"]["componentes"]}["china_fit"]
    assert eem["china_fit"] == vwo["china_fit"]
    assert eem["contribuicao"] == vwo["contribuicao"]
    assert eem["tipo_metrica"] == "distancia_ao_alvo"
    assert out["EEM"]["security_score"] > out["VWO"]["security_score"]


def test_em_dollar_volume_beats_cheap_high_share_count():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("CHEAP", "preco_vs_mm50"): 0.04,
        ("RICH", "preco_vs_mm50"): 0.04,
        ("CHEAP", "preco_vs_mm200"): 0.04,
        ("RICH", "preco_vs_mm200"): 0.04,
        ("CHEAP", "rsi_14"): 55.0,
        ("RICH", "rsi_14"): 55.0,
    }

    with (
        patch(
            "motor.src.calculo.em_equity_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.em_equity_security_score._dollar_volume",
            side_effect=lambda ticker, _as_of: 5_000_000.0 if ticker == "CHEAP" else 10_000_000.0,
        ),
        patch(
            "motor.src.calculo.em_equity_security_score.rolling_beta",
            return_value=0.50,
        ),
    ):
        out = compute_em_equity_security_batch(["CHEAP", "RICH"], as_of=as_of)

    cheap = {c["id"]: c for c in out["CHEAP"]["componentes"]}
    rich = {c["id"]: c for c in out["RICH"]["componentes"]}
    assert cheap["volume_dolar"]["valor"] == 5_000_000.0
    assert rich["volume_dolar"]["valor"] == 10_000_000.0
    assert rich["volume_dolar"]["percentile_cs"] > cheap["volume_dolar"]["percentile_cs"]
    assert out["RICH"]["security_score"] > out["CHEAP"]["security_score"]
