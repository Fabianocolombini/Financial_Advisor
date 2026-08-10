"""TIPS class regime model — how much TIPS to allocate (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import (
    breakeven_spot_series,
    cpi_core_momentum_3m_series,
    get_fred_series,
    tips_liquidity_proxy_series,
)
from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.models.cash_regime_model import (
    _action_from_score,
    _clip,
    _min_action,
    _percentile_0_1,
    _scalar_at,
    regime_action_to_estagio,
)
from motor.src.calculo.models.ig_regime_model import _z_at
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "tips_regime.json"


def _load_config() -> dict[str, Any]:
    if not _CONFIG_PATH.is_file():
        return {
            "calibrated": False,
            "regime_weights": {"w1": 0.35, "w2": 0.30, "w3": 0.20, "w4": 0.15},
            "thresholds": {"overweight": 0.65, "hold": 0.45, "reduce": 0.25},
            "liquidity_percentile": 0.85,
            "percentile_window_days": 1260,
            "real_yield_fred": "DFII10",
            "breakeven_5y5y_fred": "T5YIFR",
            "cpi_core_fred": "CPILFESL",
            "tips_liquidity_ticker": "TIP",
        }
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def _cpi_breakeven_gap_series() -> pd.Series:
    cpi_m = cpi_core_momentum_3m_series()
    be = breakeven_spot_series()
    if cpi_m.empty or be.empty:
        return pd.Series(dtype=float)
    combined = pd.concat([cpi_m, be], axis=1, join="inner")
    combined.columns = ["cpi_m", "be"]
    return (combined["cpi_m"] - combined["be"]).dropna()


def compute_tips_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = _load_config()
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    liq_thr = float(cfg.get("liquidity_percentile", 0.85))
    weights = cfg.get("regime_weights", {})
    w1 = float(weights.get("w1", 0.35))
    w2 = float(weights.get("w2", 0.30))
    w3 = float(weights.get("w3", 0.20))
    w4 = float(weights.get("w4", 0.15))
    thresholds = cfg.get("thresholds", {})
    labels = cfg.get("action_labels", {})
    ry_fred = cfg.get("real_yield_fred", "DFII10")
    be5_fred = cfg.get("breakeven_5y5y_fred", "T5YIFR")

    ry_series = get_fred_series(ry_fred)
    be5_series = get_fred_series(be5_fred)
    be_series = breakeven_spot_series()
    cpi_m_series = cpi_core_momentum_3m_series()
    gap_series = _cpi_breakeven_gap_series()
    f_series = get_external_series("cme", "fed_cut_probability")
    liq_series = tips_liquidity_proxy_series()
    v_series = get_fred_series("VIXCLS")

    ry_pct, ry_val = _percentile_0_1(ry_series, as_of, window)
    be5_pct, be5_val = _percentile_0_1(be5_series, as_of, window)
    be_cheap = 1.0 - be5_pct
    cpi_gap_z, cpi_gap_val = _z_at(gap_series, as_of, window)
    cpi_gap_contrib = _clip(cpi_gap_z, 0.0, 3.0) / 3.0
    f_val = _scalar_at(f_series, as_of)
    if f_val is None:
        f_val = 0.5
    f_bonus = _clip((f_val - 0.5) * 2.0, 0.0, 1.0)
    liq_pct, liq_val = _percentile_0_1(liq_series, as_of, window)
    v_pct, v_val = _percentile_0_1(v_series, as_of, window)
    be_val = _scalar_at(be_series, as_of)
    cpi_m_val = _scalar_at(cpi_m_series, as_of)

    tips_regime_score = (
        w1 * ry_pct + w2 * be_cheap + w3 * cpi_gap_contrib + w4 * f_bonus
    )

    tips_liquidity_flag = v_pct > liq_thr and liq_pct > liq_thr

    action_calc = _action_from_score(tips_regime_score, thresholds, labels)
    regime_action = (
        _min_action(action_calc, labels.get("hold", "Hold"))
        if tips_liquidity_flag
        else action_calc
    )

    componentes = [
        {
            "id": "real_yield_10y",
            "nome": "Yield real 10y (RY)",
            "valor": ry_val,
            "percentile_0_1": ry_pct,
            "peso": w1,
            "contribuicao": w1 * ry_pct,
            "role": "carry real — yield TIPS vs histórico 5y",
        },
        {
            "id": "breakeven_5y5y",
            "nome": "Breakeven 5y5y (BE5)",
            "valor": be5_val,
            "percentile_0_1": be5_pct,
            "be_cheap": be_cheap,
            "peso": w2,
            "contribuicao": w2 * be_cheap,
            "role": "valuation — BE5 barato quando pct baixo (invertido)",
        },
        {
            "id": "cpi_breakeven_gap",
            "nome": "CPI momentum − breakeven spot",
            "valor": cpi_gap_val,
            "cpi_m": cpi_m_val,
            "breakeven_spot": be_val,
            "z_score": cpi_gap_z,
            "gap_contrib_0_1": cpi_gap_contrib,
            "peso": w3,
            "contribuicao": w3 * cpi_gap_contrib,
            "role": "gap inflação realizada vs mercado",
        },
        {
            "id": "fed_cut_probability",
            "nome": "Fed cut probability 6m (F)",
            "valor": f_val,
            "bonus_0_1": f_bonus,
            "peso": w4,
            "contribuicao": w4 * f_bonus,
            "role": "bônus — corte favorece TIPS",
        },
        {
            "id": "tips_liquidity_proxy",
            "nome": "Liquidez proxy σ20 TIP (LIQ)",
            "valor": liq_val,
            "percentile_0_1": liq_pct,
            "is_proxy": True,
            "proxy_rationale": "Vol realizada 20d do ETF TIP como proxy de stress de liquidez",
            "peso": 0.0,
            "contribuicao": 0.0,
            "role": "override com VIX — não entra no score",
        },
        {
            "id": "vix",
            "nome": "VIX (V)",
            "valor": v_val,
            "percentile_0_1": v_pct,
            "peso": 0.0,
            "contribuicao": 0.0,
            "role": "liquidity override com LIQ proxy",
        },
    ]

    dominant = max(
        [c for c in componentes if c["peso"] > 0],
        key=lambda c: abs(c["contribuicao"]),
        default=None,
    )

    explanation = _build_explanation(
        tips_regime_score=tips_regime_score,
        regime_action=regime_action,
        action_calc=action_calc,
        tips_liquidity_flag=tips_liquidity_flag,
        ry_pct=ry_pct,
        ry_val=ry_val,
        be_cheap=be_cheap,
        be5_val=be5_val,
        cpi_gap_z=cpi_gap_z,
        f_val=f_val,
        f_bonus=f_bonus,
        v_pct=v_pct,
        liq_pct=liq_pct,
        calibrated=bool(cfg.get("calibrated", False)),
    )

    return {
        "aba_id": "fi_tips",
        "nome": "TIPS e inflação",
        "data": as_of.isoformat(),
        "tips_regime_score": tips_regime_score,
        "score_composto": tips_regime_score,
        "regime_action": regime_action,
        "regime_action_calculated": action_calc,
        "tips_liquidity_flag": tips_liquidity_flag,
        "stress_flag": tips_liquidity_flag,
        "estagio": regime_action_to_estagio(regime_action),
        "componentes": componentes,
        "indicador_dominante": dominant,
        "calibrated": bool(cfg.get("calibrated", False)),
        "calibration_note": cfg.get("note", ""),
        "model": "tips_regime_v1",
        "explanation": explanation,
    }


def _build_explanation(
    *,
    tips_regime_score: float,
    regime_action: str,
    action_calc: str,
    tips_liquidity_flag: bool,
    ry_pct: float,
    ry_val: float | None,
    be_cheap: float,
    be5_val: float | None,
    cpi_gap_z: float,
    f_val: float,
    f_bonus: float,
    v_pct: float,
    liq_pct: float,
    calibrated: bool,
) -> list[str]:
    lines = [
        (
            f"TIPSRegimeScore = {tips_regime_score:.3f} → ação **{regime_action}** "
            "(quanto alocar em TIPS)."
        ),
        (
            f"Yield real 10y: pct 5y = {ry_pct:.0%}"
            + (f", RY = {ry_val:.2f}%" if ry_val is not None else "")
            + " — carry real primário."
        ),
        (
            f"BE5 cheap = {be_cheap:.0%}"
            + (f" (BE5 = {be5_val:.2f}%)" if be5_val is not None else "")
            + " — breakeven forward barato."
        ),
        f"CPI gap z = {cpi_gap_z:.2f} (CPI_m − breakeven spot).",
        f"Fed cut prob: {f_val:.0%}, F_bonus = {f_bonus:.2f}.",
        f"VIX pct = {v_pct:.0%}; LIQ proxy (σ20 TIP) pct = {liq_pct:.0%}.",
    ]
    if tips_liquidity_flag:
        lines.append(
            f"Tips liquidity flag ON (V pct > 85% e LIQ pct > 85%) → "
            f"teto Hold (calculada: {action_calc})."
        )
    if not calibrated:
        lines.append("⚠ Pesos não calibrados (`calibrated: false`).")
    return lines


def backfill_tips_regime_scores(days: int = 120) -> int:
    from motor.src.calculo.score_composto import persist_aba_score

    ref = get_fred_series(_load_config().get("real_yield_fred", "DFII10"))
    if ref.empty:
        result = compute_tips_regime(motor_as_of_date())
        persist_aba_score(result, estagio=result["estagio"])
        return 1

    as_of_cap = motor_as_of_date()
    eligible = ref.index[pd.to_datetime(ref.index) <= pd.Timestamp(as_of_cap)]
    dates = eligible[-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        result = compute_tips_regime(d_date)
        persist_aba_score(result, estagio=result["estagio"])
        n += 1
    return n


def tips_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    result = compute_tips_regime(as_of)
    result["aba_id"] = aba_id
    return result


def sanity_check_tips_liquidity_march_2020() -> dict[str, Any]:
    """Cheap validation: tips_liquidity_flag during March 2020."""
    hits: list[dict[str, str]] = []
    start = dt.date(2020, 3, 1)
    end = dt.date(2020, 3, 31)
    ref = get_fred_series("VIXCLS")
    if ref.empty:
        return {"ok": False, "error": "no VIX history"}
    for d in ref.index:
        d_date = d.date() if hasattr(d, "date") else pd.Timestamp(d).date()
        if d_date < start or d_date > end:
            continue
        r = compute_tips_regime(d_date)
        if r.get("tips_liquidity_flag"):
            hits.append({"date": d_date.isoformat(), "action": r.get("regime_action")})
    return {
        "ok": True,
        "period": "2020-03",
        "tips_liquidity_days": len(hits),
        "sample": hits[:5],
        "passed": len(hits) > 0,
    }
