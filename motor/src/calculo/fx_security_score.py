"""FX security — cost inverse + liquidity + fiscal adequacy proxy (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _cross_sectional_percentile
from motor.src.calculo.security_score_helpers import build_security_result, expense_ratio_value, fit_score, rolling_beta
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.cash_security_score import _latest_at
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "fx_regime.json"


def compute_fx_security_batch(
    tickers: list[str], universe_tickers: list[str] | None = None, as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8")) if _CONFIG_PATH.is_file() else {}
    sw = cfg.get("security_weights", {})
    wa, wb, wc = float(sw.get("wa", 0.50)), float(sw.get("wb", 0.30)), float(sw.get("wc", 0.20))
    cs = list(dict.fromkeys((universe_tickers or tickers) + tickers))
    er_raw = {t: expense_ratio_value(t) or 0.005 for t in cs}
    p_er = _cross_sectional_percentile(er_raw)
    vol_raw = {t: _latest_at(get_tecnico_series(t, "volume_vs_media"), as_of) or 0.0 for t in cs}
    p_liq = _cross_sectional_percentile(vol_raw)
    beta_uup = {t: abs(rolling_beta(t, "UUP")) for t in cs}

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        cost_inv = 1.0 - p_er.get(t, 0.5)
        liq = p_liq.get(t, 0.5)
        fiscal = fit_score(beta_uup, t, 0.25)
        score = wa * cost_inv + wb * liq + wc * fiscal
        comps = [
            {"id": "custo_efetivo_inv", "nome": "Custo efetivo inv", "percentile_cs": cost_inv, "peso": wa, "contribuicao": wa * cost_inv, "role": "expense ratio", "is_proxy": True},
            {"id": "liquidez", "nome": "Liquidez", "percentile_cs": liq, "peso": wb, "contribuicao": wb * liq, "role": "volume"},
            {"id": "adequacao_fiscal", "nome": "Adequação fiscal proxy", "fiscal_fit": fiscal, "peso": wc, "contribuicao": wc * fiscal, "role": "USD beta fit", "is_proxy": True},
        ]
        results[t] = build_security_result(ticker=t, as_of=as_of, security_score=score, componentes=comps, model="fx_security_v1", universe_size=len(cs), explanation=[f"SecurityScore = {score:.3f} (FX sleeve)."])
    return results
