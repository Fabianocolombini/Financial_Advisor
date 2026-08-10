"""HY security selection — trend + RSI + volume − vol penalty (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _cross_sectional_percentile, _latest_at
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "hy_regime.json"


def _load_security_weights() -> dict[str, float]:
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.35, "wb": 0.25, "wc": 0.15, "wd": 0.25}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.35)),
        "wb": float(sw.get("wb", 0.25)),
        "wc": float(sw.get("wc", 0.15)),
        "wd": float(sw.get("wd", 0.25)),
    }


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def compute_hy_security_batch(
    tickers: list[str],
    universe_tickers: list[str] | None = None,
    as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    weights = _load_security_weights()
    wa, wb, wc, wd = weights["wa"], weights["wb"], weights["wc"], weights["wd"]
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

    raw_mm50: dict[str, float] = {}
    raw_mm200: dict[str, float] = {}
    raw_rsi: dict[str, float] = {}
    raw_vol: dict[str, float] = {}
    raw_sigma: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        raw_mm50[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0
        raw_mm200[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0
        raw_rsi[t] = _latest_at(get_tecnico_series(t, "rsi_14"), as_of) or 50.0
        raw_vol[t] = _latest_at(get_tecnico_series(t, "volume_vs_media"), as_of) or 0.0
        raw_sigma[t] = _latest_at(get_tecnico_series(t, "vol_realizada"), as_of) or 0.0

    p_mm50 = _cross_sectional_percentile(raw_mm50)
    p_mm200 = _cross_sectional_percentile(raw_mm200)
    p_rsi = _cross_sectional_percentile(raw_rsi)
    p_vol = _cross_sectional_percentile(raw_vol)
    p_sigma = _cross_sectional_percentile(raw_sigma)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0
        rsi_pct = p_rsi.get(t, 0.5)
        vol_pct = p_vol.get(t, 0.5)
        sigma_pct = p_sigma.get(t, 0.5)

        c_trend = wa * trend_pct
        c_rsi = wb * rsi_pct
        c_vol = wc * vol_pct
        c_sigma = wd * sigma_pct
        security_score = c_trend + c_rsi + c_vol - c_sigma

        componentes = [
            {
                "id": "preco_vs_mm50",
                "nome": "Preço vs MM50",
                "camada": "tecnico",
                "valor": raw_mm50.get(t),
                "percentile_cs": p_mm50.get(t),
                "peso": wa / 2,
                "contribuicao": wa * p_mm50.get(t, 0.5) / 2,
                "role": "tendência cross-sectional",
            },
            {
                "id": "preco_vs_mm200",
                "nome": "Preço vs MM200",
                "camada": "tecnico",
                "valor": raw_mm200.get(t),
                "percentile_cs": p_mm200.get(t),
                "peso": wa / 2,
                "contribuicao": wa * p_mm200.get(t, 0.5) / 2,
                "role": "tendência longa cross-sectional",
            },
            {
                "id": "rsi_14",
                "nome": "RSI 14d",
                "camada": "tecnico",
                "valor": raw_rsi.get(t),
                "percentile_cs": rsi_pct,
                "peso": wb,
                "contribuicao": c_rsi,
                "role": "momentum cross-sectional",
            },
            {
                "id": "volume_vs_media",
                "nome": "Volume vs média",
                "camada": "tecnico",
                "valor": raw_vol.get(t),
                "percentile_cs": vol_pct,
                "peso": wc,
                "contribuicao": c_vol,
                "role": "liquidez cross-sectional",
            },
            {
                "id": "vol_realizada",
                "nome": "Vol realizada 20d (σ20)",
                "camada": "tecnico",
                "valor": raw_sigma.get(t),
                "percentile_cs": sigma_pct,
                "peso": wd,
                "contribuicao": -c_sigma,
                "role": "penalidade de vol — menor vol vs pares HY",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking HY — não mistura com regime).",
            f"Tendência: avg(MM50,MM200) pct = {trend_pct:.0%} (contrib {c_trend:.3f}).",
            f"RSI pct = {rsi_pct:.0%} (contrib {c_rsi:.3f}).",
            f"Volume pct = {vol_pct:.0%} (contrib {c_vol:.3f}).",
            f"Vol penalty: σ20 pct = {sigma_pct:.0%} → −{c_sigma:.3f}.",
        ]

        results[t] = {
            "ticker": t,
            "data": as_of.isoformat(),
            "score_composto": security_score,
            "security_score": security_score,
            "componentes": componentes,
            "indicador_dominante": dominant,
            "estagio": _security_estagio(security_score),
            "model": "hy_security_v1",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
