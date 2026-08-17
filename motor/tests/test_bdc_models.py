"""Tests for BDC / alternative credit class models."""

from __future__ import annotations

import datetime as dt
from unittest.mock import patch

import pandas as pd

from motor.src.calculo.bdc_security_score import (
    _load_security_weights,
    compute_bdc_security_batch,
)
from motor.src.calculo.models.bdc_regime_model import compute_bdc_regime
from motor.src.calculo.models.cash_regime_model import _min_action
from motor.src.ingestao.edgar_client import (
    _parse_nii_coverage_from_html,
    _parse_non_accrual_from_html,
)


def test_bdc_regime_returns_model_fields():
    result = compute_bdc_regime()
    assert result["model"] == "bdc_regime_v1"
    assert "bdc_regime_score" in result
    assert "bdc_credit_stress_flag" in result


def test_bdc_stress_override_caps_reduce():
    assert _min_action("Overweight", "Reduce") == "Reduce"


def test_bdc_security_weights():
    weights = _load_security_weights()
    assert weights["wa"] == 0.3
    assert weights["wb"] == 0.3
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


def _fake_edgar(table: dict[tuple[str, str], float], as_of_seen: list):
    def fake(ticker: str, metric: str, as_of=None):
        as_of_seen.append((ticker, metric, as_of))
        return table.get((ticker, metric))

    return fake


def test_bdc_security_inverts_nav_and_non_accrual_and_drops_rsi_yield_vol():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("CHEAP", "preco_vs_mm50"): 0.04,
        ("RICH", "preco_vs_mm50"): 0.04,
        ("CHEAP", "preco_vs_mm200"): 0.05,
        ("RICH", "preco_vs_mm200"): 0.05,
    }
    edgar = {
        ("CHEAP", "nav_per_share"): 20.0,
        ("RICH", "nav_per_share"): 20.0,
        ("CHEAP", "non_accrual_rate"): 1.0,
        ("RICH", "non_accrual_rate"): 1.0,
        ("CHEAP", "nii_coverage"): 1.1,
        ("RICH", "nii_coverage"): 1.1,
    }
    as_of_seen: list = []

    with (
        patch(
            "motor.src.calculo.bdc_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.bdc_security_score.get_edgar_metric_at",
            side_effect=_fake_edgar(edgar, as_of_seen),
        ),
        patch(
            "motor.src.calculo.bdc_security_score._price_at",
            side_effect=lambda ticker, _as_of: 16.0 if ticker == "CHEAP" else 22.0,
        ),
    ):
        out = compute_bdc_security_batch(["CHEAP", "RICH"], as_of=as_of)

    assert out["CHEAP"]["model"] == "bdc_security_v2"
    cheap = {c["id"]: c for c in out["CHEAP"]["componentes"]}
    rich = {c["id"]: c for c in out["RICH"]["componentes"]}
    assert "rsi_14" not in cheap
    assert "dividend_yield" not in cheap
    assert "vol_realizada" not in cheap
    assert cheap["nav_premium_discount"]["inverte_percentil"] is True
    assert cheap["non_accrual_rate"]["inverte_percentil"] is True
    assert cheap["nii_coverage"]["inverte_percentil"] is False
    assert cheap["preco_vs_mm50"]["inverte_percentil"] is False
    assert cheap["nav_premium_discount"]["peso"] == 0.3
    assert cheap["non_accrual_rate"]["peso"] == 0.3
    assert cheap["nii_coverage"]["peso"] == 0.25
    assert cheap["preco_vs_mm50"]["peso"] == 0.15
    assert cheap["nav_premium_discount"]["valor"] < rich["nav_premium_discount"]["valor"]
    assert cheap["nav_premium_discount"]["percentile_cs"] > rich["nav_premium_discount"]["percentile_cs"]
    assert out["CHEAP"]["security_score"] > out["RICH"]["security_score"]
    assert all(call[2] == as_of for call in as_of_seen)


