"""EM equity security — trend + RSI + dollar volume + FXI China fit (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _directed_percentile, _latest_at
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.security_score_helpers import rolling_beta
from motor.src.calculo.us_equity_security_score import _dollar_volume
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "em_equity_regime.json"
_TECNICOS_PATH = CONFIG_DIR / "indicadores_tecnicos_em_equity.json"

_TREND_ID = "preco_vs_mm50"
_RSI_ID = "rsi_14"
_VOLUME_ID = "volume_dolar"
_CHINA_ID = "china_fit"
_DEFAULT_TARGET = 0.6
_FXI = "FXI"


def _load_security_ingredients() -> list[dict[str, Any]]:
    if not _TECNICOS_PATH.is_file():
        return [
            {"id": _TREND_ID, "peso": 0.3, "inverte_percentil": False},
            {"id": _RSI_ID, "peso": 0.2, "inverte_percentil": False},
            {"id": _VOLUME_ID, "peso": 0.2, "inverte_percentil": False},
            {
                "id": _CHINA_ID,
                "peso": 0.3,
                "inverte_percentil": False,
                "tipo_metrica": "distancia_ao_alvo",
                "alvo_percentil": _DEFAULT_TARGET,
            },
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
    if all(by_id.get(k) for k in (_TREND_ID, _RSI_ID, _VOLUME_ID, _CHINA_ID)):
        return {
            "wa": by_id[_TREND_ID],
            "wb": by_id[_RSI_ID],
            "wc": by_id[_VOLUME_ID],
            "wd": by_id[_CHINA_ID],
        }
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.3, "wb": 0.2, "wc": 0.2, "wd": 0.3}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.3)),
        "wb": float(sw.get("wb", 0.2)),
        "wc": float(sw.get("wc", 0.2)),
        "wd": float(sw.get("wd", 0.3)),
    }


def _china_target() -> float:
    item = _ingredient(_CHINA_ID)
    if item.get("alvo_percentil") is not None:
        return float(item["alvo_percentil"])
    if _TECNICOS_PATH.is_file():
        cfg = json.loads(_TECNICOS_PATH.read_text(encoding="utf-8"))
        if cfg.get("alvo_percentil") is not None:
            return float(cfg["alvo_percentil"])
    return _DEFAULT_TARGET


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def compute_em_equity_security_batch(
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
    invert_china = bool(_ingredient(_CHINA_ID).get("inverte_percentil", False))
    target_pct = _china_target()
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

    raw_mm50: dict[str, float] = {}
    raw_mm200: dict[str, float] = {}
    raw_rsi: dict[str, float] = {}
    raw_vol: dict[str, float] = {}
    raw_beta: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        raw_mm50[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0
        raw_mm200[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0
        raw_rsi[t] = _latest_at(get_tecnico_series(t, "rsi_14"), as_of) or 50.0
        raw_vol[t] = _dollar_volume(t, as_of)
        raw_beta[t] = rolling_beta(t, _FXI, as_of=as_of)

    p_mm50 = _directed_percentile(raw_mm50, invert_trend)
    p_mm200 = _directed_percentile(raw_mm200, invert_trend)
    p_rsi = _directed_percentile(raw_rsi, invert_rsi)
    p_vol = _directed_percentile(raw_vol, invert_vol)
    p_beta = _directed_percentile(raw_beta, invert=False)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0
        rsi_pct = p_rsi.get(t, 0.5)
        vol_pct = p_vol.get(t, 0.5)
        beta_pct = p_beta.get(t, 0.5)
        china_fit = 1.0 - abs(beta_pct - target_pct)
        if invert_china:
            china_fit = 1.0 - china_fit

        c_trend = wa * trend_pct
        c_rsi = wb * rsi_pct
        c_vol = wc * vol_pct
        c_china = wd * china_fit
        security_score = c_trend + c_rsi + c_vol + c_china

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
                "role": "tendência cross-sectional — close USD do ETF",
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
                "id": _VOLUME_ID,
                "nome": "Volume em dólar",
                "camada": "tecnico",
                "valor": raw_vol.get(t),
                "percentile_cs": vol_pct,
                "peso": wc,
                "inverte_percentil": invert_vol,
                "contribuicao": c_vol,
                "role": "liquidez — close × ações negociadas vs pares",
            },
            {
                "id": _CHINA_ID,
                "nome": "China exposure (fit vs FXI)",
                "camada": "tecnico",
                "valor": raw_beta.get(t),
                "percentile_cs": beta_pct,
                "alvo_percentil": target_pct,
                "china_fit": china_fit,
                "peso": wd,
                "inverte_percentil": invert_china,
                "tipo_metrica": "distancia_ao_alvo",
                "contribuicao": c_china,
                "role": "bucket estrutural — mesma β vs FXI, mesmo fit; não é sinal do emissor",
                "is_proxy": True,
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking EM — não mistura com regime).",
            f"Tendência: avg(MM50,MM200) pct = {trend_pct:.0%} (contrib {c_trend:.3f}).",
            f"RSI pct = {rsi_pct:.0%} (contrib {c_rsi:.3f}).",
            f"Volume em dólar pct = {vol_pct:.0%} (contrib {c_vol:.3f}).",
            (
                f"China exposure (bucket): P(β_FXI)={beta_pct:.0%}, alvo={target_pct:.0%} "
                f"→ fit={china_fit:.2f} (contrib {c_china:.3f})."
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
            "model": "em_equity_security_v2",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
