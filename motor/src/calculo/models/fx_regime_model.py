"""FX conversion pace regime model (Model 1) — pace actions, not allocation."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.models.regime_result import build_regime_result, pace_action_from_score
from motor.src.calculo.regime_series import fx_carry_penalty, fx_crowding_penalty, reer_cheap_pct
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "fx_regime.json"


def compute_fx_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    w = cfg.get("regime_weights", {})
    w1, w2, w3 = float(w.get("w1", 0.50)), float(w.get("w2", 0.30)), float(w.get("w3", 0.20))
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})

    reer_cheap, reer_val = reer_cheap_pct(as_of, window)
    carry_pen, carry_val = fx_carry_penalty(as_of, window)
    crowd_pen, crowd_val = fx_crowding_penalty(as_of, window)

    score = w1 * reer_cheap - w2 * carry_pen - w3 * crowd_pen
    action_calc = pace_action_from_score(score, thresholds, labels)

    componentes = [
        {"id": "reer_cheap", "nome": "REER / USD cheap", "valor": reer_val, "peso": w1, "contribuicao": w1 * reer_cheap, "role": "valuation", "is_proxy": True},
        {"id": "carry_penalty", "nome": "Carry penalty", "valor": carry_val, "peso": w2, "contribuicao": -w2 * carry_pen, "role": "rate differential"},
        {"id": "crowding_penalty", "nome": "Crowding penalty", "valor": crowd_val, "peso": w3, "contribuicao": -w3 * crowd_pen, "role": "positioning", "is_proxy": True},
    ]
    result = build_regime_result(
        aba_id="currencies", nome="FX / moedas", score=score,
        score_key="fx_regime_score", regime_action=action_calc, action_calc=action_calc,
        componentes=componentes, model="fx_regime_v1",
        explanation=[f"ConversionPaceScore = {score:.3f} → **{action_calc}** (ritmo de conversão)."],
        calibrated=bool(cfg.get("calibrated", False)), calibration_note=cfg.get("note", ""),
        output_type="pace",
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_fx_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = get_fred_series("DTWEXBGS")
    if ref.empty:
        r = compute_fx_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_fx_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def fx_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_fx_regime(as_of)
    r["aba_id"] = aba_id
    return r
