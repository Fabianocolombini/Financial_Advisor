"""Entry validation — when a paper is eligible for incremental purchase (educational).

`entryValidated` answers eligibility, never timing. The UI must not present it as a
purchase instruction, and this module must not approve an instrument merely because
its score is above zero: on the two-layer models the score is a percentile rank in
[0, 1], so `score > 0.1` approves almost the whole universe.
"""

from __future__ import annotations

from typing import Any

from motor.src.decisao.score_domain import (
    UNIT,
    allocation_action,
    estagio_to_action,
    instrument_quality,
    is_stability_focused,
    normalize_allocation_action,
    regime_thresholds,
    score_domain_for_aba,
    security_thresholds,
)

ACTION_PT = {
    "Overweight": "Sobrepeso",
    "Hold": "Manter",
    "Reduce": "Reduzir",
    "Strong Reduce": "Reduzir com convicção",
}


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


def _entry_timing(
    aba_id: str,
    allocation: str,
    quality: str,
    diverge: bool,
) -> tuple[str, list[str]]:
    """
    Motor-level entry timing. The app refines this with price structure
    (Bollinger position, trend, moving averages); here we only use what the
    motor itself knows.
    """
    reasons: list[str] = []
    allocation_pt = ACTION_PT.get(allocation, allocation)

    if allocation in ("Reduce", "Strong Reduce"):
        reasons.append(
            f"A alocação da classe está em {allocation_pt} — dinheiro novo entra "
            "contra o regime do sleeve."
        )
        if not (diverge and quality == "Preferred"):
            return "Avoid", reasons
        reasons.append(
            "O papel diverge positivamente da classe — entrada apenas seletiva."
        )
        return "Wait", reasons

    if quality == "Weak":
        reasons.append("O papel está na faixa inferior do ranking contra os pares.")
        return "Wait", reasons

    if is_stability_focused(aba_id):
        if allocation == "Overweight":
            reasons.append(
                "O sleeve de caixa está em Sobrepeso e o papel ranqueia bem entre os "
                "pares — aporte conforme a necessidade de liquidez."
            )
            return "Buy", reasons
        reasons.append(
            "O NAV de caixa é estável por construção: não existe ponto de entrada de "
            "preço relevante. Esperar custa carry em vez de reduzir risco."
        )
        return "Neutral", reasons

    if allocation == "Overweight" and quality == "Preferred":
        reasons.append(
            "O sleeve está em Sobrepeso e o papel lidera o ranking contra os pares."
        )
        return "Buy", reasons

    reasons.append(
        "Classe e papel são construtivos, mas o motor não tem confirmação de preço — "
        "o timing é resolvido pela estrutura de preço no app."
    )
    return "Wait", reasons


def validate_class_entry(
    estagio_aba: str,
    score_aba: float,
    dominant: dict[str, Any] | None = None,
    aba_id: str = "",
    regime_action: str | None = None,
) -> dict[str, Any]:
    """Class-level entry validation (sleeve timing)."""
    rationale: list[str] = []
    domain = score_domain_for_aba(aba_id) if aba_id else "signed"
    thr = regime_thresholds(aba_id) if aba_id else regime_thresholds("")
    action = normalize_allocation_action(regime_action) or (
        allocation_action(aba_id, score_aba) if aba_id else estagio_to_action(estagio_aba)
    )
    action_pt = ACTION_PT.get(action, action)

    entry_validated = False
    if action == "Overweight":
        entry_validated = True
        rationale.append("A classe está em Sobrepeso — aumentar exposição é suportado.")
    elif action == "Hold":
        if domain == UNIT:
            entry_validated = score_aba >= thr["hold"]
            rationale.append(
                f"Score de regime da classe {score_aba:.3f} vs limiar de Manter "
                f"{thr['hold']:.2f} — "
                + (
                    "aportes graduais são possíveis."
                    if entry_validated
                    else "abaixo da faixa de Manter, sem aportes."
                )
            )
        else:
            entry_validated = score_aba > 0.05
            rationale.append(
                "Score da classe é positivo em regime de Manter — aportes graduais são possíveis."
                if entry_validated
                else "Score da classe não é positivo o suficiente em regime de Manter."
            )
    else:
        rationale.append(
            f"A classe está em {action_pt} — evitar aportes no nível do sleeve."
        )

    if dominant and dominant.get("name"):
        rationale.append(
            f"Driver dominante: {dominant['name']} "
            f"(contribuição {dominant.get('contribution', 0):.3f})."
        )

    return {
        "entryValidated": entry_validated,
        "rationale": rationale,
        "dominantIndicator": dominant,
        "scoreDomain": domain,
        "allocationAction": action,
    }


