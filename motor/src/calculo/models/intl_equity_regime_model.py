"""International equity regime model — how much intl equity to allocate (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.models.cash_regime_model import _action_from_score, _percentile_0_1
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.regime_series import (
    cape_gap_cheap_pct,
    oecd_composite_z,
    rate_diff_narrow_pct,
    usd_weak_pct,
)
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "intl_equity_regime.json"


def _load_config() -> dict[str, Any]:
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}


def compute_intl_equity_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = _load_config()
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4 = [float(w.get(f"w{i}", 0.25)) for i in range(1, 5)]
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})

    gap_cheap, gap_val = cape_gap_cheap_pct(as_of, window)
    usd_weak, dxy_val = usd_weak_pct(as_of, window)
    oecd_z, oecd_val = oecd_composite_z(as_of, window)
    oecd_contrib = max(0.0, min(1.0, (oecd_z + 2.0) / 4.0))
    rd_narrow, rd_val = rate_diff_narrow_pct(as_of, window)

    score = w1 * gap_cheap + w2 * usd_weak + w3 * oecd_contrib + w4 * rd_narrow
    action_calc = _action_from_score(score, thresholds, labels)

    componentes = [
        {"id": "cape_gap", "nome": "CAPE gap cheap", "valor": gap_val, "peso": w1, "contribuicao": w1 * gap_cheap, "role": "relative valuation"},
        {"id": "usd_weak", "nome": "USD fraco", "valor": dxy_val, "peso": w2, "contribuicao": w2 * usd_weak, "role": "FX tailwind"},
        {"id": "oecd_z", "nome": "OECD composite z", "valor": oecd_val, "z_score": oecd_z, "peso": w3, "contribuicao": w3 * oecd_contrib, "role": "macro growth"},
        {"id": "rate_diff_narrow", "nome": "Rate diff narrow", "valor": rd_val, "peso": w4, "contribuicao": w4 * rd_narrow, "role": "carry normalization"},
    ]
    result = build_regime_result(
        aba_id="intl_equity", nome="Ações Internacionais", score=score,
        score_key="intl_equity_regime_score", regime_action=action_calc, action_calc=action_calc,
        componentes=componentes, model="intl_equity_regime_v1",
        explanation=[f"IntlEquityRegimeScore = {score:.3f} → **{action_calc}**."],
        calibrated=bool(cfg.get("calibrated", False)), calibration_note=cfg.get("note", ""),
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_intl_equity_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score
    from motor.src.calculo.derivados import compute_formula
    ref = compute_formula("pe_EFA_div_SPY")
    if ref.empty:
        r = compute_intl_equity_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_intl_equity_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def intl_equity_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_intl_equity_regime(as_of)
    r["aba_id"] = aba_id
    return r
