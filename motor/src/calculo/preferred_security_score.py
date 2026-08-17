"""Preferred security selection — trend + RSI + trap-adjusted yield + inverted 20d vol (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.cash_security_score import _directed_percentile, _latest_at
from motor.src.calculo.derivados import dividend_yield_series
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.zscore import zscore_latest_detail
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "preferred_regime.json"
_TECNICOS_PATH = CONFIG_DIR / "indicadores_tecnicos_preferred.json"

_TREND_ID = "preco_vs_mm50"
_RSI_ID = "rsi_14"
_YIELD_ID = "dividend_yield"
_SIGMA_ID = "vol_realizada"
_YIELD_Z_WINDOW = 252


def _load_security_ingredients() -> list[dict[str, Any]]:
    if not _TECNICOS_PATH.is_file():
        return [
            {"id": _TREND_ID, "peso": 0.3, "inverte_percentil": False},
            {"id": _RSI_ID, "peso": 0.2, "inverte_percentil": False},
            {"id": _YIELD_ID, "peso": 0.25, "inverte_percentil": False},
            {"id": _SIGMA_ID, "peso": 0.25, "inverte_percentil": True},
        ]
    cfg = json.loads(_TECNICOS_PATH.read_text(encoding="utf-8"))
    return list(cfg.get("indicadores") or [])


def _ingredient(ind_id: str) -> dict[str, Any]:
    for item in _load_security_ingredients():
        if item.get("id") == ind_id:
            return item
    return {}


def _load_security_weights() -> dict[str, float]:
    by_id = {i["id"]: float(i.get("peso") or 0) for i in _load_security_ingredients()}
    if all(by_id.get(k) for k in (_TREND_ID, _RSI_ID, _YIELD_ID, _SIGMA_ID)):
        return {
            "wa": by_id[_TREND_ID],
            "wb": by_id[_RSI_ID],
            "wc": by_id[_YIELD_ID],
            "wd": by_id[_SIGMA_ID],
        }
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.30, "wb": 0.20, "wc": 0.25, "wd": 0.25}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.30)),
        "wb": float(sw.get("wb", 0.20)),
        "wc": float(sw.get("wc", 0.25)),
        "wd": float(sw.get("wd", 0.25)),
    }


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def _yield_trap_adjusted(ticker: str, as_of: dt.date) -> tuple[float, float, float]:
    """Raw yield, own-history z, yield after trap haircut: y / (1 + max(z, 0))."""
    series = dividend_yield_series(ticker)
    if series.empty:
        return 0.0, 0.0, 0.0
    cap = pd.Timestamp(as_of)
    truncated = series.loc[pd.DatetimeIndex(pd.to_datetime(series.index)) <= cap]
    y = _latest_at(truncated, as_of)
    if y is None:
        return 0.0, 0.0, 0.0
    z, _, _ = zscore_latest_detail(truncated, window=_YIELD_Z_WINDOW)
    haircut = 1.0 / (1.0 + max(float(z), 0.0))
    return float(y), float(z), float(y) * haircut


def compute_preferred_security_batch(
    tickers: list[str],
    universe_tickers: list[str] | None = None,
    as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    weights = _load_security_weights()
    wa, wb, wc, wd = weights["wa"], weights["wb"], weights["wc"], weights["wd"]
    invert_trend = bool(_ingredient(_TREND_ID).get("inverte_percentil", False))
    invert_rsi = bool(_ingredient(_RSI_ID).get("inverte_percentil", False))
    invert_yield = bool(_ingredient(_YIELD_ID).get("inverte_percentil", False))
    invert_sigma = bool(_ingredient(_SIGMA_ID).get("inverte_percentil", True))
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

    raw_mm50: dict[str, float] = {}
    raw_mm200: dict[str, float] = {}
    raw_rsi: dict[str, float] = {}
    raw_sigma: dict[str, float] = {}
    raw_yield: dict[str, float] = {}
    raw_yield_z: dict[str, float] = {}
    raw_yield_adj: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        raw_mm50[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0
        raw_mm200[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0
        raw_rsi[t] = _latest_at(get_tecnico_series(t, "rsi_14"), as_of) or 50.0
        raw_sigma[t] = _latest_at(get_tecnico_series(t, _SIGMA_ID), as_of) or 0.0
        y, z, y_adj = _yield_trap_adjusted(t, as_of)
        raw_yield[t] = y
        raw_yield_z[t] = z
        raw_yield_adj[t] = y_adj

    p_mm50 = _directed_percentile(raw_mm50, invert_trend)
    p_mm200 = _directed_percentile(raw_mm200, invert_trend)
    p_rsi = _directed_percentile(raw_rsi, invert_rsi)
    p_yield = _directed_percentile(raw_yield_adj, invert_yield)
    p_sigma = _directed_percentile(raw_sigma, invert_sigma)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0
        rsi_pct = p_rsi.get(t, 0.5)
        yield_pct = p_yield.get(t, 0.5)
        sigma_pct = p_sigma.get(t, 0.5)

        c_trend = wa * trend_pct
        c_rsi = wb * rsi_pct
        c_yield = wc * yield_pct
        c_sigma = wd * sigma_pct
        security_score = c_trend + c_rsi + c_yield + c_sigma

        componentes = [
            {
                "id": _TREND_ID,
                "nome": "Tendência (MM50+MM200)",
                "camada": "tecnico",
                "valor": (raw_mm50.get(t, 0.0) + raw_mm200.get(t, 0.0)) / 2.0,
                "percentile_cs": trend_pct,
                "peso": wa,
                "inverte_percentil": invert_trend,
                "contribuicao": c_trend,
                "role": "tendência — Preferred é equity-like",
            },
            {
                "id": _RSI_ID,
                "nome": "RSI 14d",
                "camada": "tecnico",
                "valor": raw_rsi.get(t),
                "percentile_cs": rsi_pct,
                "peso": wb,
                "inverte_percentil": invert_rsi,
                "contribuicao": c_rsi,
                "role": "momentum — RSI válido nesta classe",
            },
            {
                "id": _YIELD_ID,
                "nome": "Dividend yield (anti yield-trap)",
                "camada": "valuation",
                "valor": raw_yield.get(t),
                "z_score": raw_yield_z.get(t),
                "valor_ajustado": raw_yield_adj.get(t),
                "percentile_cs": yield_pct,
                "peso": wc,
                "inverte_percentil": invert_yield,
                "contribuicao": c_yield,
                "yield_trap": "y / (1 + max(z_252, 0))",
                "role": "renda vs pares; yield inflado por colapso de preço é haircut",
            },
            {
                "id": _SIGMA_ID,
                "nome": "Vol realizada 20d (σ20)",
                "camada": "tecnico",
                "valor": raw_sigma.get(t),
                "percentile_cs": sigma_pct,
                "peso": wd,
                "inverte_percentil": invert_sigma,
                "contribuicao": c_sigma,
                "vol_window": 20,
                "role": "sintoma de crédito — menor vol vs pares; sem volume nesta classe",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking Preferred — não mistura com regime).",
            f"Tendência: avg(MM50,MM200) pct = {trend_pct:.0%} (contrib {c_trend:.3f}).",
            f"RSI pct = {rsi_pct:.0%} (contrib {c_rsi:.3f}).",
            (
                f"Yield anti-trap: y={raw_yield.get(t, 0):.2%}, z={raw_yield_z.get(t, 0):.2f} "
                f"→ adj pct = {yield_pct:.0%} (contrib {c_yield:.3f})."
            ),
            f"σ20 invertida pct = {sigma_pct:.0%} (contrib {c_sigma:.3f}, lookback 20d).",
        ]

        results[t] = {
            "ticker": t,
            "data": as_of.isoformat(),
            "score_composto": security_score,
            "security_score": security_score,
            "componentes": componentes,
            "indicador_dominante": dominant,
            "estagio": _security_estagio(security_score),
            "model": "preferred_security_v2",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
