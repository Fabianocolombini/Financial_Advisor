"""Score domains and thresholds per aba.

Two-layer classes (regime + security models) emit cross-sectional percentile ranks
in [0, 1], where 0.5 means "median instrument among peers". Legacy abas emit signed
z-score composites in [-1, +1], where the sign is directional.

Comparing a unit score against an absolute threshold such as `score > 0.1` is
meaningless: almost every valid rank passes, which is why entry validation used to
approve virtually every cash instrument.
"""

from __future__ import annotations

from typing import Any

from motor.src.config_loader import is_class_model_aba, resolve_aba_config_id

UNIT = "unit"
SIGNED = "signed"

# Percentile bands used by the security models (see *_security_score.py).
UNIT_SECURITY_THRESHOLDS = {"strong": 0.65, "median": 0.5, "weak": 0.25}
SIGNED_SECURITY_THRESHOLDS = {"strong": 0.3, "median": 0.0, "weak": -0.3}

# Allocation bands used by the regime models (see config/models/*_regime.json).
UNIT_REGIME_THRESHOLDS = {"overweight": 0.65, "hold": 0.45, "reduce": 0.25}
SIGNED_REGIME_THRESHOLDS = {"overweight": 0.3, "hold": -0.3, "reduce": -0.6}

# Classes whose instruments are NAV-flat by construction: momentum and price
# extension carry no timing information.
STABILITY_FOCUSED_ABAS = {"cash_equivalents"}


def score_domain_for_aba(aba_id: str) -> str:
    return UNIT if is_class_model_aba(aba_id) else SIGNED


def security_thresholds(aba_id: str) -> dict[str, float]:
    return (
        UNIT_SECURITY_THRESHOLDS
        if score_domain_for_aba(aba_id) == UNIT
        else SIGNED_SECURITY_THRESHOLDS
    )


def regime_thresholds(aba_id: str) -> dict[str, float]:
    return (
        UNIT_REGIME_THRESHOLDS
        if score_domain_for_aba(aba_id) == UNIT
        else SIGNED_REGIME_THRESHOLDS
    )


def is_stability_focused(aba_id: str) -> bool:
    return resolve_aba_config_id(aba_id) in STABILITY_FOCUSED_ABAS


def instrument_quality(aba_id: str, score: float) -> str:
    """Preferred / Competitive / Weak — relative rank, never a Buy/Sell signal."""
    thr = security_thresholds(aba_id)
    if score >= thr["strong"]:
        return "Preferred"
    if score >= thr["weak"]:
        return "Competitive"
    return "Weak"


CANONICAL_ACTIONS = ("Overweight", "Hold", "Reduce", "Strong Reduce")

# Each regime model publishes labels from its own vocabulary (allocation models use
# Overweight/Hold/Reduce, pace models use Acelerar/Manter/Pausar/Reverter). The UI
# reasons about a single 4-value scale, so map them here instead of leaking model
# specific wording into the decision layer.
_ACTION_ALIASES = {
    "overweight": "Overweight",
    "accumulate": "Overweight",
    "acumular": "Overweight",
    "accelerate": "Overweight",
    "acelerar": "Overweight",
    "hold": "Hold",
    "manter": "Hold",
    "base": "Hold",
    "neutral": "Hold",
    "neutro": "Hold",
    "reduce": "Reduce",
    "reduzir": "Reduce",
    "decelerate": "Reduce",
    "desacelerar": "Reduce",
    "pausar": "Reduce",
    "pause": "Reduce",
    "strong reduce": "Strong Reduce",
    "reduzir forte": "Strong Reduce",
    "reverter": "Strong Reduce",
    "reverse": "Strong Reduce",
    "stop": "Strong Reduce",
    "exit": "Strong Reduce",
}


def normalize_allocation_action(action: str | None) -> str | None:
    """Map a model-specific action label onto the canonical 4-value scale."""
    if not action:
        return None
    return _ACTION_ALIASES.get(action.strip().lower())


def allocation_action(aba_id: str, score: float, regime_action: str | None = None) -> str:
    """Overweight / Hold / Reduce / Strong Reduce for the sleeve."""
    normalized = normalize_allocation_action(regime_action)
    if normalized:
        return normalized
    thr = regime_thresholds(aba_id)
    if score >= thr["overweight"]:
        return "Overweight"
    if score >= thr["hold"]:
        return "Hold"
    if score >= thr["reduce"]:
        return "Reduce"
    return "Strong Reduce"


def estagio_to_action(estagio: str | None) -> str:
    mapping = {
        "Ascendente": "Overweight",
        "Maduro": "Hold",
        "Descendente": "Reduce",
        "ForteDescendente": "Strong Reduce",
    }
    return mapping.get(estagio or "", "Hold")


def export_decision_fields(payload: dict[str, Any]) -> dict[str, Any]:
    """Keys consumed by the Next.js decision summary."""
    return {
        "scoreDomain": payload.get("score_domain"),
        "allocationAction": payload.get("allocation_action"),
        "instrumentQuality": payload.get("instrument_quality"),
        "entryTiming": payload.get("entry_timing"),
        "entryReasons": payload.get("entry_reasons", []),
        "peerMedian": payload.get("peer_median"),
    }
