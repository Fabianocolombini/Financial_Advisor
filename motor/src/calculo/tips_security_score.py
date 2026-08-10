"""TIPS security selection — trend + RSI + volume + duration fit vs RY (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _cross_sectional_percentile, _latest_at
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.models.cash_regime_model import _percentile_0_1
from motor.src.calculo.derivados import get_fred_series
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "tips_regime.json"
_DURATION_PATH = CONFIG_DIR / "tips_duration_map.json"


def _load_security_weights() -> dict[str, float]:
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.30, "wb": 0.20, "wc": 0.15, "wd": 0.35}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.30)),
        "wb": float(sw.get("wb", 0.20)),
        "wc": float(sw.get("wc", 0.15)),
        "wd": float(sw.get("wd", 0.35)),
    }


def _load_duration_map() -> dict[str, float]:
    default = 6.5
    if not _DURATION_PATH.is_file():
        return {"__default__": default}
    cfg = json.loads(_DURATION_PATH.read_text(encoding="utf-8"))
    default = float(cfg.get("default", 6.5))
    tickers = {k.upper(): float(v) for k, v in cfg.get("tickers", {}).items()}
    tickers["__default__"] = default
    return tickers


def _effective_duration(ticker: str, duration_map: dict[str, float]) -> float:
    return duration_map.get(ticker.upper(), duration_map.get("__default__", 6.5))


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def _real_yield_pct(as_of: dt.date, window: int = 1260) -> float:
    ry_fred = "DFII10"
    if _CONFIG_PATH.is_file():
        cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
        ry_fred = cfg.get("real_yield_fred", ry_fred)
    ry_series = get_fred_series(ry_fred)
    ry_pct, _ = _percentile_0_1(ry_series, as_of, window)
    return ry_pct


def compute_tips_security_batch(
    tickers: list[str],
    universe_tickers: list[str] | None = None,
    as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    weights = _load_security_weights()
    wa, wb, wc, wd = weights["wa"], weights["wb"], weights["wc"], weights["wd"]
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))
    duration_map = _load_duration_map()
    ry_pct = _real_yield_pct(as_of)

    raw_mm50: dict[str, float] = {}
    raw_mm200: dict[str, float] = {}
    raw_rsi: dict[str, float] = {}
    raw_vol: dict[str, float] = {}
    raw_dur: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        raw_mm50[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0
        raw_mm200[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0
        raw_rsi[t] = _latest_at(get_tecnico_series(t, "rsi_14"), as_of) or 50.0
        raw_vol[t] = _latest_at(get_tecnico_series(t, "volume_vs_media"), as_of) or 0.0
        raw_dur[t] = _effective_duration(t, duration_map)

    p_mm50 = _cross_sectional_percentile(raw_mm50)
    p_mm200 = _cross_sectional_percentile(raw_mm200)
    p_rsi = _cross_sectional_percentile(raw_rsi)
    p_vol = _cross_sectional_percentile(raw_vol)
    p_dur = _cross_sectional_percentile(raw_dur)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0
        rsi_pct = p_rsi.get(t, 0.5)
        vol_pct = p_vol.get(t, 0.5)
        dur_pct = p_dur.get(t, 0.5)
        dur_fit = 1.0 - abs(dur_pct - ry_pct)

        c_trend = wa * trend_pct
        c_rsi = wb * rsi_pct
        c_vol = wc * vol_pct
        c_dur = wd * dur_fit
        security_score = c_trend + c_rsi + c_vol + c_dur

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
                "id": "duration_efetiva",
                "nome": "Duration efetiva (config)",
                "camada": "valuation",
                "valor": raw_dur.get(t),
                "percentile_cs": dur_pct,
                "real_yield_pct": ry_pct,
                "dur_fit": dur_fit,
                "peso": wd,
                "contribuicao": c_dur,
                "role": "fit duration vs yield real — mapa estático por ticker",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking TIPS — não mistura com regime).",
            f"Tendência: avg(MM50,MM200) pct = {trend_pct:.0%} (contrib {c_trend:.3f}).",
            f"RSI pct = {rsi_pct:.0%} (contrib {c_rsi:.3f}).",
            f"Volume pct = {vol_pct:.0%} (contrib {c_vol:.3f}).",
            (
                f"Duration fit: P(dur)={dur_pct:.0%}, RY_pct={ry_pct:.0%} "
                f"→ fit={dur_fit:.2f} (contrib {c_dur:.3f})."
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
            "model": "tips_security_v1",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
