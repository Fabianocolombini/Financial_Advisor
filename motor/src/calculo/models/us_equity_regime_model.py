"""US equity class regime model — how much US equity to allocate (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.models.cash_regime_model import (
    _action_from_score,
    _clip,
    _min_action,
    _percentile_0_1,
    regime_action_to_estagio,
)
from motor.src.calculo.models.ig_regime_model import _z_at
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.regime_series import (
    cape_shiller_series,
    curve_deinversion_lag_flag,
    earnings_revision_proxy_series,
    external_series,
)
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "us_equity_regime.json"


def _load_config() -> dict[str, Any]:
    if not _CONFIG_PATH.is_file():
        return {"calibrated": False, "regime_weights": {"w1": 0.15, "w2": 0.30, "w3": 0.15, "w4": 0.10, "w5": 0.10, "w6": 0.20}}
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def compute_us_equity_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = _load_config()
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    er_window = int(cfg.get("er_percentile_window_days", 504))
    er_thr = float(cfg.get("recession_er_threshold", 0.30))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4, w5, w6 = [float(w.get(f"w{i}", 0)) for i in range(1, 7)]
    thresholds = cfg.get("thresholds", {})
    labels = cfg.get("action_labels", {})

    cape = cape_shiller_series()
    cape_pct, cape_val = _percentile_0_1(cape, as_of, window)
    cape_cheap = 1.0 - cape_pct

    er_series = earnings_revision_proxy_series("SPY")
    er_z, er_val = _z_at(er_series, as_of, er_window)
    er_contrib = _clip((er_z + 2.0) / 4.0, 0.0, 1.0)

    pc = external_series("cboe", "put_call_ratio")
    pc_pct, pc_val = _percentile_0_1(pc, as_of, window)
    pc_contra = 1.0 - pc_pct

    aaii = external_series("aaii", "aaii_sentiment")
    aaii_pct, aaii_val = _percentile_0_1(aaii, as_of, window)
    aaii_contra = 1.0 - aaii_pct

    naaim = external_series("naaim", "naaim_exposure")
    naaim_pct, naaim_val = _percentile_0_1(naaim, as_of, window)
    naaim_contra = 1.0 - naaim_pct

    md = external_series("finra", "margin_debt")
    md_pct, md_val = _percentile_0_1(md, as_of, window)

    score = (
        w1 * cape_cheap + w2 * er_contrib + w3 * pc_contra
        + w4 * aaii_contra + w5 * naaim_contra - w6 * md_pct
    )

    er_pct, _ = _percentile_0_1(er_series, as_of, er_window)
    c_lag = curve_deinversion_lag_flag(as_of)
    recession_warning = c_lag and er_pct < er_thr

    action_calc = _action_from_score(score, thresholds, labels)
    regime_action = _min_action(action_calc, labels.get("reduce", "Reduce")) if recession_warning else action_calc

    componentes = [
        {"id": "cape_cheap", "nome": "CAPE barato", "valor": cape_val, "percentile_0_1": cape_pct, "cape_cheap": cape_cheap, "peso": w1, "contribuicao": w1 * cape_cheap, "role": "valuation"},
        {"id": "earnings_revision", "nome": "Earnings revision z", "valor": er_val, "z_score": er_z, "er_contrib_0_1": er_contrib, "peso": w2, "contribuicao": w2 * er_contrib, "role": "fundamental", "is_proxy": True},
        {"id": "put_call_contra", "nome": "Put/call contrarian", "valor": pc_val, "pc_contra": pc_contra, "peso": w3, "contribuicao": w3 * pc_contra, "role": "sentiment"},
        {"id": "aaii_contra", "nome": "AAII contrarian", "valor": aaii_val, "aaii_contra": aaii_contra, "peso": w4, "contribuicao": w4 * aaii_contra, "role": "sentiment"},
        {"id": "naaim_contra", "nome": "NAAIM contrarian", "valor": naaim_val, "naaim_contra": naaim_contra, "peso": w5, "contribuicao": w5 * naaim_contra, "role": "positioning"},
        {"id": "margin_debt", "nome": "Margin debt", "valor": md_val, "percentile_0_1": md_pct, "peso": w6, "contribuicao": -w6 * md_pct, "role": "leverage penalty"},
    ]

    explanation = [
        f"USEquityRegimeScore = {score:.3f} → ação **{regime_action}**.",
        f"CAPE cheap={cape_cheap:.0%}; ER z={er_z:.2f}; MD pct={md_pct:.0%}.",
    ]
    if recession_warning:
        explanation.append(f"Recession warning (C_lag + P(ER)<{er_thr:.0%}) → teto Reduce.")

    result = build_regime_result(
        aba_id="us_equity", nome="Mercado Amplo US", score=score,
        score_key="us_equity_regime_score", regime_action=regime_action,
        action_calc=action_calc, componentes=componentes, model="us_equity_regime_v1",
        explanation=explanation, calibrated=bool(cfg.get("calibrated", False)),
        calibration_note=cfg.get("note", ""), stress_flag=recession_warning,
        extra={"recession_warning_flag": recession_warning, "c_lag": c_lag},
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_us_equity_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score
    ref = cape_shiller_series()
    if ref.empty:
        ref = earnings_revision_proxy_series()
    if ref.empty:
        r = compute_us_equity_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    as_of_cap = motor_as_of_date()
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(as_of_cap)][-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_us_equity_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def us_equity_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_us_equity_regime(as_of)
    r["aba_id"] = aba_id
    return r
