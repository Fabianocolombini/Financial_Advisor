"""Infrastructure / utilities class regime model (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.models.cash_regime_model import _action_from_score, _percentile_0_1
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.regime_series import breakeven_lagged_z, infrastructure_gov_z, utilities_z
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "alt_infrastructure_regime.json"


def compute_alt_infrastructure_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4 = [float(w.get(f"w{i}", 0.25)) for i in range(1, 5)]
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})

    ry = get_fred_series("DFII10")
    ry_pct, ry_val = _percentile_0_1(ry, as_of, window)
    ry_low = 1.0 - ry_pct
    be_z, be_val = breakeven_lagged_z(as_of, window)
    be_contrib = max(0.0, min(1.0, (be_z + 2.0) / 4.0))
    gov_z, _ = infrastructure_gov_z(as_of, window)
    gov_contrib = max(0.0, min(1.0, (gov_z + 2.0) / 4.0))
    util_z, _ = utilities_z(as_of, window)
    util_contrib = max(0.0, min(1.0, (util_z + 2.0) / 4.0))

    score = w1 * ry_low + w2 * be_contrib + w3 * gov_contrib + w4 * util_contrib
    action_calc = _action_from_score(score, thresholds, labels)

    componentes = [
        {"id": "real_yield_low", "nome": "Real yield low", "valor": ry_val, "peso": w1, "contribuicao": w1 * ry_low, "role": "rates"},
        {"id": "breakeven_lagged", "nome": "Breakeven lagged z", "valor": be_val, "z_score": be_z, "peso": w2, "contribuicao": w2 * be_contrib, "role": "inflation"},
        {"id": "infra_gov_z", "nome": "Infrastructure gov z", "z_score": gov_z, "peso": w3, "contribuicao": w3 * gov_contrib, "role": "infra momentum", "is_proxy": True},
        {"id": "utilities_z", "nome": "Utilities z", "z_score": util_z, "peso": w4, "contribuicao": w4 * util_contrib, "role": "defensive beta"},
    ]
    result = build_regime_result(
        aba_id="alt_infrastructure", nome="Infrastructure / Utilities", score=score,
        score_key="alt_infrastructure_regime_score", regime_action=action_calc, action_calc=action_calc,
        componentes=componentes, model="alt_infrastructure_regime_v1",
        explanation=[f"InfraRegimeScore = {score:.3f} → **{action_calc}**."],
        calibrated=bool(cfg.get("calibrated", False)), calibration_note=cfg.get("note", ""),
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_alt_infrastructure_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = get_fred_series("DFII10")
    if ref.empty:
        r = compute_alt_infrastructure_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_alt_infrastructure_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def alt_infrastructure_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_alt_infrastructure_regime(as_of)
    r["aba_id"] = aba_id
    return r
