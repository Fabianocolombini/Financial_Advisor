"""US equity security selection — trend + RSI + volume − vol penalty (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _cross_sectional_percentile
from motor.src.calculo.security_score_helpers import (
    build_security_result,
    collect_technicals,
    trend_percentile,
)
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "us_equity_regime.json"


def _load_weights() -> dict[str, float]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {}
    sw = cfg.get("security_weights", {})
    return {k: float(sw.get(k, v)) for k, v in {"wa": 0.35, "wb": 0.25, "wc": 0.20, "wd": 0.20}.items()}


def compute_us_equity_security_batch(
    tickers: list[str], universe_tickers: list[str] | None = None, as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    wa, wb, wc, wd = _load_weights().values()
    cs = list(dict.fromkeys((universe_tickers or tickers) + tickers))
    raw = collect_technicals(cs, as_of, include_sigma=True)
    p_rsi = _cross_sectional_percentile({t: v["rsi"] for t, v in raw.items()})
    p_vol = _cross_sectional_percentile({t: v["volume"] for t, v in raw.items()})
    p_sig = _cross_sectional_percentile({t: v["sigma"] for t, v in raw.items()})

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend = trend_percentile(raw, t)
        rsi_p, vol_p, sig_p = p_rsi.get(t, 0.5), p_vol.get(t, 0.5), p_sig.get(t, 0.5)
        score = wa * trend + wb * rsi_p + wc * vol_p - wd * sig_p
        comps = [
            {"id": "trend", "nome": "Tendência MM50+MM200", "percentile_cs": trend, "peso": wa, "contribuicao": wa * trend, "role": "trend"},
            {"id": "rsi_14", "nome": "RSI 14d", "percentile_cs": rsi_p, "peso": wb, "contribuicao": wb * rsi_p, "role": "momentum"},
            {"id": "volume_vs_media", "nome": "Volume vs média", "percentile_cs": vol_p, "peso": wc, "contribuicao": wc * vol_p, "role": "liquidity"},
            {"id": "vol_realizada", "nome": "Vol σ20", "percentile_cs": sig_p, "peso": wd, "contribuicao": -wd * sig_p, "role": "vol penalty"},
        ]
        results[t] = build_security_result(
            ticker=t, as_of=as_of, security_score=score, componentes=comps,
            model="us_equity_security_v1", universe_size=len(cs),
            explanation=[f"SecurityScore = {score:.3f} (US equity ranking)."],
        )
    return results