def test_bdc_triangulation_cheap_nav_high_non_accrual_loses():
    """Same discount: the name with rising non-accrual should rank worse."""
    as_of = dt.date(2026, 8, 14)
    table = {
        ("HEALTHY", "preco_vs_mm50"): 0.04,
        ("TRAP", "preco_vs_mm50"): 0.04,
        ("HEALTHY", "preco_vs_mm200"): 0.05,
        ("TRAP", "preco_vs_mm200"): 0.05,
    }
    edgar = {
        ("HEALTHY", "nav_per_share"): 20.0,
        ("TRAP", "nav_per_share"): 20.0,
        ("HEALTHY", "non_accrual_rate"): 1.0,
        ("TRAP", "non_accrual_rate"): 8.0,
        ("HEALTHY", "nii_coverage"): 1.1,
        ("TRAP", "nii_coverage"): 1.1,
    }

    with (
        patch(
            "motor.src.calculo.bdc_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.bdc_security_score.get_edgar_metric_at",
            side_effect=_fake_edgar(edgar, []),
        ),
        patch(
            "motor.src.calculo.bdc_security_score._price_at",
            return_value=16.0,
        ),
    ):
        out = compute_bdc_security_batch(["HEALTHY", "TRAP"], as_of=as_of)

    healthy = {c["id"]: c for c in out["HEALTHY"]["componentes"]}
    trap = {c["id"]: c for c in out["TRAP"]["componentes"]}
    assert healthy["nav_premium_discount"]["percentile_cs"] == trap["nav_premium_discount"]["percentile_cs"]
    assert healthy["non_accrual_rate"]["percentile_cs"] > trap["non_accrual_rate"]["percentile_cs"]
    assert out["HEALTHY"]["security_score"] > out["TRAP"]["security_score"]


def test_bdc_higher_coverage_ranks_higher():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("COVERED", "preco_vs_mm50"): 0.04,
        ("THIN", "preco_vs_mm50"): 0.04,
        ("COVERED", "preco_vs_mm200"): 0.05,
        ("THIN", "preco_vs_mm200"): 0.05,
    }
    edgar = {
        ("COVERED", "nav_per_share"): 20.0,
        ("THIN", "nav_per_share"): 20.0,
        ("COVERED", "non_accrual_rate"): 2.0,
        ("THIN", "non_accrual_rate"): 2.0,
        ("COVERED", "nii_coverage"): 1.25,
        ("THIN", "nii_coverage"): 0.85,
    }

    with (
        patch(
            "motor.src.calculo.bdc_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.bdc_security_score.get_edgar_metric_at",
            side_effect=_fake_edgar(edgar, []),
        ),
        patch(
            "motor.src.calculo.bdc_security_score._price_at",
            return_value=20.0,
        ),
    ):
        out = compute_bdc_security_batch(["COVERED", "THIN"], as_of=as_of)

    covered = {c["id"]: c for c in out["COVERED"]["componentes"]}
    thin = {c["id"]: c for c in out["THIN"]["componentes"]}
    assert covered["nii_coverage"]["percentile_cs"] > thin["nii_coverage"]["percentile_cs"]
    assert out["COVERED"]["security_score"] > out["THIN"]["security_score"]


def test_bdc_missing_edgar_sits_at_median():
    as_of = dt.date(2026, 8, 14)
    table = {
        ("ARCC", "preco_vs_mm50"): 0.04,
        ("HYG", "preco_vs_mm50"): 0.04,
        ("ARCC", "preco_vs_mm200"): 0.05,
        ("HYG", "preco_vs_mm200"): 0.05,
    }
    edgar = {
        ("ARCC", "nav_per_share"): 20.0,
        ("ARCC", "non_accrual_rate"): 1.5,
        ("ARCC", "nii_coverage"): 1.05,
    }

    with (
        patch(
            "motor.src.calculo.bdc_security_score.get_tecnico_series",
            side_effect=_fake_tecnico(as_of, table),
        ),
        patch(
            "motor.src.calculo.bdc_security_score.get_edgar_metric_at",
            side_effect=_fake_edgar(edgar, []),
        ),
        patch(
            "motor.src.calculo.bdc_security_score._price_at",
            return_value=19.0,
        ),
    ):
        out = compute_bdc_security_batch(["ARCC", "HYG"], as_of=as_of)

    hyg = {c["id"]: c for c in out["HYG"]["componentes"]}
    assert hyg["nav_premium_discount"]["percentile_cs"] == 0.5
    assert hyg["non_accrual_rate"]["percentile_cs"] == 0.5
    assert hyg["nii_coverage"]["percentile_cs"] == 0.5
    assert hyg["nav_premium_discount"]["valor"] is None


def test_parse_nii_coverage_ratio_and_percent():
    html_x = "Net investment income covered the dividend 1.14x in the quarter."
    assert _parse_nii_coverage_from_html(html_x) == 1.14
    html_pct = "Dividend coverage was 114% of net investment income."
    # "114%" via coverage pattern may parse 114 → 1.14
    parsed = _parse_nii_coverage_from_html(html_pct)
    assert parsed is not None
    assert abs(parsed - 1.14) < 1e-6
    html_ps = (
        "Net investment income per share of $0.48. Regular dividend of $0.40 per share."
    )
    assert abs(_parse_nii_coverage_from_html(html_ps) - 1.2) < 1e-6


def test_parse_non_accrual_percent():
    html = "Investments on non-accrual status were 1.8% of the portfolio at fair value."
    assert _parse_non_accrual_from_html(html) == 1.8
