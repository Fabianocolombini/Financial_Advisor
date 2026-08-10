"""Tests for new class mathematical models (11 sleeves)."""

from __future__ import annotations

import pytest

from motor.src.calculo.models.cash_regime_model import _min_action
from motor.src.calculo.models.us_equity_regime_model import compute_us_equity_regime
from motor.src.calculo.models.intl_equity_regime_model import compute_intl_equity_regime
from motor.src.calculo.models.em_equity_regime_model import compute_em_equity_regime
from motor.src.calculo.models.reits_regime_model import compute_reits_regime
from motor.src.calculo.models.commodities_precious_regime_model import compute_commodities_precious_regime
from motor.src.calculo.models.commodities_energy_regime_model import compute_commodities_energy_regime
from motor.src.calculo.models.energy_mlp_regime_model import compute_energy_mlp_regime
from motor.src.calculo.models.healthcare_biotech_regime_model import compute_healthcare_biotech_regime
from motor.src.calculo.models.bdc_regime_model import compute_bdc_regime
from motor.src.calculo.models.alt_infrastructure_regime_model import compute_alt_infrastructure_regime
from motor.src.calculo.models.fx_regime_model import compute_fx_regime
from motor.src.config_loader import is_class_model_aba


@pytest.mark.parametrize(
    "aba_id,score_key,model_name",
    [
        ("us_equity", "us_equity_regime_score", "us_equity_regime_v1"),
        ("intl_equity", "intl_equity_regime_score", "intl_equity_regime_v1"),
        ("em_equity", "em_equity_regime_score", "em_equity_regime_v1"),
        ("reits", "reits_regime_score", "reits_regime_v1"),
        ("commodities_precious", "commodities_precious_regime_score", "commodities_precious_regime_v1"),
        ("commodities_energy", "commodities_energy_regime_score", "commodities_energy_regime_v1"),
        ("energy_mlp", "energy_mlp_regime_score", "energy_mlp_regime_v1"),
        ("healthcare_biotech", "healthcare_biotech_regime_score", "healthcare_biotech_regime_v1"),
        ("credito_alternativo", "bdc_regime_score", "bdc_regime_v1"),
        ("alt_infrastructure", "alt_infrastructure_regime_score", "alt_infrastructure_regime_v1"),
        ("currencies", "fx_regime_score", "fx_regime_v1"),
    ],
)
def test_regime_models_return_core_fields(aba_id, score_key, model_name):
    assert is_class_model_aba(aba_id)
    compute_fns = {
        "us_equity": compute_us_equity_regime,
        "intl_equity": compute_intl_equity_regime,
        "em_equity": compute_em_equity_regime,
        "reits": compute_reits_regime,
        "commodities_precious": compute_commodities_precious_regime,
        "commodities_energy": compute_commodities_energy_regime,
        "energy_mlp": compute_energy_mlp_regime,
        "healthcare_biotech": compute_healthcare_biotech_regime,
        "credito_alternativo": compute_bdc_regime,
        "alt_infrastructure": compute_alt_infrastructure_regime,
        "currencies": compute_fx_regime,
    }
    result = compute_fns[aba_id]()
    assert result["model"] == model_name
    assert score_key in result
    assert "regime_action" in result
    assert result.get("calibrated") is False
    assert isinstance(result.get("componentes"), list)


def test_us_equity_recession_override_caps_at_reduce():
    assert _min_action("Overweight", "Reduce") == "Reduce"


def test_em_stress_override_caps_at_strong_reduce():
    assert _min_action("Overweight", "Strong Reduce") == "Strong Reduce"


def test_fx_regime_uses_pace_output():
    result = compute_fx_regime()
    assert result.get("output_type") == "pace"
    assert result["regime_action"] in {"Acelerar", "Ritmo base", "Desacelerar", "Pausar"}


def test_fx_pace_actions_not_allocation():
    result = compute_fx_regime()
    assert result["regime_action"] not in {"Overweight", "Hold", "Reduce", "Strong Reduce"}
