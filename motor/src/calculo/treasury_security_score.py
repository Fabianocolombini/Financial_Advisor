"""Treasury security selection — duration-scaled curve point + COT crowding (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.cash_security_score import (
    _directed_percentile,
    _latest_at,
)
from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series, rsi_from_changes
from motor.src.calculo.zscore import zscore_latest_detail
from motor.src.dates import motor_as_of_date
from motor.src.db.connection import get_connection
from motor.src.ingestao.yfinance_client import get_price_series
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "treasury_regime.json"
_TECNICOS_PATH = CONFIG_DIR / "indicadores_tecnicos_treasury.json"
_DURATION_PATH = CONFIG_DIR / "treasury_duration_map.json"

_TREND_ID = "preco_vs_mm50_dur"
_RSI_ID = "rsi_14_dur"
_VOLUME_ID = "volume_negociado"
_COT_ID = "cot_net_position"
_MIN_DURATION = 0.5


def _load_security_ingredients() -> list[dict[str, Any]]:
    if not _TECNICOS_PATH.is_file():
        return [
            {"id": _TREND_ID, "peso": 0.35, "inverte_percentil": False},
            {"id": _RSI_ID, "peso": 0.25, "inverte_percentil": False},
            {"id": _VOLUME_ID, "peso": 0.2, "inverte_percentil": False},
            {"id": _COT_ID, "peso": 0.2, "inverte_percentil": True},
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
    if all(by_id.get(k) for k in (_TREND_ID, _RSI_ID, _VOLUME_ID, _COT_ID)):
        return {
            "wa": by_id[_TREND_ID],
            "wb": by_id[_RSI_ID],
            "wc": by_id[_VOLUME_ID],
            "wd": by_id[_COT_ID],
        }
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


def _load_duration_map() -> dict[str, float]:
    default = 7.0
    if not _DURATION_PATH.is_file():
        return {"__default__": default}
    cfg = json.loads(_DURATION_PATH.read_text(encoding="utf-8"))
    default = float(cfg.get("default", default))
    tickers = {k.upper(): float(v) for k, v in cfg.get("tickers", {}).items()}
    tickers["__default__"] = default
    return tickers


def _effective_duration(ticker: str, duration_map: dict[str, float]) -> float:
    raw = duration_map.get(ticker.upper(), duration_map.get("__default__", 7.0))
    return max(float(raw), _MIN_DURATION)


def _traded_volume(ticker: str, as_of: dt.date) -> float:
    stored = _latest_at(get_tecnico_series(ticker, _VOLUME_ID), as_of)
    if stored is not None:
        return stored
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT data, volume FROM price_daily WHERE ticker = ? AND data <= ? ORDER BY data",
            (ticker.upper(), as_of.isoformat()),
        ).fetchall()
    if not rows:
        return 0.0
    return float(rows[-1]["volume"] or 0)


def _rsi_duration_adjusted(ticker: str, duration: float, as_of: dt.date) -> float:
    prices = get_price_series(ticker)
    if prices.empty:
        return 50.0
    adj = prices.pct_change() / duration
    rsi_s = rsi_from_changes(adj, 14)
    val = _latest_at(rsi_s, as_of)
    return val if val is not None else 50.0


def _cot_crowding_pct_5y(as_of: dt.date, window: int = 1260) -> tuple[float, float | None, float | None]:
    """Time-series crowding percentile. Weekly COT is held at the last print (no interpolation)."""
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
        z, _, _ = zscore_latest_detail(tail, window=min(window, len(tail)))
        abs_z_history.append(abs(z))

    z_now, latest, _ = zscore_latest_detail(truncated, window=min(window, len(truncated)))
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
    invert_trend = bool(_ingredient(_TREND_ID).get("inverte_percentil", False))
    invert_rsi = bool(_ingredient(_RSI_ID).get("inverte_percentil", False))
    invert_vol = bool(_ingredient(_VOLUME_ID).get("inverte_percentil", False))
    invert_cot = bool(_ingredient(_COT_ID).get("inverte_percentil", True))
    duration_map = _load_duration_map()
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

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

    crowding_pct, cot_val, cot_abs_z = _cot_crowding_pct_5y(as_of)
    cot_score = (1.0 - crowding_pct) if invert_cot else crowding_pct

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0
        rsi_pct = p_rsi.get(t, 0.5)
        vol_pct = p_vol.get(t, 0.5)

        c_trend = wa * trend_pct
        c_rsi = wb * rsi_pct
        c_vol = wc * vol_pct
        c_cot = wd * cot_score
        security_score = c_trend + c_rsi + c_vol + c_cot

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
                "role": "tendência por unidade de duration — não premia TLT só por convexidade",
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
                "id": _COT_ID,
                "nome": "COT net Treasuries",
                "camada": "macro",
                "valor": cot_val,
                "percentile_0_1": cot_score,
                "crowding_pct": crowding_pct,
                "abs_z": cot_abs_z,
                "peso": wd,
                "inverte_percentil": invert_cot,
                "contribuicao": c_cot,
                "cot_refresh": "hold_last",
                "role": "contrapeso — menor crowding é melhor; última leitura semanal até a próxima",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (qual ponto da curva — não mistura com regime).",
            (
                f"Tendência / duration: avg(MM50,MM200)/D pct = {trend_pct:.0%} "
                f"(contrib {c_trend:.3f}, D={raw_dur.get(t, 0):.1f})."
            ),
            f"RSI duration-adj pct = {rsi_pct:.0%} (contrib {c_rsi:.3f}).",
            f"Volume bruto pct = {vol_pct:.0%} (contrib {c_vol:.3f}).",
            (
                f"COT crowding hold-last: P(|z|,5y) = {crowding_pct:.0%} → "
                f"invertido {cot_score:.0%} (contrib {c_cot:.3f})."
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
            "model": "treasury_security_v2",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
