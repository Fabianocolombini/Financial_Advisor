"""Central registry for two-layer class models (regime + security)."""

from __future__ import annotations

import datetime as dt
from typing import Any, Callable

from motor.src.config_loader import resolve_aba_config_id

RegimeFn = Callable[[dt.date | None], dict[str, Any]]
AbaResultFn = Callable[[str, dt.date | None], dict[str, Any]]
BackfillFn = Callable[[int], int]
SecurityBatchFn = Callable[..., dict[str, dict[str, Any]]]

_CLASS_REGISTRY: dict[str, dict[str, Any]] = {}


def _register(
    aba_id: str,
    *,
    compute_regime: RegimeFn,
    regime_aba_result: AbaResultFn,
    backfill: BackfillFn,
    security_batch: SecurityBatchFn,
    score_key: str,
    export_flags: dict[str, str] | None = None,
) -> None:
    _CLASS_REGISTRY[resolve_aba_config_id(aba_id)] = {
        "compute_regime": compute_regime,
        "regime_aba_result": regime_aba_result,
        "backfill": backfill,
        "security_batch": security_batch,
        "score_key": score_key,
        "export_flags": export_flags or {},
    }


def _load_registry() -> None:
    if _CLASS_REGISTRY:
        return
    from motor.src.calculo.models.cash_regime_model import (
        backfill_cash_regime_scores,
        cash_regime_aba_result,
        compute_cash_regime,
    )
    from motor.src.calculo.cash_security_score import compute_cash_security_batch
    from motor.src.calculo.models.treasury_regime_model import (
        backfill_treasury_regime_scores,
        compute_treasury_regime,
        treasury_regime_aba_result,
    )
    from motor.src.calculo.treasury_security_score import compute_treasury_security_batch
    from motor.src.calculo.models.ig_regime_model import (
        backfill_ig_regime_scores,
        compute_ig_regime,
        ig_regime_aba_result,
    )
    from motor.src.calculo.ig_security_score import compute_ig_security_batch
    from motor.src.calculo.models.hy_regime_model import (
        backfill_hy_regime_scores,
        compute_hy_regime,
        hy_regime_aba_result,
    )
    from motor.src.calculo.hy_security_score import compute_hy_security_batch
    from motor.src.calculo.models.tips_regime_model import (
        backfill_tips_regime_scores,
        compute_tips_regime,
        tips_regime_aba_result,
    )
    from motor.src.calculo.tips_security_score import compute_tips_security_batch
    from motor.src.calculo.models.preferred_regime_model import (
        backfill_preferred_regime_scores,
        compute_preferred_regime,
        preferred_regime_aba_result,
    )
    from motor.src.calculo.preferred_security_score import compute_preferred_security_batch
    from motor.src.calculo.models.us_equity_regime_model import (
        backfill_us_equity_regime_scores,
        compute_us_equity_regime,
        us_equity_regime_aba_result,
    )
    from motor.src.calculo.us_equity_security_score import compute_us_equity_security_batch
    from motor.src.calculo.models.intl_equity_regime_model import (
        backfill_intl_equity_regime_scores,
        compute_intl_equity_regime,
        intl_equity_regime_aba_result,
    )
    from motor.src.calculo.intl_equity_security_score import compute_intl_equity_security_batch
    from motor.src.calculo.models.em_equity_regime_model import (
        backfill_em_equity_regime_scores,
        compute_em_equity_regime,
        em_equity_regime_aba_result,
    )
    from motor.src.calculo.em_equity_security_score import compute_em_equity_security_batch
    from motor.src.calculo.models.reits_regime_model import (
        backfill_reits_regime_scores,
        compute_reits_regime,
        reits_regime_aba_result,
    )
    from motor.src.calculo.reits_security_score import compute_reits_security_batch
    from motor.src.calculo.models.commodities_precious_regime_model import (
        backfill_commodities_precious_regime_scores,
        compute_commodities_precious_regime,
        commodities_precious_regime_aba_result,
    )
    from motor.src.calculo.commodities_precious_security_score import (
        compute_commodities_precious_security_batch,
    )
    from motor.src.calculo.models.commodities_energy_regime_model import (
        backfill_commodities_energy_regime_scores,
        compute_commodities_energy_regime,
        commodities_energy_regime_aba_result,
    )
    from motor.src.calculo.commodities_energy_security_score import (
        compute_commodities_energy_security_batch,
    )
    from motor.src.calculo.models.energy_mlp_regime_model import (
        backfill_energy_mlp_regime_scores,
        compute_energy_mlp_regime,
        energy_mlp_regime_aba_result,
    )
    from motor.src.calculo.energy_mlp_security_score import compute_energy_mlp_security_batch
    from motor.src.calculo.models.healthcare_biotech_regime_model import (
        backfill_healthcare_biotech_regime_scores,
        compute_healthcare_biotech_regime,
        healthcare_biotech_regime_aba_result,
    )
    from motor.src.calculo.healthcare_biotech_security_score import (
        compute_healthcare_biotech_security_batch,
    )
    from motor.src.calculo.models.bdc_regime_model import (
        backfill_bdc_regime_scores,
        bdc_regime_aba_result,
        compute_bdc_regime,
    )
    from motor.src.calculo.bdc_security_score import compute_bdc_security_batch
    from motor.src.calculo.models.alt_infrastructure_regime_model import (
        alt_infrastructure_regime_aba_result,
        backfill_alt_infrastructure_regime_scores,
        compute_alt_infrastructure_regime,
    )
    from motor.src.calculo.alt_infrastructure_security_score import (
        compute_alt_infrastructure_security_batch,
    )
    from motor.src.calculo.models.fx_regime_model import (
        backfill_fx_regime_scores,
        compute_fx_regime,
        fx_regime_aba_result,
    )
    from motor.src.calculo.fx_security_score import compute_fx_security_batch

    entries = [
        ("cash_equivalents", compute_cash_regime, cash_regime_aba_result, backfill_cash_regime_scores, compute_cash_security_batch, "cash_regime_score", {"stressFlag": "stress_flag"}),
        ("fi_treasury", compute_treasury_regime, treasury_regime_aba_result, backfill_treasury_regime_scores, compute_treasury_security_batch, "treasury_regime_score", {"flightToQualityFlag": "flight_to_quality_flag", "inflationShockFlag": "inflation_shock_flag"}),
        ("fi_ig", compute_ig_regime, ig_regime_aba_result, backfill_ig_regime_scores, compute_ig_security_batch, "ig_regime_score", {"creditEventFlag": "credit_event_flag"}),
        ("fi_hy", compute_hy_regime, hy_regime_aba_result, backfill_hy_regime_scores, compute_hy_security_batch, "hy_regime_score", {"hyStressFlag": "hy_stress_flag"}),
        ("fi_tips", compute_tips_regime, tips_regime_aba_result, backfill_tips_regime_scores, compute_tips_security_batch, "tips_regime_score", {"tipsLiquidityFlag": "tips_liquidity_flag"}),
        ("fi_preferred", compute_preferred_regime, preferred_regime_aba_result, backfill_preferred_regime_scores, compute_preferred_security_batch, "preferred_regime_score", {"bankStressFlag": "bank_stress_flag", "sloosReferenceDate": "sloos_reference_date"}),
        ("us_equity", compute_us_equity_regime, us_equity_regime_aba_result, backfill_us_equity_regime_scores, compute_us_equity_security_batch, "us_equity_regime_score", {"recessionWarningFlag": "recession_warning_flag"}),
        ("intl_equity", compute_intl_equity_regime, intl_equity_regime_aba_result, backfill_intl_equity_regime_scores, compute_intl_equity_security_batch, "intl_equity_regime_score", {}),
        ("em_equity", compute_em_equity_regime, em_equity_regime_aba_result, backfill_em_equity_regime_scores, compute_em_equity_security_batch, "em_equity_regime_score", {"emStressFlag": "em_stress_flag"}),
        ("reits", compute_reits_regime, reits_regime_aba_result, backfill_reits_regime_scores, compute_reits_security_batch, "reits_regime_score", {}),
        ("commodities_precious", compute_commodities_precious_regime, commodities_precious_regime_aba_result, backfill_commodities_precious_regime_scores, compute_commodities_precious_security_batch, "commodities_precious_regime_score", {}),
        ("commodities_energy", compute_commodities_energy_regime, commodities_energy_regime_aba_result, backfill_commodities_energy_regime_scores, compute_commodities_energy_security_batch, "commodities_energy_regime_score", {}),
        ("energy_mlp", compute_energy_mlp_regime, energy_mlp_regime_aba_result, backfill_energy_mlp_regime_scores, compute_energy_mlp_security_batch, "energy_mlp_regime_score", {}),
        ("healthcare_biotech", compute_healthcare_biotech_regime, healthcare_biotech_regime_aba_result, backfill_healthcare_biotech_regime_scores, compute_healthcare_biotech_security_batch, "healthcare_biotech_regime_score", {}),
        ("credito_alternativo", compute_bdc_regime, bdc_regime_aba_result, backfill_bdc_regime_scores, compute_bdc_security_batch, "bdc_regime_score", {"navStressFlag": "bdc_credit_stress_flag"}),
        ("alt_infrastructure", compute_alt_infrastructure_regime, alt_infrastructure_regime_aba_result, backfill_alt_infrastructure_regime_scores, compute_alt_infrastructure_security_batch, "alt_infrastructure_regime_score", {}),
        ("currencies", compute_fx_regime, fx_regime_aba_result, backfill_fx_regime_scores, compute_fx_security_batch, "fx_regime_score", {"outputType": "output_type"}),
    ]
    for aba_id, cr, ar, bf, sb, sk, flags in entries:
        _register(aba_id, compute_regime=cr, regime_aba_result=ar, backfill=bf, security_batch=sb, score_key=sk, export_flags=flags)