def validate_ticker_entry(
    estagio_aba: str,
    estagio_ativo: str,
    score_aba: float,
    score_ativo: float,
    diverge: bool,
    dominant: dict[str, Any] | None = None,
    aba_id: str = "",
    regime_action: str | None = None,
) -> dict[str, Any]:
    """
    Ticker-level eligibility.

    Unit domain (two-layer models): the instrument must sit at or above the peer
    median and the sleeve must not be in Reduce, unless it diverges positively.

    Signed domain (legacy z-score abas): keeps the stage-based rules from
    guia-decisao-entrada-por-sleeve.md.
    """
    rationale: list[str] = []
    domain = score_domain_for_aba(aba_id) if aba_id else "signed"
    sec_thr = security_thresholds(aba_id) if aba_id else security_thresholds("")
    allocation = normalize_allocation_action(regime_action) or (
        allocation_action(aba_id, score_aba) if aba_id else estagio_to_action(estagio_aba)
    )
    allocation_pt = ACTION_PT.get(allocation, allocation)
    quality = instrument_quality(aba_id, score_ativo) if aba_id else (
        "Preferred" if score_ativo > 0.3 else "Competitive" if score_ativo > -0.3 else "Weak"
    )

    entry_validated = False

    if domain == UNIT:
        above_median = score_ativo >= sec_thr["median"]
        rationale.append(
            f"Ranking do papel {score_ativo:.3f} vs mediana dos pares "
            f"{sec_thr['median']:.2f} — "
            + (
                "na mediana ou acima."
                if above_median
                else "abaixo da mediana, existem pares melhores."
            )
        )
        if allocation in ("Reduce", "Strong Reduce"):
            if diverge and score_ativo >= sec_thr["strong"]:
                entry_validated = True
                rationale.append(
                    f"A classe está em {allocation_pt}, mas o papel lidera os pares "
                    f"(ranking ≥ {sec_thr['strong']:.2f}) — entrada apenas seletiva."
                )
            else:
                rationale.append(
                    f"A classe está em {allocation_pt} — entrada não validada no nível do papel."
                )
        elif above_median:
            entry_validated = True
            rationale.append(
                f"A classe está em {allocation_pt} e o papel é competitivo entre os pares."
            )
        else:
            rationale.append(
                "O papel está abaixo da mediana dos pares — prefira um par melhor ranqueado."
            )
    else:
        if estagio_ativo == "Ascendente":
            entry_validated = True
            rationale.append(
                "O papel está em estágio Ascendente (score composto acima do limiar)."
            )
        elif estagio_ativo == "Maduro":
            if score_ativo > 0.1:
                entry_validated = True
                rationale.append("Score do papel é positivo em estágio Maduro.")
            elif diverge and score_ativo > score_aba:
                entry_validated = True
                rationale.append(
                    "O papel diverge positivamente da classe em estágio Maduro."
                )
        elif estagio_ativo == "Descendente":
            if diverge and score_ativo > 0:
                entry_validated = True
                rationale.append(
                    "Classe desfavorável, mas o papel diverge positivamente — entrada seletiva."
                )
            else:
                rationale.append(
                    "O papel está em estágio Descendente — entrada não validada."
                )

        if estagio_aba == "Descendente" and not diverge and estagio_ativo != "Ascendente":
            entry_validated = False
            rationale.append(
                "A classe está em queda e o papel não diverge positivamente."
            )

        if (
            estagio_aba == "Ascendente"
            and estagio_ativo in ("Ascendente", "Maduro")
            and score_ativo > 0
        ):
            if not any("A classe suporta" in r for r in rationale):
                rationale.insert(0, "A classe suporta aumento de exposição.")
            entry_validated = True

    entry_timing, timing_reasons = _entry_timing(aba_id, allocation, quality, diverge)
    rationale.extend(timing_reasons)

    if dominant and dominant.get("name"):
        rationale.append(
            f"Driver dominante: {dominant['name']} "
            f"(contribuição {dominant.get('contribution', 0):.3f})."
        )

    return {
        "entryValidated": entry_validated,
        "rationale": rationale,
        "dominantIndicator": dominant,
        "scoreDomain": domain,
        "allocationAction": allocation,
        "instrumentQuality": quality,
        "entryTiming": entry_timing,
        "entryReasons": timing_reasons,
        "peerMedian": sec_thr["median"],
    }
