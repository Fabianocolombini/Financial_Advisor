"""BDC security — trend + NAV discount + yield − vol (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _cross_sectional_percentile
from motor.src.calculo.security_score_helpers import build_security_result, collect_technicals, nav_discount_proxy, trend_percentile, yield_percentile
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "bdc_regime.json"


def compute_bdc_security_batch(
    tickers: list[str], universe_tickers: list[str] | None = None, as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {}
    sw = cfg.get("security_weights", {})
    wa, wb, wc, wd = float(sw.get("wa", 0.25)), float(sw.get("wb", 0.30)), float(sw.get("wc", 0.25)), float(sw.get("wd", 0.20))
    cs = list(dict.fromkeys((universe_tickers or tickers) + tickers))
    raw = collect_technicals(cs, as_of, include_rsi=False, include_sigma=True)
    p_yield = yield_percentile(cs, as_of)
    p_sig = _cross_sectional_percentile({t: v["sigma"] for t, v in raw.items()})
    nav_raw = {t: nav_discount_proxy(t) or 0.0 for t in cs}
    p_nav = _cross_sectional_percentile(nav_raw)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend = trend_percentile(raw, t)
        nav_p = p_nav.get(t, 0.5)
        score = wa * trend + wb * nav_p + wc * p_yield.get(t, 0.5) - wd * p_sig.get(t, 0.5)
        comps = [
            {"id": "trend", "nome": "Tendência", "percentile_cs": trend, "peso": wa, "contribuicao": wa * trend, "role": "trend"},
            {"id": "nav_discount", "nome": "NAV discount", "percentile_cs": nav_p, "peso": wb, "contribuicao": wb * nav_p, "role": "valuation", "is_proxy": True},
            {"id": "dividend_yield", "nome": "Yield", "percentile_cs": p_yield.get(t, 0.5), "peso": wc, "contribuicao": wc * p_yield.get(t, 0.5), "role": "income"},
            {"id": "vol_realizada", "nome": "Vol σ20", "percentile_cs": p_sig.get(t, 0.5), "peso": wd, "contribuicao": -wd * p_sig.get(t, 0.5), "role": "vol penalty"},
        ]
        results[t] = build_security_result(ticker=t, as_of=as_of, security_score=score, componentes=comps, model="bdc_security_v1", universe_size=len(cs), explanation=[f"SecurityScore = {score:.3f}."])
    return results
