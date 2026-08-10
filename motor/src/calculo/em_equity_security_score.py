"""EM equity security — trend + RSI + volume + china_fit (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _cross_sectional_percentile
from motor.src.calculo.security_score_helpers import build_security_result, collect_technicals, fit_score, rolling_beta, trend_percentile
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "em_equity_regime.json"


def compute_em_equity_security_batch(
    tickers: list[str], universe_tickers: list[str] | None = None, as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {}
    sw = cfg.get("security_weights", {})
    wa, wb, wc, wd = float(sw.get("wa", 0.30)), float(sw.get("wb", 0.20)), float(sw.get("wc", 0.20)), float(sw.get("wd", 0.30))
    cs = list(dict.fromkeys((universe_tickers or tickers) + tickers))
    raw = collect_technicals(cs, as_of)
    p_rsi = _cross_sectional_percentile({t: v["rsi"] for t, v in raw.items()})
    p_vol = _cross_sectional_percentile({t: v["volume"] for t, v in raw.items()})
    china_beta = {t: rolling_beta(t, "FXI") for t in cs}

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend = trend_percentile(raw, t)
        china = fit_score(china_beta, t, 0.6)
        score = wa * trend + wb * p_rsi.get(t, 0.5) + wc * p_vol.get(t, 0.5) + wd * china
        comps = [
            {"id": "trend", "nome": "Tendência", "percentile_cs": trend, "peso": wa, "contribuicao": wa * trend, "role": "trend"},
            {"id": "rsi_14", "nome": "RSI", "percentile_cs": p_rsi.get(t, 0.5), "peso": wb, "contribuicao": wb * p_rsi.get(t, 0.5), "role": "momentum"},
            {"id": "volume_vs_media", "nome": "Volume", "percentile_cs": p_vol.get(t, 0.5), "peso": wc, "contribuicao": wc * p_vol.get(t, 0.5), "role": "liquidity"},
            {"id": "china_fit", "nome": "China beta fit", "china_fit": china, "peso": wd, "contribuicao": wd * china, "role": "China exposure", "is_proxy": True},
        ]
        results[t] = build_security_result(ticker=t, as_of=as_of, security_score=score, componentes=comps, model="em_equity_security_v1", universe_size=len(cs), explanation=[f"SecurityScore = {score:.3f}."])
    return results
