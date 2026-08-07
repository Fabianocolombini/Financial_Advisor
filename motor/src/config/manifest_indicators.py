"""Map fontes_manifest.json indicators → aba scoring config."""

from __future__ import annotations

from typing import Any

from motor.src.config.aba_class_map import class_id_for_aba
from motor.src.ingestao.fontes_registry import load_manifest


def _infer_camada(ind: dict[str, Any]) -> str:
    if ind.get("camada"):
        return ind["camada"]
    fonte = ind.get("fonte")
    field = ind.get("field", "")
    ind_id = ind.get("id", "").lower()
    if fonte == "edgar":
        return "fundamental"
    if fonte == "world_bank":
        return "macro"
    if fonte == "yfinance":
        if field == "revenue_growth":
            return "fundamental"
        return "valuation"
    if "vix" in ind_id or "spread" in ind_id or "wti" in ind_id or "henry" in ind_id:
        return "macro"
    if "dxy" in ind_id or "eurusd" in ind_id or "dff" in ind_id or "ecb" in ind_id:
        return "macro"
    if "yield" in ind_id or "pe" in ind_id or "dividend" in ind_id or "price" in ind_id:
        return "valuation"
    if "cpi" in ind_id or "gdp" in ind_id:
        return "macro"
    return "macro"


def _infer_direcao(ind: dict[str, Any]) -> str:
    if ind.get("direcao"):
        return ind["direcao"]
    ind_id = ind.get("id", "").lower()
    field = ind.get("field", "")
    if ind.get("fonte") == "edgar" and "non_accrual" in ind.get("metric", ""):
        return "negativa"
    if field == "pe_ratio" or "pe_" in ind_id or "pe_rel" in ind_id:
        return "positiva"
    if field == "dividend_yield" or "dividend" in ind_id:
        return "positiva"
    if field == "revenue_growth":
        return "positiva"
    if "yield" in ind_id and ind.get("fonte") == "fred":
        return "positiva"
    if ind_id in {"vix", "hy_oas", "hy_spread", "ig_spread", "wti", "henry_hub", "gdp_growth_em"}:
        return "positiva"
    if ind_id in {"dxy", "eurusd", "fed_funds", "dff", "yield_10y", "yield_real"}:
        return "negativa"
    if "spread_caixa" in ind_id or "cap_rate" in ind_id:
        return "positiva"
    return "positiva"


def _class_indicators_raw(class_id: str) -> list[dict[str, Any]] | None:
    manifest = load_manifest()
    for cls in manifest.get("classes", []):
        if cls.get("id") == class_id:
            return list(cls.get("indicadores", []))
    return None


def enrich_for_scoring(ind: dict[str, Any]) -> dict[str, Any]:
    out = dict(ind)
    nome = out.get("nome") or out.get("id", "")
    out["nome"] = nome
    out.setdefault("zscore_window", 252)
    out["camada"] = _infer_camada(out)
    out["direcao"] = _infer_direcao(out)
    if ind.get("is_proxy"):
        out["is_proxy"] = True
        if ind.get("proxy_rationale"):
            out["proxy_rationale"] = ind["proxy_rationale"]
    if ind.get("ingest_frequency"):
        out["ingest_frequency"] = ind["ingest_frequency"]
    return out


def normalize_weights(
    indicators: list[dict[str, Any]],
    pesos_camada: dict[str, float],
) -> list[dict[str, Any]]:
    enriched = [enrich_for_scoring(i) for i in indicators]
    explicit = [i for i in enriched if i.get("peso") is not None]
    if explicit and len(explicit) == len(enriched):
        return enriched
    by_camada: dict[str, list[dict[str, Any]]] = {}
    for ind in enriched:
        by_camada.setdefault(ind["camada"], []).append(ind)
    for camada, group in by_camada.items():
        share = float(pesos_camada.get(camada, 0.25))
        w = share / len(group) if group else 0.0
        for ind in group:
            ind["peso"] = w
    return enriched


def scoring_indicators_for_aba(
    aba_id: str,
    aba_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Prefer manifest (guide) indicators; fallback to aba JSON."""
    class_id = class_id_for_aba(aba_id)
    raw = _class_indicators_raw(class_id)
    pesos = aba_config.get("pesos_camada", {})
    if raw:
        return normalize_weights(raw, pesos)
    return list(aba_config.get("indicadores", []))
