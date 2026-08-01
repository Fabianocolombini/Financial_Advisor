"""Cycle stage classification from score history."""

from __future__ import annotations

import datetime as dt
from typing import Any

import numpy as np

from motor.src.config_loader import load_aba_config
from motor.src.db.connection import get_connection


def classify_slope(slope: float, limiar_up: float, limiar_down: float) -> str:
    if slope > limiar_up:
        return "Ascendente"
    if slope < limiar_down:
        return "Descendente"
    return "Maduro"


def regressao_slope(aba_id: str, dias: int) -> tuple[float, list[tuple[str, float]]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT data, score_composto FROM scores_historico
            WHERE aba_id = ?
            ORDER BY data DESC
            LIMIT ?
            """,
            (aba_id, dias),
        ).fetchall()
    if len(rows) < 5:
        return 0.0, []
    # oldest first for regression
    points = [(r["data"], float(r["score_composto"])) for r in reversed(rows)]
    y = np.array([p[1] for p in points])
    x = np.arange(len(y))
    if len(y) < 2:
        return 0.0, points
    coeffs = np.polyfit(x, y, 1)
    slope = float(coeffs[0])
    return slope, points


def estagio_from_score(score: float, limiar_up: float, limiar_down: float) -> str:
    """Instant stage proxy when history is thin."""
    if score > limiar_up:
        return "Ascendente"
    if score < limiar_down:
        return "Descendente"
    return "Maduro"


def compute_estagio_aba(aba_id: str) -> dict[str, Any]:
    aba = load_aba_config(aba_id)
    cfg = aba.get("estagio", {})
    dias = int(cfg.get("regressao_dias", 90))
    lim_up = float(cfg.get("limiar_ascendente", 0.02))
    lim_down = float(cfg.get("limiar_descendente", -0.02))

    slope, history = regressao_slope(aba_id, dias)
    estagio = classify_slope(slope, lim_up, lim_down)

    return {
        "aba_id": aba_id,
        "estagio": estagio,
        "slope": slope,
        "regressao_dias": dias,
        "history_points": len(history),
    }


def estagio_ativo(score: float) -> str:
    if score > 0.3:
        return "Ascendente"
    if score < -0.3:
        return "Descendente"
    return "Maduro"


def diverge_categoria(
    estagio_aba: str,
    estagio_ativo: str,
    score_aba: float | None = None,
    score_ativo: float | None = None,
) -> bool:
    opposites = {
        ("Ascendente", "Descendente"),
        ("Descendente", "Ascendente"),
    }
    if (estagio_aba, estagio_ativo) in opposites:
        return True
    if score_aba is not None and score_ativo is not None:
        # Granularidade: papel materialmente melhor/pior que a categoria agregada
        if score_aba < -0.1 and score_ativo > 0.15:
            return True
        if score_aba > 0.1 and score_ativo < -0.15:
            return True
    return False
