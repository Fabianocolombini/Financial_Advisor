"""Emerging markets equity regime model (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import embi_spread_series, get_fred_series
from motor.src.calculo.models.cash_regime_model import _action_from_score, _min_action, _percentile_0_1
from motor.src.calculo.models.regime_result import build_regime_result
from motor.src.calculo.regime_series import china_equity_z, commodity_index_z, usd_weak_pct
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "em_equity_regime.json"


def compute_em_equity_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {"calibrated": False}
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    w = cfg.get("regime_weights", {})
    w1, w2, w3, w4 = [float(w.get(f"w{i}", 0.25)) for i in range(1, 5)]
    thresholds, labels = cfg.get("thresholds", {}), cfg.get("action_labels", {})
    dxy_thr = float(cfg.get("em_stress_dxy_pct", 0.85))
    vix_thr = float(cfg.get("em_stress_vix_pct", 0.80))

    usd_weak, _ = usd_weak_pct(as_of, window)
    embi = embi_spread_series()
    embi_pct, embi_val = _percentile_0_1(embi, as_of, window)
    comm_z, _ = commodity_index_z(as_of, window)
    comm_contrib = max(0.0, min(1.0, (comm_z + 2.0) / 4.0))
    cn_z, _ = china_equity_z(as_of, window)
    cn_contrib = max(0.0, min(1.0, (cn_z + 2.0) / 4.0))

    score = w1 * usd_weak + w2 * embi_pct + w3 * comm_contrib + w4 * cn_contrib

    dxy = get_fred_series("DTWEXBGS")
    vix = get_fred_series("VIXCLS")
    dxy_pct, _ = _percentile_0_1(dxy, as_of, window)
    vix_pct, _ = _percentile_0_1(vix, as_of, window)
    em_stress = dxy_pct > dxy_thr and vix_pct > vix_thr

    action_calc = _action_from_score(score, thresholds, labels)
    regime_action = _min_action(action_calc, labels.get("strong_reduce", "Strong Reduce")) if em_stress else action_calc

    componentes = [
        {"id": "usd_weak", "nome": "USD fraco", "peso": w1, "contribuicao": w1 * usd_weak, "role": "FX"},
        {"id": "embi_cheap", "nome": "EMBI spread", "valor": embi_val, "percentile_0_1": embi_pct, "peso": w2, "contribuicao": w2 * embi_pct, "role": "spread carry"},
        {"id": "commodity_z", "nome": "Commodity z", "z_score": comm_z, "peso": w3, "contribuicao": w3 * comm_contrib, "role": "commodity cycle"},
        {"id": "china_z", "nome": "China equity z", "z_score": cn_z, "peso": w4, "contribuicao": w4 * cn_contrib, "role": "China growth"},
    ]
    result = build_regime_result(
        aba_id="em_equity", nome="Ações Mercados Emergentes", score=score,
        score_key="em_equity_regime_score", regime_action=regime_action, action_calc=action_calc,
        componentes=componentes, model="em_equity_regime_v1",
        explanation=[f"EMEquityRegimeScore = {score:.3f} → **{regime_action}**."],
        calibrated=bool(cfg.get("calibrated", False)), stress_flag=em_stress,
        extra={"em_stress_flag": em_stress},
    )
    result["data"] = as_of.isoformat()
    return result


def backfill_em_equity_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score
    ref = embi_spread_series()
    if ref.empty:
        r = compute_em_equity_regime(motor_as_of_date())
        persist_aba_score(r, estagio=r["estagio"])
        return 1
    dates = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(motor_as_of_date())][-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        r = compute_em_equity_regime(d_date)
        persist_aba_score(r, estagio=r["estagio"])
        n += 1
    return n


def em_equity_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    r = compute_em_equity_regime(as_of)
    r["aba_id"] = aba_id
    return r
