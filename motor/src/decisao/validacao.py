"""Entry validation — when a paper is validated for incremental purchase (educational)."""

from __future__ import annotations

from typing import Any


def dominant_component(componentes: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not componentes:
        return None
    best = max(componentes, key=lambda c: abs(float(c.get("contribuicao", 0) or 0)))
    return {
        "id": best.get("id", ""),
        "name": best.get("nome", best.get("id", "")),
        "contribution": float(best.get("contribuicao", 0) or 0),
        "value": best.get("valor"),
    }


def validate_class_entry(
    estagio_aba: str,
    score_aba: float,
    dominant: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Class-level entry validation (sleeve timing)."""
    rationale: list[str] = []
    entry_validated = False

    if estagio_aba == "Ascendente":
        entry_validated = True
        rationale.append("Class sleeve is in Accumulate regime (positive score slope).")
    elif estagio_aba == "Maduro" and score_aba > 0.05:
        entry_validated = True
        rationale.append("Class score is positive in a Hold regime — gradual adds possible.")
    elif estagio_aba == "Descendente":
        rationale.append("Class sleeve is in Reduce regime — avoid adding at sleeve level.")

    if dominant and dominant.get("name"):
        rationale.append(
            f"Dominant driver: {dominant['name']} "
            f"(contribution {dominant.get('contribution', 0):.3f})."
        )

    return {
        "entryValidated": entry_validated,
        "rationale": rationale,
        "dominantIndicator": dominant,
    }


def validate_ticker_entry(
    estagio_aba: str,
    estagio_ativo: str,
    score_aba: float,
    score_ativo: float,
    diverge: bool,
    dominant: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Ticker-level entry validation aligned with guia-decisao-entrada-por-sleeve.md:
    - Ascendente on paper → validated
    - Maduro + positive score or positive divergence → validated
    - Descendente on class but paper diverges positively → validated
    - Descendente on paper without divergence → not validated
    """
    rationale: list[str] = []
    entry_validated = False

    if estagio_ativo == "Ascendente":
        entry_validated = True
        rationale.append("Ticker is in Accumulate stage (composite score above threshold).")
    elif estagio_ativo == "Maduro":
        if score_ativo > 0.1:
            entry_validated = True
            rationale.append("Ticker score is positive in Hold stage.")
        elif diverge and score_ativo > score_aba:
            entry_validated = True
            rationale.append("Ticker diverges positively from class while in Hold stage.")
    elif estagio_ativo == "Descendente":
        if diverge and score_ativo > 0:
            entry_validated = True
            rationale.append("Class unfavorable but ticker diverges positively — selective entry.")
        else:
            rationale.append("Ticker is in Reduce stage — entry not validated.")

    if estagio_aba == "Descendente" and not diverge and estagio_ativo != "Ascendente":
        entry_validated = False
        rationale.append("Class sleeve is Reduce without positive ticker divergence.")

    if estagio_aba == "Ascendente" and estagio_ativo in ("Ascendente", "Maduro") and score_ativo > 0:
        if not any("Class sleeve supports" in r for r in rationale):
            rationale.insert(0, "Class sleeve supports adding exposure.")
        entry_validated = True

    if dominant and dominant.get("name"):
        rationale.append(
            f"Dominant driver: {dominant['name']} "
            f"(contribution {dominant.get('contribution', 0):.3f})."
        )

    return {
        "entryValidated": entry_validated,
        "rationale": rationale,
        "dominantIndicator": dominant,
    }
