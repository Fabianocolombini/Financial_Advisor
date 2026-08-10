"""Shared helpers for class regime model outputs."""

from __future__ import annotations

from typing import Any

from motor.src.calculo.models.cash_regime_model import regime_action_to_estagio


def pace_action_from_score(
    score: float, thresholds: dict[str, float], labels: dict[str, str]
) -> str:
    if score >= thresholds.get("accelerate", 0.65):
        return labels.get("accelerate", "Acelerar")
    if score >= thresholds.get("base", 0.45):
        return labels.get("base", "Ritmo base")
    if score >= thresholds.get("decelerate", 0.25):
        return labels.get("decelerate", "Desacelerar")
    return labels.get("pause", "Pausar")


def build_regime_result(
    *,
    aba_id: str,
    nome: str,
    score: float,
    score_key: str,
    regime_action: str,
    action_calc: str,
    componentes: list[dict[str, Any]],
    model: str,
    explanation: list[str],
    calibrated: bool,
    calibration_note: str = "",
    stress_flag: bool = False,
    output_type: str = "allocation",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    dominant = max(
        [c for c in componentes if float(c.get("peso", 0) or 0) > 0],
        key=lambda c: abs(float(c.get("contribuicao", 0) or 0)),
        default=None,
    )
    out: dict[str, Any] = {
        "aba_id": aba_id,
        "nome": nome,
        "data": None,
        "score_composto": score,
        score_key: score,
        "regime_action": regime_action,
        "regime_action_calculated": action_calc,
        "stress_flag": stress_flag,
        "estagio": regime_action_to_estagio(regime_action)
        if output_type == "allocation"
        else _pace_to_estagio(regime_action),
        "componentes": componentes,
        "indicador_dominante": dominant,
        "calibrated": calibrated,
        "calibration_note": calibration_note,
        "model": model,
        "explanation": explanation,
        "output_type": output_type,
    }
    if extra:
        out.update(extra)
    return out


def _pace_to_estagio(action: str) -> str:
    mapping = {
        "Acelerar": "Ascendente",
        "Ritmo base": "Maduro",
        "Desacelerar": "Descendente",
        "Pausar": "ForteDescendente",
    }
    return mapping.get(action, "Maduro")
