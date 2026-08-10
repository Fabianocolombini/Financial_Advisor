"""Precious metals security — trend + RSI + volume − expense ratio (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _cross_sectional_percentile
from motor.src.calculo.security_score_helpers import build_security_result, collect_technicals, expense_ratio_value, trend_percentile
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "commodities_precious_regime.json"


def compute_commodities_precious_security_batch(
    tickers: list[str], universe_tickers: list[str] | None = None, as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {}
    sw = cfg.get("security_weights", {})
    wa, wb, wc, wd = float(sw.get("wa", 0.35)), float(sw.get("wb", 0.25)), float(sw.get("wc", 0.25)), float(sw.get("wd", 0.15))
    cs = list(dict.fromkeys((universe_tickers or tickers) + tickers))
    raw = collect_technicals(cs, as_of)
    p_rsi = _cross_sectional_percentile({t: v["rsi"] for t, v in raw.items()})
    p_vol = _cross_sectional_percentile({t: v["volume"] for t, v in raw.items()})
    er_raw = {t: expense_ratio_value(t) or 0.005 for t in cs}
    p_er = _cross_sectional_percentile(er_raw)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend = trend_percentile(raw, t)
        er_p = p_er.get(t, 0.5)
        er_inv = 1.0 - er_p
        score = wa * trend + wb * p_rsi.get(t, 0.5) + wc * p_vol.get(t, 0.5) + wd * er_inv
        comps = [
            {"id": "trend", "nome": "Tendência", "percentile_cs": trend, "peso": wa, "contribuicao": wa * trend, "role": "trend"},
            {"id": "rsi_14", "nome": "RSI", "percentile_cs": p_rsi.get(t, 0.5), "peso": wb, "contribuicao": wb * p_rsi.get(t, 0.5), "role": "momentum"},
            {"id": "volume_vs_media", "nome": "Volume", "percentile_cs": p_vol.get(t, 0.5), "peso": wc, "contribuicao": wc * p_vol.get(t, 0.5), "role": "liquidity"},
            {"id": "expense_ratio", "nome": "Expense ratio inv", "percentile_cs": er_inv, "peso": wd, "contribuicao": wd * er_inv, "role": "cost", "is_proxy": True},
        ]
        results[t] = build_security_result(ticker=t, as_of=as_of, security_score=score, componentes=comps, model="commodities_precious_security_v1", universe_size=len(cs), explanation=[f"SecurityScore = {score:.3f}."])
    return results
