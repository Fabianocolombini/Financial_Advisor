"""Intl equity security — trend + RSI + vol_inv + hedge_fit (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _cross_sectional_percentile
from motor.src.calculo.security_score_helpers import build_security_result, collect_technicals, fit_score, rolling_beta, trend_percentile
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "intl_equity_regime.json"


def _load_weights() -> tuple[float, float, float, float]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {}
    sw = cfg.get("security_weights", {})
    return float(sw.get("wa", 0.30)), float(sw.get("wb", 0.20)), float(sw.get("wc", 0.20)), float(sw.get("wd", 0.30))


def compute_intl_equity_security_batch(
    tickers: list[str], universe_tickers: list[str] | None = None, as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    wa, wb, wc, wd = _load_weights()
    cs = list(dict.fromkeys((universe_tickers or tickers) + tickers))
    raw = collect_technicals(cs, as_of, include_sigma=True)
    p_rsi = _cross_sectional_percentile({t: v["rsi"] for t, v in raw.items()})
    p_sig = _cross_sectional_percentile({t: v["sigma"] for t, v in raw.items()})
    beta_uup = {t: abs(rolling_beta(t, "UUP")) for t in cs}

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend = trend_percentile(raw, t)
        rsi_p, sig_p = p_rsi.get(t, 0.5), p_sig.get(t, 0.5)
        vol_inv = 1.0 - sig_p
        hedge = fit_score(beta_uup, t, 0.35)
        score = wa * trend + wb * rsi_p + wc * vol_inv + wd * hedge
        comps = [
            {"id": "trend", "nome": "Tendência (MM50+MM200)", "percentile_cs": trend, "peso": wa, "contribuicao": wa * trend, "role": "trend"},
            {"id": "rsi_14", "nome": "RSI", "percentile_cs": rsi_p, "peso": wb, "contribuicao": wb * rsi_p, "role": "momentum"},
            {"id": "vol_penalty_inv", "nome": "Vol inversa", "percentile_cs": vol_inv, "peso": wc, "contribuicao": wc * vol_inv, "role": "low vol preferred"},
            {"id": "hedge_fit", "nome": "Hedge fit vs UUP", "hedge_fit": hedge, "peso": wd, "contribuicao": wd * hedge, "role": "FX hedge alignment", "is_proxy": True},
        ]
        results[t] = build_security_result(ticker=t, as_of=as_of, security_score=score, componentes=comps, model="intl_equity_security_v1", universe_size=len(cs), explanation=[f"SecurityScore = {score:.3f}."])
    return results
