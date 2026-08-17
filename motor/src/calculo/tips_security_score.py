"""TIPS security selection — duration-scaled technicals + duration fit vs real yield (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _directed_percentile, _latest_at
from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.models.cash_regime_model import _percentile_0_1
from motor.src.calculo.treasury_security_score import _rsi_duration_adjusted, _traded_volume
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "tips_regime.json"
_TECNICOS_PATH = CONFIG_DIR / "indicadores_tecnicos_tips.json"
_DURATION_PATH = CONFIG_DIR / "tips_duration_map.json"

_TREND_ID = "preco_vs_mm50_dur"
_RSI_ID = "rsi_14_dur"
_VOLUME_ID = "volume_negociado"
_DURATION_ID = "duration_efetiva"
_MIN_DURATION = 0.5


def _load_security_ingredients() -> list[dict[str, Any]]:
    if not _TECNICOS_PATH.is_file():
        return [
            {"id": _TREND_ID, "peso": 0.3, "inverte_percentil": False},
            {"id": _RSI_ID, "peso": 0.2, "inverte_percentil": False},
            {"id": _VOLUME_ID, "peso": 0.15, "inverte_percentil": False},
            {"id": _DURATION_ID, "peso": 0.35, "inverte_percentil": False},
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
    if all(by_id.get(k) for k in (_TREND_ID, _RSI_ID, _VOLUME_ID, _DURATION_ID)):
        return {
            "wa": by_id[_TREND_ID],
            "wb": by_id[_RSI_ID],
            "wc": by_id[_VOLUME_ID],
            "wd": by_id[_DURATION_ID],
        }
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
    default = float(cfg.get("default", default))
    tickers = {k.upper(): float(v) for k, v in cfg.get("tickers", {}).items()}
    tickers["__default__"] = default
    return tickers


def _effective_duration(ticker: str, duration_map: dict[str, float]) -> float:
    raw = duration_map.get(ticker.upper(), duration_map.get("__default__", 6.5))
    return max(float(raw), _MIN_DURATION)


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
    invert_trend = bool(_ingredient(_TREND_ID).get("inverte_percentil", False))
    invert_rsi = bool(_ingredient(_RSI_ID).get("inverte_percentil", False))
    invert_vol = bool(_ingredient(_VOLUME_ID).get("inverte_percentil", False))
    invert_dur = bool(_ingredient(_DURATION_ID).get("inverte_percentil", False))
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
        dur = _effective_duration(t, duration_map)
        raw_dur[t] = dur
        mm50 = _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0
        mm200 = _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0
        raw_mm50[t] = mm50 / dur
        raw_mm200[t] = mm200 / dur
        raw_rsi[t] = _rsi_duration_adjusted(t, dur, as_of)
        raw_vol[t] = _traded_volume(t, as_of)

    p_mm50 = _directed_percentile(raw_mm50, invert_trend)
    p_mm200 = _directed_percentile(raw_mm200, invert_trend)
    p_rsi = _directed_percentile(raw_rsi, invert_rsi)
    p_vol = _directed_percentile(raw_vol, invert_vol)
    p_dur = _directed_percentile(raw_dur, invert=False)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0
        rsi_pct = p_rsi.get(t, 0.5)
        vol_pct = p_vol.get(t, 0.5)
        dur_pct = p_dur.get(t, 0.5)
        dur_fit = 1.0 - abs(dur_pct - ry_pct)
        if invert_dur:
            dur_fit = 1.0 - dur_fit

        c_trend = wa * trend_pct
        c_rsi = wb * rsi_pct
        c_vol = wc * vol_pct
        c_dur = wd * dur_fit
        security_score = c_trend + c_rsi + c_vol + c_dur

        componentes = [
            {
                "id": _TREND_ID,
                "nome": "Tendência / duration (MM50+MM200)",
                "camada": "tecnico",
                "valor": (raw_mm50.get(t, 0.0) + raw_mm200.get(t, 0.0)) / 2.0,
                "duration": raw_dur.get(t),
                "percentile_cs": trend_pct,
                "peso": wa,
                "inverte_percentil": invert_trend,
                "contribuicao": c_trend,
                "price_series": "etf_close",
                "role": "tendência do close do ETF por unidade de duration — não premia LTPZ só por convexidade",
            },
            {
                "id": _RSI_ID,
                "nome": "RSI 14d (retorno / duration)",
                "camada": "tecnico",
                "valor": raw_rsi.get(t),
                "duration": raw_dur.get(t),
                "percentile_cs": rsi_pct,
                "peso": wb,
                "inverte_percentil": invert_rsi,
                "contribuicao": c_rsi,
                "role": "momentum em retorno por unidade de duration",
            },
            {
                "id": _VOLUME_ID,
                "nome": "Volume negociado",
                "camada": "tecnico",
                "valor": raw_vol.get(t),
                "percentile_cs": vol_pct,
                "peso": wc,
                "inverte_percentil": invert_vol,
                "contribuicao": c_vol,
                "role": "liquidez — volume bruto vs pares",
            },
            {
                "id": _DURATION_ID,
                "nome": "Real-yield fit vs DFII10",
                "camada": "valuation",
                "valor": raw_dur.get(t),
                "percentile_cs": dur_pct,
                "real_yield_pct": ry_pct,
                "dur_fit": dur_fit,
                "peso": wd,
                "inverte_percentil": invert_dur,
                "contribuicao": c_dur,
                "role": "bucket macro — mesma faixa de duration, mesmo fit; não diferencia papéis",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking TIPS — não mistura com regime).",
            (
                f"Tendência / duration (ETF close): avg(MM50,MM200)/D pct = {trend_pct:.0%} "
                f"(contrib {c_trend:.3f}, D={raw_dur.get(t, 0):.1f})."
            ),
            f"RSI duration-adj pct = {rsi_pct:.0%} (contrib {c_rsi:.3f}).",
            f"Volume bruto pct = {vol_pct:.0%} (contrib {c_vol:.3f}).",
            (
                f"Real-yield fit (bucket): P(dur)={dur_pct:.0%}, RY_pct={ry_pct:.0%} "
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
            "model": "tips_security_v2",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
