"""Healthcare / biotech class regime model (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.models.cash_regime_model import _action_from_score, _clip, _percentile_0_1
from motor.src.calculo.models.ig_regime_model import _delta_series, _z_at
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.proxy_indicators import compute_proxy_series
from motor.src.calculo.regime_series import biotech_rs_z, risk_appetite_pct
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "healthcare_biotech_regime.json"


def compute_healthcare_biotech_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    delta_days = int(cfg.get("delta_yield_days", 20))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4, w5 = [float(w.get(f"w{i}", 0.2)) for i in range(1, 6)]
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})

    y10 = get_fred_series("DGS10")
    y10_pct, y10_val = _percentile_0_1(y10, as_of, window)
    y10_low = 1.0 - y10_pct
    rs_z, _ = biotech_rs_z(as_of, window)
    rs_contrib = max(0.0, min(1.0, (rs_z + 2.0) / 4.0))
    risk_app, _ = risk_appetite_pct(as_of, window)
    pf = compute_proxy_series("private_funding_proxy")
    pf_pct, pf_val = _percentile_0_1(pf, as_of, window) if not pf.empty else (0.5, None)
    delta_y10 = _delta_series(y10, delta_days)
    delta_z, delta_val = _z_at(delta_y10, as_of, window)
    delta_pen = _clip(delta_z, 0.0, 3.0) / 3.0

    score = w1 * y10_low + w2 * rs_contrib + w3 * risk_app + w4 * pf_pct - w5 * delta_pen
    action_calc = _action_from_score(score, thresholds, labels)

    componentes = [
        {"id": "yield_10y_low", "nome": "10y yield low", "valor": y10_val, "peso": w1, "contribuicao": w1 * y10_low, "role": "rates"},
        {"id": "biotech_rs_z", "nome": "Biotech RS z", "z_score": rs_z, "peso": w2, "contribuicao": w2 * rs_contrib, "role": "relative strength"},
        {"id": "risk_appetite", "nome": "Risk appetite (VIX inv)", "peso": w3, "contribuicao": w3 * risk_app, "role": "risk-on"},
        {"id": "private_funding", "nome": "Private funding proxy", "valor": pf_val, "percentile_0_1": pf_pct, "peso": w4, "contribuicao": w4 * pf_pct, "role": "funding", "is_proxy": True},
        {"id": "delta_yield_10y", "nome": f"Δ 10y {delta_days}d", "valor": delta_val, "z_score": delta_z, "peso": w5, "contribuicao": -w5 * delta_pen, "role": "rate shock penalty"},
    ]
    result = build_regime_result(
        aba_id="healthcare_biotech", nome="Biotech e saúde", score=score,
        score_key="healthcare_biotech_regime_score", regime_action=action_calc, action_calc=action_calc,
        componentes=componentes, model="healthcare_biotech_regime_v1",
        explanation=[f"BiotechRegimeScore = {score:.3f} → **{action_calc}**."],
        calibrated=bool(cfg.get("calibrated", False)), calibration_note=cfg.get("note", ""),
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_healthcare_biotech_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = get_fred_series("DGS10")
    if ref.empty:
        r = compute_healthcare_biotech_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_healthcare_biotech_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def healthcare_biotech_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_healthcare_biotech_regime(as_of)
    r["aba_id"] = aba_id
    return r
