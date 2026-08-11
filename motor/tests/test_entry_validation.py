"""Entry validation must respect the score domain of each class.

Two-layer classes emit percentile ranks in [0, 1]. Absolute tests such as
`score > 0.1` approve nearly the whole universe there, which is why a merely
median cash instrument used to report "Validated".
"""

from __future__ import annotations

from motor.src.decisao.score_domain import (
    allocation_action,
    instrument_quality,
    is_stability_focused,
    normalize_allocation_action,
    score_domain_for_aba,
)
from motor.src.decisao.validacao import validate_class_entry, validate_ticker_entry


def test_score_domain_by_class():
    assert score_domain_for_aba("cash_equivalents") == "unit"
    assert score_domain_for_aba("us_equity") == "unit"
    assert score_domain_for_aba("aba_inexistente") == "signed"


def test_only_cash_is_stability_focused():
    assert is_stability_focused("cash_equivalents") is True
    assert is_stability_focused("us_equity") is False


def test_instrument_quality_uses_unit_bands():
    assert instrument_quality("cash_equivalents", 0.70) == "Preferred"
    assert instrument_quality("cash_equivalents", 0.40) == "Competitive"
    assert instrument_quality("cash_equivalents", 0.10) == "Weak"


def test_allocation_action_uses_regime_bands():
    assert allocation_action("cash_equivalents", 0.70) == "Overweight"
    assert allocation_action("cash_equivalents", 0.50) == "Hold"
    assert allocation_action("cash_equivalents", 0.30) == "Reduce"
    assert allocation_action("cash_equivalents", 0.10) == "Strong Reduce"
    assert allocation_action("cash_equivalents", 0.10, regime_action="Hold") == "Hold"


def test_pace_model_labels_map_onto_the_allocation_scale():
    # Pace models (currencies) publish their own vocabulary; the decision layer
    # only understands the canonical four.
    assert normalize_allocation_action("Pausar") == "Reduce"
    assert normalize_allocation_action("Acelerar") == "Overweight"
    assert normalize_allocation_action("Manter") == "Hold"
    assert normalize_allocation_action("Reverter") == "Strong Reduce"
    assert normalize_allocation_action("Accumulate") == "Overweight"
    assert normalize_allocation_action(None) is None


def test_unknown_action_label_falls_back_to_score_thresholds():
    # An unrecognised label must not leak into the UI as an allocation stance.
    assert normalize_allocation_action("Rebalancear trimestralmente") is None
    assert allocation_action("cash_equivalents", 0.70, regime_action="Vender tudo") == "Overweight"


def test_below_median_cash_instrument_is_not_validated():
    result = validate_ticker_entry(
        "Maduro",
        "Maduro",
        score_aba=0.52,
        score_ativo=0.40,
        diverge=False,
        aba_id="cash_equivalents",
        regime_action="Hold",
    )
    assert result["entryValidated"] is False
    assert result["instrumentQuality"] == "Competitive"
    assert result["peerMedian"] == 0.5


def test_above_median_cash_instrument_is_validated():
    result = validate_ticker_entry(
        "Maduro",
        "Maduro",
        score_aba=0.52,
        score_ativo=0.72,
        diverge=False,
        aba_id="cash_equivalents",
        regime_action="Hold",
    )
    assert result["entryValidated"] is True
    assert result["instrumentQuality"] == "Preferred"


def test_cash_entry_timing_is_neutral_when_sleeve_holds():
    result = validate_ticker_entry(
        "Maduro",
        "Maduro",
        score_aba=0.52,
        score_ativo=0.72,
        diverge=False,
        aba_id="cash_equivalents",
        regime_action="Hold",
    )
    assert result["entryTiming"] == "Neutral"
    assert any("estável por construção" in r for r in result["entryReasons"])


def test_cash_entry_timing_buys_when_sleeve_overweight():
    result = validate_ticker_entry(
        "Ascendente",
        "Ascendente",
        score_aba=0.80,
        score_ativo=0.72,
        diverge=False,
        aba_id="cash_equivalents",
        regime_action="Overweight",
    )
    assert result["entryTiming"] == "Buy"


def test_reduce_sleeve_blocks_entry_unless_leading_peer():
    blocked = validate_ticker_entry(
        "Descendente",
        "Maduro",
        score_aba=0.30,
        score_ativo=0.55,
        diverge=False,
        aba_id="cash_equivalents",
        regime_action="Reduce",
    )
    assert blocked["entryValidated"] is False
    assert blocked["entryTiming"] == "Avoid"

    selective = validate_ticker_entry(
        "Descendente",
        "Ascendente",
        score_aba=0.30,
        score_ativo=0.90,
        diverge=True,
        aba_id="cash_equivalents",
        regime_action="Reduce",
    )
    assert selective["entryValidated"] is True
    assert selective["entryTiming"] == "Wait"


def test_class_entry_uses_regime_threshold_on_unit_domain():
    below = validate_class_entry(
        "Maduro", 0.30, aba_id="cash_equivalents", regime_action="Hold"
    )
    assert below["entryValidated"] is False

    above = validate_class_entry(
        "Maduro", 0.55, aba_id="cash_equivalents", regime_action="Hold"
    )
    assert above["entryValidated"] is True

    overweight = validate_class_entry(
        "Ascendente", 0.80, aba_id="cash_equivalents", regime_action="Overweight"
    )
    assert overweight["entryValidated"] is True


def test_signed_domain_keeps_legacy_stage_rules():
    result = validate_ticker_entry(
        "Maduro",
        "Ascendente",
        score_aba=0.2,
        score_ativo=0.45,
        diverge=False,
    )
    assert result["scoreDomain"] == "signed"
    assert result["entryValidated"] is True
