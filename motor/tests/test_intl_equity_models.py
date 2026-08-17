"""Tests for international equity class models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.intl_equity_security_score import (
    _load_security_weights,
    compute_intl_equity_security_batch,
)
from motor.src.calculo.models.intl_equity_regime_model import compute_intl_equity_regime


def test_intl_equity_regime_returns_model_fields():
    result = compute_intl_equity_regime()
    assert result["model"] == "intl_equity_regime_v1"
    assert "intl_equity_regime_score" in result
    assert result.get("calibrated") is False


def test_intl_equity_security_batch():
    batch = compute_intl_equity_security_batch(["EFA"], universe_tickers=["EFA", "VEA"])
    assert batch["EFA"]["model"] == "intl_equity_security_v2"


def test_intl_equity_security_weights_keep_trend_and_fx_dominant():
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


def test_intl_equity_inverts_vol_and_keeps_usd_close_ids():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("EFA", "preco_vs_mm50"): 0.08,
        ("VEA", "preco_vs_mm50"): 0.01,
        ("EFA", "preco_vs_mm200"): 0.10,
        ("VEA", "preco_vs_mm200"): 0.00,
        ("EFA", "rsi_14"): 70.0,
        ("VEA", "rsi_14"): 30.0,
        ("EFA", "vol_realizada"): 0.01,
        ("VEA", "vol_realizada"): 0.05,
    }
    betas = {"EFA": 0.40, "VEA": 0.10}

    with (
        patch(
            "motor.src.calculo.intl_equity_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.intl_equity_security_score.rolling_beta",
            side_effect=lambda ticker, _b, **_k: betas[ticker],
        ),
    ):
        out = compute_intl_equity_security_batch(["EFA", "VEA"], as_of=as_of)

    assert out["EFA"]["model"] == "intl_equity_security_v2"
    efa = {c["id"]: c for c in out["EFA"]["componentes"]}
    assert efa["preco_vs_mm50"]["inverte_percentil"] is False
    assert efa["rsi_14"]["inverte_percentil"] is False
    assert efa["vol_realizada"]["inverte_percentil"] is True
    assert efa["vol_realizada"]["contribuicao"] > 0
    assert efa["vol_realizada"]["vol_window"] == 20
    assert efa["hedge_fit"]["tipo_metrica"] == "distancia_ao_alvo"
    assert efa["hedge_fit"]["inverte_percentil"] is False
    assert efa["preco_vs_mm50"]["peso"] == 0.3
    assert efa["hedge_fit"]["peso"] == 0.3
    # Equal |β| distance is not required here; EFA still wins trend/RSI/vol.
    assert out["EFA"]["security_score"] > out["VEA"]["security_score"]


def test_hedge_fit_is_distance_to_class_target():
    """Closer |β| percentile to 0.35 beats a more extreme dollar beta."""
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
        ("LOW", "vol_realizada"): 0.02,
        ("MID", "vol_realizada"): 0.02,
        ("HIGH", "vol_realizada"): 0.02,
    }
    betas = {"LOW": 0.10, "MID": 0.40, "HIGH": 0.90}

    with (
        patch(
            "motor.src.calculo.intl_equity_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.intl_equity_security_score.rolling_beta",
            side_effect=lambda ticker, _b, **_k: betas[ticker],
        ),
    ):
        out = compute_intl_equity_security_batch(["LOW", "MID", "HIGH"], as_of=as_of)

    fits = {t: {c["id"]: c for c in out[t]["componentes"]}["hedge_fit"] for t in ("LOW", "MID", "HIGH")}
    assert fits["MID"]["hedge_fit"] > fits["LOW"]["hedge_fit"]
    assert fits["MID"]["hedge_fit"] > fits["HIGH"]["hedge_fit"]
    assert out["MID"]["security_score"] > out["LOW"]["security_score"]
    assert out["MID"]["security_score"] > out["HIGH"]["security_score"]


def test_hedge_fit_is_bucket_not_issuer():
    """Same |beta vs UUP| → same currency-exposure fit, regardless of ticker name."""
    as_of = dt.date(2026, 8, 14)
    table = {
        ("EFA", "preco_vs_mm50"): 0.08,
        ("VEA", "preco_vs_mm50"): 0.01,
        ("EFA", "preco_vs_mm200"): 0.08,
        ("VEA", "preco_vs_mm200"): 0.01,
        ("EFA", "rsi_14"): 70.0,
        ("VEA", "rsi_14"): 30.0,
        ("EFA", "vol_realizada"): 0.01,
        ("VEA", "vol_realizada"): 0.04,
    }

    with (
        patch(
            "motor.src.calculo.intl_equity_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.intl_equity_security_score.rolling_beta",
            return_value=0.42,
        ),
    ):
        out = compute_intl_equity_security_batch(["EFA", "VEA"], as_of=as_of)

    efa = {c["id"]: c for c in out["EFA"]["componentes"]}["hedge_fit"]
    vea = {c["id"]: c for c in out["VEA"]["componentes"]}["hedge_fit"]
    assert efa["hedge_fit"] == vea["hedge_fit"]
    assert efa["contribuicao"] == vea["contribuicao"]
    assert efa["tipo_metrica"] == "distancia_ao_alvo"
    assert out["EFA"]["security_score"] > out["VEA"]["security_score"]
