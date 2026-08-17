"""Tests for infrastructure class models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.alt_infrastructure_security_score import (
    _load_security_weights,
    compute_alt_infrastructure_security_batch,
)
from motor.src.calculo.models.alt_infrastructure_regime_model import (
    compute_alt_infrastructure_regime,
)
from motor.src.ingestao.edgar_infra import extract_infra_fundamentals, ratios_from_fundamentals


def test_infra_regime_returns_model_fields():
    result = compute_alt_infrastructure_regime()
    assert result["model"] == "alt_infrastructure_regime_v1"
    assert "alt_infrastructure_regime_score" in result


def test_infra_security_weights():
    weights = _load_security_weights()
    assert weights["wa"] == 0.2
    assert weights["wb"] == 0.15
    assert weights["wc"] == 0.2
    assert weights["wd"] == 0.2
    assert weights["we"] == 0.15
    assert weights["wf"] == 0.1
    assert abs(sum(weights.values()) - 1.0) < 1e-9


def _fake_tecnico(as_of: dt.date, table: dict[tuple[str, str], float]):
    def fake(ticker: str, indicador_id: str) -> pd.Series:
        key = (ticker, indicador_id)
        if key not in table:
            return pd.Series(dtype=float)
        return pd.Series([table[key]], index=[pd.Timestamp(as_of)])

    return fake


def test_infra_v2_inverts_leverage_vol_and_drops_rsi_volume():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("SOLID", "preco_vs_mm50"): 0.04,
        ("STRESSED", "preco_vs_mm50"): 0.04,
        ("SOLID", "preco_vs_mm200"): 0.05,
        ("STRESSED", "preco_vs_mm200"): 0.05,
        ("SOLID", "vol_realizada"): 0.01,
        ("STRESSED", "vol_realizada"): 0.05,
    }

    def fake_edgar(ticker: str, metric: str, as_of=None):
        if ticker == "STRESSED":
            return {"fcf_coverage": 0.6, "ev_ebitda": 18.0, "debt_ebitda": 7.0}.get(metric)
        return {"fcf_coverage": 1.4, "ev_ebitda": 10.0, "debt_ebitda": 3.0}.get(metric)

    def fake_ev_series(ticker: str, metric: str) -> pd.Series:
        if metric != "ev_ebitda":
            return pd.Series(dtype=float)
        idx = pd.date_range(end=as_of, periods=8, freq="QE")
        if ticker == "STRESSED":
            return pd.Series([12, 12, 12, 12, 12, 12, 12, 18.0], index=idx)
        return pd.Series([12, 12, 12, 12, 12, 12, 12, 10.0], index=idx)

    with (
        patch(
            "motor.src.calculo.alt_infrastructure_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.alt_infrastructure_security_score.get_edgar_metric_at",
            side_effect=fake_edgar,
        ),
        patch(
            "motor.src.calculo.alt_infrastructure_security_score.get_edgar_metrics_series",
            side_effect=fake_ev_series,
        ),
        patch(
            "motor.src.calculo.alt_infrastructure_security_score._yield_own_z",
            side_effect=lambda ticker, _as_of: (0.04, 0.0),
        ),
    ):
        out = compute_alt_infrastructure_security_batch(["SOLID", "STRESSED"], as_of=as_of)

    assert out["SOLID"]["model"] == "alt_infrastructure_security_v2"
    solid = {c["id"]: c for c in out["SOLID"]["componentes"]}
    stressed = {c["id"]: c for c in out["STRESSED"]["componentes"]}
    ids = set(solid)
    assert "rsi_14" not in ids
    assert "volume_vs_media" not in ids
    assert "volume_dolar" not in ids
    assert solid["fcf_coverage"]["peso"] == 0.2
    assert solid["ev_ebitda"]["inverte_percentil"] is True
    assert solid["debt_ebitda"]["inverte_percentil"] is True
    assert solid["vol_realizada"]["inverte_percentil"] is True
    assert solid["vol_realizada"]["contribuicao"] > 0
    assert solid["fcf_coverage"]["percentile_cs"] > stressed["fcf_coverage"]["percentile_cs"]
    assert solid["debt_ebitda"]["percentile_cs"] > stressed["debt_ebitda"]["percentile_cs"]
    assert solid["ev_ebitda"]["percentile_cs"] > stressed["ev_ebitda"]["percentile_cs"]
    assert out["SOLID"]["security_score"] > out["STRESSED"]["security_score"]


def test_infra_etf_missing_fundamentals_sits_at_median():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("NEE", "preco_vs_mm50"): 0.04,
        ("IGF", "preco_vs_mm50"): 0.04,
        ("NEE", "preco_vs_mm200"): 0.05,
        ("IGF", "preco_vs_mm200"): 0.05,
        ("NEE", "vol_realizada"): 0.02,
        ("IGF", "vol_realizada"): 0.02,
    }

    def fake_edgar(ticker: str, metric: str, as_of=None):
        if ticker == "NEE":
            return {"fcf_coverage": 1.1, "ev_ebitda": 14.0, "debt_ebitda": 4.0}.get(metric)
        return None

    def fake_ev_series(ticker: str, metric: str) -> pd.Series:
        if ticker != "NEE" or metric != "ev_ebitda":
            return pd.Series(dtype=float)
        idx = pd.date_range(end=as_of, periods=8, freq="QE")
        return pd.Series([14.0] * 8, index=idx)

    with (
        patch(
            "motor.src.calculo.alt_infrastructure_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.alt_infrastructure_security_score.get_edgar_metric_at",
            side_effect=fake_edgar,
        ),
        patch(
            "motor.src.calculo.alt_infrastructure_security_score.get_edgar_metrics_series",
            side_effect=fake_ev_series,
        ),
        patch(
            "motor.src.calculo.alt_infrastructure_security_score._yield_own_z",
            side_effect=lambda ticker, _as_of: (0.03, 0.0),
        ),
    ):
        out = compute_alt_infrastructure_security_batch(["NEE", "IGF"], as_of=as_of)

    igf = {c["id"]: c for c in out["IGF"]["componentes"]}
    assert igf["fcf_coverage"]["percentile_cs"] == 0.5
    assert igf["ev_ebitda"]["percentile_cs"] == 0.5
    assert igf["debt_ebitda"]["percentile_cs"] == 0.5
    assert igf["fcf_coverage"]["valor"] is None


def test_extract_infra_coverage_and_leverage_from_companyfacts():
    facts = {
        "facts": {
            "us-gaap": {
                "OperatingIncomeLoss": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-03-31",
                                "val": 100.0,
                                "form": "10-Q",
                                "filed": "2024-05-01",
                                "frame": "CY2024Q1",
                            }
                        ]
                    }
                },
                "DepreciationDepletionAndAmortization": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-03-31",
                                "val": 40.0,
                                "form": "10-Q",
                                "filed": "2024-05-01",
                                "frame": "CY2024Q1",
                            }
                        ]
                    }
                },
                "LongTermDebtNoncurrent": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-03-31",
                                "val": 400.0,
                                "form": "10-Q",
                                "filed": "2024-05-01",
                                "frame": "CY2024Q1I",
                            }
                        ]
                    }
                },
                "DebtCurrent": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-03-31",
                                "val": 20.0,
                                "form": "10-Q",
                                "filed": "2024-05-01",
                                "frame": "CY2024Q1I",
                            }
                        ]
                    }
                },
                "CashAndCashEquivalentsAtCarryingValue": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-03-31",
                                "val": 10.0,
                                "form": "10-Q",
                                "filed": "2024-05-01",
                                "frame": "CY2024Q1I",
                            }
                        ]
                    }
                },
                "NetCashProvidedByUsedInOperatingActivities": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-03-31",
                                "val": 80.0,
                                "form": "10-Q",
                                "filed": "2024-05-01",
                                "frame": "CY2024Q1",
                            }
                        ]
                    }
                },
                "PaymentsToAcquirePropertyPlantAndEquipment": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-03-31",
                                "val": 20.0,
                                "form": "10-Q",
                                "filed": "2024-05-01",
                                "frame": "CY2024Q1",
                            }
                        ]
                    }
                },
                "PaymentsOfDividends": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-03-31",
                                "val": 30.0,
                                "form": "10-Q",
                                "filed": "2024-05-01",
                                "frame": "CY2024Q1",
                            }
                        ]
                    }
                },
            },
            "dei": {
                "EntityCommonStockSharesOutstanding": {
                    "units": {
                        "shares": [
                            {
                                "end": "2024-03-31",
                                "val": 10.0,
                                "form": "10-Q",
                                "filed": "2024-05-01",
                                "frame": "CY2024Q1I",
                            }
                        ]
                    }
                }
            },
        }
    }
    fund = extract_infra_fundamentals(facts)
    assert fund["ebitda"]["2024-03-31"] == 140.0
    assert fund["total_debt"]["2024-03-31"] == 420.0
    ratios = ratios_from_fundamentals(fund, lambda _d: 20.0)
    assert abs(ratios["fcf_coverage"]["2024-03-31"] - 2.0) < 1e-9  # (80-20)/30
    assert abs(ratios["debt_ebitda"]["2024-03-31"] - 3.0) < 1e-9  # 420/140
    # EV = 20*10 + (420-10) = 610; /140 ≈ 4.357
    assert abs(ratios["ev_ebitda"]["2024-03-31"] - 610.0 / 140.0) < 1e-9


def test_companyfacts_skips_ytd_frames():
    facts = {
        "facts": {
            "us-gaap": {
                "NetCashProvidedByUsedInOperatingActivities": {
                    "units": {
                        "USD": [
                            {
                                "end": "2024-06-30",
                                "val": 999.0,
                                "form": "10-Q",
                                "filed": "2024-08-01",
                                "frame": "CY2024Q2YTD",
                            },
                            {
                                "end": "2024-06-30",
                                "val": 50.0,
                                "form": "10-Q",
                                "filed": "2024-08-01",
                                "frame": "CY2024Q2",
                            },
                        ]
                    }
                }
            }
        }
    }
    fund = extract_infra_fundamentals(facts)
    assert fund["ocf"]["2024-06-30"] == 50.0
