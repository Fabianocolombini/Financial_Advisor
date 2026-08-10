"""Precious metals regime model (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.models.cash_regime_model import _action_from_score, _clip, _percentile_0_1
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.regime_series import external_series, gold_etf_crowding_z, usd_weak_pct
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "commodities_precious_regime.json"


def compute_commodities_precious_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4, w5 = [float(w.get(f"w{i}", 0.2)) for i in range(1, 6)]
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})

    ry = get_fred_series("DFII10")
    ry_pct, _ = _percentile_0_1(ry, as_of, window)
    ry_low = 1.0 - ry_pct
    usd_weak, _ = usd_weak_pct(as_of, window)
    cb = external_series("wgc", "cb_gold_buying")
    cb_pct, cb_val = _percentile_0_1(cb, as_of, window)
    gld = external_series("etf_holdings", "gld_holdings_tonnes")
    etf_pct, etf_val = _percentile_0_1(gld, as_of, window) if not gld.empty else (0.5, None)
    crowd_z, _ = gold_etf_crowding_z(as_of, window)
    crowd_pen = _clip(crowd_z, 0.0, 3.0) / 3.0

    score = w1 * ry_low + w2 * usd_weak + w3 * cb_pct + w4 * etf_pct - w5 * crowd_pen
    action_calc = _action_from_score(score, thresholds, labels)

    componentes = [
        {"id": "real_yield_low", "nome": "Real yield low", "peso": w1, "contribuicao": w1 * ry_low, "role": "macro"},
        {"id": "usd_weak", "nome": "USD fraco", "peso": w2, "contribuicao": w2 * usd_weak, "role": "FX"},
        {"id": "cb_gold_buying", "nome": "Central bank buying", "valor": cb_val, "peso": w3, "contribuicao": w3 * cb_pct, "role": "demand"},
        {"id": "etf_holdings", "nome": "GLD holdings z", "valor": etf_val, "peso": w4, "contribuicao": w4 * etf_pct, "role": "ETF demand"},
        {"id": "crowding", "nome": "Gold crowding", "z_score": crowd_z, "peso": w5, "contribuicao": -w5 * crowd_pen, "role": "positioning penalty"},
    ]
    result = build_regime_result(
        aba_id="commodities_precious", nome="Metais Preciosos", score=score,
        score_key="commodities_precious_regime_score", regime_action=action_calc, action_calc=action_calc,
        componentes=componentes, model="commodities_precious_regime_v1",
        explanation=[f"PreciousRegimeScore = {score:.3f} → **{action_calc}**."],
        calibrated=bool(cfg.get("calibrated", False)),
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_commodities_precious_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score
    ref = get_fred_series("DFII10")
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:] if not ref.empty else []
    if not len(dates):
        r = compute_commodities_precious_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_commodities_precious_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def commodities_precious_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_commodities_precious_regime(as_of)
    r["aba_id"] = aba_id
    return r