def get_class_model_entry(aba_id: str) -> dict[str, Any] | None:
    _load_registry()
    return _CLASS_REGISTRY.get(resolve_aba_config_id(aba_id))


def regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    entry = get_class_model_entry(aba_id)
    if not entry:
        raise KeyError(f"No class model for aba {aba_id}")
    return entry["regime_aba_result"](aba_id, as_of)


def backfill_class_regime_scores(aba_id: str, days: int = 120) -> int:
    entry = get_class_model_entry(aba_id)
    if not entry:
        raise KeyError(f"No class model for aba {aba_id}")
    return entry["backfill"](days)


def compute_security_batch(
    aba_id: str,
    tickers: list[str],
    universe_tickers: list[str] | None = None,
    as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    entry = get_class_model_entry(aba_id)
    if not entry:
        raise KeyError(f"No class model for aba {aba_id}")
    return entry["security_batch"](tickers, universe_tickers=universe_tickers, as_of=as_of)


def export_regime_model_snapshot(aba_id: str) -> dict[str, Any] | None:
    entry = get_class_model_entry(aba_id)
    if not entry:
        return None
    regime = entry["compute_regime"]()
    score_key = entry["score_key"]
    out: dict[str, Any] = {
        "model": regime.get("model"),
        "score": regime.get(score_key) or regime.get("score_composto"),
        "action": regime.get("regime_action"),
        "actionCalculated": regime.get("regime_action_calculated"),
        "stressFlag": regime.get("stress_flag"),
        "calibrated": regime.get("calibrated"),
        "calibrationNote": regime.get("calibration_note"),
        "explanation": regime.get("explanation"),
        "components": regime.get("componentes"),
        "outputType": regime.get("output_type", "allocation"),
    }
    for export_key, regime_key in entry.get("export_flags", {}).items():
        out[export_key] = regime.get(regime_key)
    return out
