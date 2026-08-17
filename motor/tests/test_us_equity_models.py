"""Tests for US equity class models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.models.cash_regime_model import _min_action
from motor.src.calculo.models.us_equity_regime_model import compute_us_equity_regime
from motor.src.calculo.security_score_helpers import security_estagio
from motor.src.calculo.us_equity_security_score import (
    _dollar_volume,
    _load_security_weights,
    compute_us_equity_security_batch,
)


def test_us_equity_regime_returns_model_fields():
    result = compute_us_equity_regime()
    assert result["model"] == "us_equity_regime_v1"
    assert "us_equity_regime_score" in result
    assert "regime_action" in result
    assert result.get("calibrated") is False
    assert result.get("output_type", "allocation") == "allocation"


def test_recession_warning_caps_at_reduce():
    assert _min_action("Overweight", "Reduce") == "Reduce"
    assert _min_action("Hold", "Reduce") == "Reduce"


def test_us_equity_security_batch_shape():
    batch = compute_us_equity_security_batch(["SPY"], universe_tickers=["SPY", "QQQ"])
    assert "SPY" in batch
    assert "security_score" in batch["SPY"]
    assert batch["SPY"]["model"] == "us_equity_security_v2"


def test_security_estagio_thresholds():
    assert security_estagio(0.7) == "Ascendente"
    assert security_estagio(0.4) == "Maduro"


def test_us_equity_security_weights_keep_trend_rsi_dominant():
    weights = _load_security_weights()
    assert weights["wa"] == 0.35
    assert weights["wb"] == 0.25
    assert weights["wc"] == 0.2
    assert weights["wd"] == 0.2
    assert abs(weights["wa"] + weights["wb"] + weights["wc"] + weights["wd"] - 1.0) < 1e-9


def test_us_equity_security_inverts_vol_and_uses_dollar_volume():
    as_of = dt.date(2026, 8, 14)

    def fake_tecnico(ticker: str, indicador_id: str) -> pd.Series:
        table = {
            ("SPY", "preco_vs_mm50"): 0.08,
            ("IWM", "preco_vs_mm50"): 0.01,
            ("SPY", "preco_vs_mm200"): 0.10,
            ("IWM", "preco_vs_mm200"): 0.00,
            ("SPY", "rsi_14"): 70.0,
            ("IWM", "rsi_14"): 30.0,
            ("SPY", "volume_dolar"): 10_000_000.0,
            ("IWM", "volume_dolar"): 1_000_000.0,
            ("SPY", "vol_realizada"): 0.01,
            ("IWM", "vol_realizada"): 0.05,
        }
        key = (ticker, indicador_id)
        if key not in table:
            return pd.Series(dtype=float)
        return pd.Series([table[key]], index=[pd.Timestamp(as_of)])

    with patch(
        "motor.src.calculo.us_equity_security_score.get_tecnico_series",
        side_effect=fake_tecnico,
    ):
        out = compute_us_equity_security_batch(["SPY", "IWM"], as_of=as_of)

    assert out["SPY"]["model"] == "us_equity_security_v2"
    assert out["SPY"]["security_score"] == 1.0
    assert out["IWM"]["security_score"] == 0.0
    spy = {c["id"]: c for c in out["SPY"]["componentes"]}
    assert spy["preco_vs_mm50"]["inverte_percentil"] is False
    assert spy["rsi_14"]["inverte_percentil"] is False
    assert spy["volume_dolar"]["inverte_percentil"] is False
    assert spy["vol_realizada"]["inverte_percentil"] is True
    assert spy["vol_realizada"]["contribuicao"] > 0
    assert spy["vol_realizada"]["vol_window"] == 20
    assert spy["preco_vs_mm50"]["peso"] == 0.35
    assert spy["volume_dolar"]["peso"] == 0.2
    assert spy["vol_realizada"]["peso"] == 0.2


def test_us_equity_dollar_volume_beats_cheap_high_share_count():
    """A $5 name with huge share volume must lose to a $500 name with more dollars traded."""
    as_of = dt.date(2026, 8, 14)

    def fake_tecnico(ticker: str, indicador_id: str) -> pd.Series:
        table = {
            ("CHEAP", "preco_vs_mm50"): 0.04,
            ("RICH", "preco_vs_mm50"): 0.04,
            ("CHEAP", "preco_vs_mm200"): 0.04,
            ("RICH", "preco_vs_mm200"): 0.04,
            ("CHEAP", "rsi_14"): 55.0,
            ("RICH", "rsi_14"): 55.0,
            ("CHEAP", "vol_realizada"): 0.02,
            ("RICH", "vol_realizada"): 0.02,
        }
        key = (ticker, indicador_id)
        if key not in table:
            return pd.Series(dtype=float)
        return pd.Series([table[key]], index=[pd.Timestamp(as_of)])

    class _FakeConn:
        def __init__(self) -> None:
            self._row = None

        def execute(self, _q, params):
            ticker = params[0]
            rows = {
                "CHEAP": {"close": 5.0, "volume": 1_000_000.0},  # $5M
                "RICH": {"close": 500.0, "volume": 20_000.0},  # $10M
            }
            self._row = rows[ticker]
            return self

        def fetchone(self):
            return self._row

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    with (
        patch(
            "motor.src.calculo.us_equity_security_score.get_tecnico_series",
            side_effect=fake_tecnico,
        ),
        patch(
            "motor.src.calculo.us_equity_security_score.get_connection",
            side_effect=_FakeConn,
        ),
    ):
        out = compute_us_equity_security_batch(["CHEAP", "RICH"], as_of=as_of)

    cheap = {c["id"]: c for c in out["CHEAP"]["componentes"]}
    rich = {c["id"]: c for c in out["RICH"]["componentes"]}
    assert cheap["volume_dolar"]["valor"] == 5_000_000.0
    assert rich["volume_dolar"]["valor"] == 10_000_000.0
    assert rich["volume_dolar"]["percentile_cs"] > cheap["volume_dolar"]["percentile_cs"]
    assert out["RICH"]["security_score"] > out["CHEAP"]["security_score"]


def test_dollar_volume_multiplies_close_by_shares():
    as_of = dt.date(2026, 8, 14)

    class _FakeConn:
        def execute(self, _q, _params):
            return self

        def fetchone(self):
            return {"close": 500.0, "volume": 20_000.0}

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    with (
        patch(
            "motor.src.calculo.us_equity_security_score.get_tecnico_series",
            return_value=pd.Series(dtype=float),
        ),
        patch(
            "motor.src.calculo.us_equity_security_score.get_connection",
            return_value=_FakeConn(),
        ),
    ):
        assert _dollar_volume("SPY", as_of) == 10_000_000.0
