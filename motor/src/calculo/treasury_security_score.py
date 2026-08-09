"""Treasury security selection — curve point + COT crowding (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.cash_security_score import _cross_sectional_percentile, _latest_at
from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.zscore import zscore_latest
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "treasury_regime.json"


def _load_security_weights() -> dict[str, float]:
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.35, "wb": 0.25, "wc": 0.2, "wd": 0.2}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.35)),
        "wb": float(sw.get("wb", 0.25)),
        "wc": float(sw.get("wc", 0.2)),
        "wd": float(sw.get("wd", 0.2)),
    }


def _cot_crowding_pct_5y(as_of: dt.date, window: int = 1260) -> tuple[float, float | None, float | None]:
    cot = get_external_series("cftc", "cot_treasuries_net")
    if cot.empty:
        return 0.5, None, None
    cap = pd.Timestamp(as_of)
    truncated = cot.loc[pd.DatetimeIndex(pd.to_datetime(cot.index)) <= cap]
    if len(truncated) < 30:
        return 0.5, None, None

    abs_z_history: list[float] = []
    for i in range(30, len(truncated)):
        tail = truncated.iloc[: i + 1]
        z, _, _ = zscore_latest(tail, window=min(window, len(tail)))
        abs_z_history.append(abs(z))

    z_now, latest, _ = zscore_latest(truncated, window=min(window, len(truncated)))
    abs_z_now = abs(z_now)
    if not abs_z_history:
        return 0.5, latest, abs_z_now
    pct = sum(h < abs_z_now for h in abs_z_history) / len(abs_z_history)
    return float(pct), latest, abs_z_now


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def compute_treasury_security_batch(
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

    for ticker in cs_universe:
        t = ticker.upper()
        raw_mm50[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0
        raw_mm200[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0
        raw_rsi[t] = _latest_at(get_tecnico_series(t, "rsi_14"), as_of) or 50.0
        raw_vol[t] = _latest_at(get_tecnico_series(t, "volume_vs_media"), as_of) or 0.0

    p_mm50 = _cross_sectional_percentile(raw_mm50)
    p_mm200 = _cross_sectional_percentile(raw_mm200)
    p_rsi = _cross_sectional_percentile(raw_rsi)
    p_vol = _cross_sectional_percentile(raw_vol)

    crowding_pct, cot_val, cot_abs_z = _cot_crowding_pct_5y(as_of)
    crowding_penalty = wd * crowding_pct

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0
        rsi_pct = p_rsi.get(t, 0.5)
        vol_pct = p_vol.get(t, 0.5)

        c_trend = wa * trend_pct
        c_rsi = wb * rsi_pct
        c_vol = wc * vol_pct
        security_score = c_trend + c_rsi + c_vol - crowding_penalty

        componentes = [
            {
                "id": "preco_vs_mm50",
                "nome": "Preço vs MM50",
                "camada": "tecnico",
                "valor": raw_mm50.get(t),
                "percentile_cs": p_mm50.get(t),
                "peso": wa / 2,
                "contribuicao": wa * p_mm50.get(t, 0.5) / 2,
                "role": "tendência — ponto da curva vs pares",
            },
            {
                "id": "preco_vs_mm200",
                "nome": "Preço vs MM200",
                "camada": "tecnico",
                "valor": raw_mm200.get(t),
                "percentile_cs": p_mm200.get(t),
                "peso": wa / 2,
                "contribuicao": wa * p_mm200.get(t, 0.5) / 2,
                "role": "tendência — média longa cross-sectional",
            },
            {
                "id": "rsi_14",
                "nome": "RSI 14d",
                "camada": "tecnico",
                "valor": raw_rsi.get(t),
                "percentile_cs": rsi_pct,
                "peso": wb,
                "contribuicao": c_rsi,
                "role": "momentum — mantido (vol genuína em TLT/IEF)",
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
                "id": "cot_net_position",
                "nome": "COT net Treasuries",
                "camada": "macro",
                "valor": cot_val,
                "percentile_0_1": crowding_pct,
                "abs_z": cot_abs_z,
                "peso": wd,
                "contribuicao": -crowding_penalty,
                "role": "crowding penalty — posicionamento extremo (classe)",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (qual ponto da curva — não mistura com regime).",
            f"Tendência: avg(MM50,MM200) pct = {trend_pct:.0%} (contrib {c_trend:.3f}).",
            f"RSI pct cross-sectional = {rsi_pct:.0%} (contrib {c_rsi:.3f}).",
            f"Volume pct = {vol_pct:.0%} (contrib {c_vol:.3f}).",
            (
                f"COT crowding: P(|z|,5y) = {crowding_pct:.0%} "
                f"→ penalty −{crowding_penalty:.3f} (aplicado a todos)."
            ),
        ]

        results[t] = {
            "ticker": t,
            "data": as_of.isoformat(),
            "score_composto": security_score,
            "security_score": security_score,
            "componentes": componentes,
            "indicador_dominante": dominant,
            "estagio": _security_estagio(security_score),
            "model": "treasury_security_v1",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
