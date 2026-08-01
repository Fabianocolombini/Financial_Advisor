"""Composite score S from aba config."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import compute_formula, get_fred_series, latest_raw_value
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.zscore import apply_direction, zscore_latest
from motor.src.config_loader import load_aba_config, load_tecnicos_config
from motor.src.db.connection import get_connection, init_db
from motor.src.ingestao.edgar_client import get_edgar_metric


def _indicator_series(ind: dict[str, Any]) -> pd.Series:
    fonte = ind.get("fonte")
    if fonte == "fred":
        return get_fred_series(ind["serie"])
    if fonte == "calculado":
        return compute_formula(ind["formula"])
    if fonte == "edgar":
        # Single-point series for z-score fallback
        return pd.Series(dtype=float)
    return pd.Series(dtype=float)


def _score_indicator(ind: dict[str, Any], pesos_camada: dict[str, float]) -> dict[str, Any]:
    window = int(ind.get("zscore_window", 252))
    camada = ind.get("camada", "macro")
    peso = float(ind.get("peso", 1.0))
    peso_camada = float(pesos_camada.get(camada, 1.0))
    direcao = ind.get("direcao", "positiva")

    series = _indicator_series(ind)
    if series.empty and ind.get("fonte") == "edgar":
        val = get_edgar_metric(ind.get("ticker", ""), ind.get("edgar_metric", ""))
        z, latest, mean = (0.0, val or 0.0, val or 0.0)
    else:
        z, latest, mean = zscore_latest(series, window)
    z_adj = apply_direction(z, direcao)
    contrib = z_adj * peso * peso_camada
    return {
        "id": ind["id"],
        "nome": ind.get("nome", ind["id"]),
        "camada": camada,
        "valor": latest,
        "z_score": z,
        "z_ajustado": z_adj,
        "peso": peso,
        "peso_camada": peso_camada,
        "contribuicao": contrib,
    }


def compute_aba_score(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    init_db()
    aba = load_aba_config(aba_id)
    as_of = as_of or dt.date.today()
    pesos_camada = aba.get("pesos_camada", {})
    components: list[dict[str, Any]] = []
    total_weight = 0.0
    total_contrib = 0.0

    for ind in aba.get("indicadores", []):
        comp = _score_indicator(ind, pesos_camada)
        components.append(comp)
        w = comp["peso"] * comp["peso_camada"]
        total_weight += w
        total_contrib += comp["contribuicao"]

    s = total_contrib / total_weight if total_weight else 0.0
    dominant = max(components, key=lambda c: abs(c["contribuicao"])) if components else None

    return {
        "aba_id": aba_id,
        "nome": aba.get("nome", aba_id),
        "data": as_of.isoformat(),
        "score_composto": s,
        "componentes": components,
        "indicador_dominante": dominant,
    }


def compute_ativo_score(
    aba_id: str,
    ticker: str,
    benchmark: str,
    edgar_metric: str | None = None,
    as_of: dt.date | None = None,
) -> dict[str, Any]:
    init_db()
    aba = load_aba_config(aba_id)
    as_of = as_of or dt.date.today()
    tec_cfg = load_tecnicos_config()
    peso_tec_total = sum(i["peso"] for i in tec_cfg.get("indicadores", []))
    components: list[dict[str, Any]] = []
    total_w = 0.0
    total_c = 0.0

    for ind in tec_cfg.get("indicadores", []):
        series = get_tecnico_series(ticker, ind["id"])
        window = int(tec_cfg.get("zscore_window", 252))
        z, latest, _ = zscore_latest(series, window)
        z_adj = apply_direction(z, ind.get("direcao", "positiva"))
        peso = float(ind.get("peso", 1.0))
        contrib = z_adj * peso
        components.append(
            {
                "id": ind["id"],
                "nome": ind.get("nome", ind["id"]),
                "camada": "tecnico",
                "valor": latest,
                "z_score": z,
                "z_ajustado": z_adj,
                "peso": peso,
                "contribuicao": contrib,
            }
        )
        total_w += peso
        total_c += contrib

    if edgar_metric:
        val = get_edgar_metric(ticker, edgar_metric)
        if val is not None:
            # Lower non-accrual is better → negativa direction on raw value z approx
            z_approx = -val / 5.0  # heuristic scale
            peso = 0.5
            contrib = z_approx * peso
            components.append(
                {
                    "id": edgar_metric,
                    "nome": f"EDGAR {edgar_metric}",
                    "camada": "fundamental",
                    "valor": val,
                    "z_score": z_approx,
                    "z_ajustado": z_approx,
                    "peso": peso,
                    "contribuicao": contrib,
                }
            )
            total_w += peso
            total_c += contrib

    s = total_c / total_w if total_w else 0.0
    return {
        "ticker": ticker.upper(),
        "data": as_of.isoformat(),
        "score_composto": s,
        "componentes": components,
    }


def backfill_aba_scores(aba_id: str, days: int = 120) -> int:
    """Persist daily composite scores for regression / estágio."""
    init_db()
    aba = load_aba_config(aba_id)
    pesos_camada = aba.get("pesos_camada", {})
    indicators = aba.get("indicadores", [])

    # Reference dates from first macro indicator
    ref_series = None
    for ind in indicators:
        s = _indicator_series(ind)
        if not s.empty:
            ref_series = s
            break
    if ref_series is None or ref_series.empty:
        result = compute_aba_score(aba_id)
        persist_aba_score(result)
        return 1

    dates = ref_series.index[-days:]
    n = 0
    for d in dates:
        components: list[dict[str, Any]] = []
        total_w = 0.0
        total_c = 0.0
        for ind in indicators:
            window = int(ind.get("zscore_window", 252))
            camada = ind.get("camada", "macro")
            peso = float(ind.get("peso", 1.0))
            peso_camada = float(pesos_camada.get(camada, 1.0))
            direcao = ind.get("direcao", "positiva")
            series = _indicator_series(ind)
            if series.empty:
                continue
            truncated = series[series.index <= d]
            z, latest, _ = zscore_latest(truncated, window)
            z_adj = apply_direction(z, direcao)
            contrib = z_adj * peso * peso_camada
            components.append(
                {
                    "id": ind["id"],
                    "nome": ind.get("nome", ind["id"]),
                    "camada": camada,
                    "valor": latest,
                    "z_score": z,
                    "z_ajustado": z_adj,
                    "peso": peso,
                    "peso_camada": peso_camada,
                    "contribuicao": contrib,
                }
            )
            total_w += peso * peso_camada
            total_c += contrib
        if not total_w:
            continue
        s_val = total_c / total_w
        d_iso = d.isoformat() if hasattr(d, "isoformat") else str(d)
        result = {
            "aba_id": aba_id,
            "nome": aba.get("nome", aba_id),
            "data": d_iso,
            "score_composto": s_val,
            "componentes": components,
            "indicador_dominante": max(components, key=lambda c: abs(c["contribuicao"])),
        }
        persist_aba_score(result)
        n += 1
    return n


def persist_aba_score(
    result: dict[str, Any], estagio: str | None = None, slope: float | None = None
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO scores_historico
            (aba_id, data, score_composto, estagio, slope, componentes_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                result["aba_id"],
                result["data"],
                result["score_composto"],
                estagio,
                slope,
                json.dumps(result["componentes"], ensure_ascii=False),
            ),
        )
        conn.commit()


def persist_ativo_score(
    aba_id: str,
    result: dict[str, Any],
    estagio: str | None,
    diverge: bool,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO scores_ativo
            (aba_id, ticker, data, score_composto, estagio, diverge_categoria, componentes_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                aba_id,
                result["ticker"],
                result["data"],
                result["score_composto"],
                estagio,
                1 if diverge else 0,
                json.dumps(result["componentes"], ensure_ascii=False),
            ),
        )
        conn.commit()
