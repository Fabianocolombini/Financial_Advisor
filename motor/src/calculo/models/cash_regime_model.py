"""Cash class regime model — how much to allocate (Model 1)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.derivados import compute_formula, get_fred_series
from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.zscore import percentile_latest
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "cash_regime.json"
_ACTION_ORDER = ["Strong Reduce", "Reduce", "Hold", "Overweight"]


def _load_config() -> dict[str, Any]:
    if not _CONFIG_PATH.is_file():
        return {
            "calibrated": False,
            "regime_weights": {"w1": 0.5, "w2": 0.3, "w3": 0.2},
            "thresholds": {"overweight": 0.65, "hold": 0.45, "reduce": 0.25},
            "stress_percentile": 0.8,
            "percentile_window_days": 1260,
            "curve_signal": {"invert_offset": 2, "invert_scale": 4},
        }
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _scalar_at(series: pd.Series, as_of: dt.date) -> float | None:
    if series.empty:
        return None
    cap = pd.Timestamp(as_of)
    truncated = series.loc[pd.DatetimeIndex(pd.to_datetime(series.index)) <= cap]
    if truncated.empty:
        return None
    return float(truncated.iloc[-1])


def _percentile_0_1(series: pd.Series, as_of: dt.date, window: int) -> tuple[float, float | None]:
    if series.empty:
        return 0.5, None
    cap = pd.Timestamp(as_of)
    truncated = series.loc[pd.DatetimeIndex(pd.to_datetime(series.index)) <= cap]
    if truncated.empty:
        return 0.5, None
    pct_100, latest, _ = percentile_latest(truncated, window=window)
    return pct_100 / 100.0, latest


def _action_from_score(score: float, thresholds: dict[str, float], labels: dict[str, str]) -> str:
    if score >= thresholds.get("overweight", 0.65):
        return labels.get("overweight", "Overweight")
    if score >= thresholds.get("hold", 0.45):
        return labels.get("hold", "Hold")
    if score >= thresholds.get("reduce", 0.25):
        return labels.get("reduce", "Reduce")
    return labels.get("strong_reduce", "Strong Reduce")


def _max_action(action: str, floor: str) -> str:
    ai = _ACTION_ORDER.index(action) if action in _ACTION_ORDER else 0
    fi = _ACTION_ORDER.index(floor) if floor in _ACTION_ORDER else 0
    return _ACTION_ORDER[max(ai, fi)]


def regime_action_to_estagio(action: str) -> str:
    mapping = {
        "Overweight": "Ascendente",
        "Hold": "Maduro",
        "Reduce": "Descendente",
        "Strong Reduce": "ForteDescendente",
    }
    return mapping.get(action, "Maduro")


def compute_cash_regime(as_of: dt.date | None = None) -> dict[str, Any]:
    cfg = _load_config()
    as_of = as_of or motor_as_of_date()
    window = int(cfg.get("percentile_window_days", 1260))
    weights = cfg.get("regime_weights", {})
    w1 = float(weights.get("w1", 0.5))
    w2 = float(weights.get("w2", 0.3))
    w3 = float(weights.get("w3", 0.2))
    thresholds = cfg.get("thresholds", {})
    labels = cfg.get("action_labels", {})
    curve_cfg = cfg.get("curve_signal", {})
    invert_offset = float(curve_cfg.get("invert_offset", 2))
    invert_scale = float(curve_cfg.get("invert_scale", 4))
    stress_thr = float(cfg.get("stress_percentile", 0.8))

    y_series = compute_formula("DTB3 - CPIAUCSL")
    c_series = get_fred_series("T10Y2Y")
    f_series = get_external_series("cme", "fed_cut_probability")
    v_series = get_fred_series("VIXCLS")
    h_series = get_fred_series("BAMLH0A0HYM2")

    y_pct, y_val = _percentile_0_1(y_series, as_of, window)
    c_val = _scalar_at(c_series, as_of)
    c_signal = (
        _clip((-c_val + invert_offset) / invert_scale, 0.0, 1.0) if c_val is not None else 0.5
    )
    f_val = _scalar_at(f_series, as_of)
    if f_val is None:
        f_val = 0.5
    f_penalty = _clip((f_val - 0.5) * 2.0, 0.0, 1.0)
    v_pct, v_val = _percentile_0_1(v_series, as_of, window)
    h_pct, h_val = _percentile_0_1(h_series, as_of, window)

    cash_regime_score = w1 * y_pct + w2 * c_signal - w3 * f_penalty
    stress_flag = v_pct > stress_thr and h_pct > stress_thr

    action_calc = _action_from_score(cash_regime_score, thresholds, labels)
    regime_action = _max_action(action_calc, "Hold") if stress_flag else action_calc

    componentes = [
        {
            "id": "yield_real_caixa",
            "nome": "Yield real caixa (Y)",
            "valor": y_val,
            "percentile_0_1": y_pct,
            "peso": w1,
            "contribuicao": w1 * y_pct,
            "role": "carry — quanto cash paga em termos reais vs 5y",
        },
        {
            "id": "spread_10y_2y",
            "nome": "Spread 10y-2y (C)",
            "valor": c_val,
            "signal_0_1": c_signal,
            "peso": w2,
            "contribuicao": w2 * c_signal,
            "role": "curva — invertida favorece cash; inclinada favorece duration",
        },
        {
            "id": "fed_cut_probability",
            "nome": "Fed cut probability 6m (F)",
            "valor": f_val,
            "penalty_0_1": f_penalty,
            "peso": w3,
            "contribuicao": -w3 * f_penalty,
            "role": "erosão do carry se prob. de corte > 50%",
        },
        {
            "id": "vix",
            "nome": "VIX (V)",
            "valor": v_val,
            "percentile_0_1": v_pct,
            "peso": 0.0,
            "contribuicao": 0.0,
            "role": "stress override — só eleva alocação, nunca reduz",
        },
        {
            "id": "hy_oas",
            "nome": "HY OAS (H)",
            "valor": h_val,
            "percentile_0_1": h_pct,
            "peso": 0.0,
            "contribuicao": 0.0,
            "role": "stress override — só eleva alocação, nunca reduz",
        },
    ]

    dominant = max(
        [c for c in componentes if c["peso"] > 0],
        key=lambda c: abs(c["contribuicao"]),
        default=None,
    )

    explanation = _build_explanation(
        cash_regime_score=cash_regime_score,
        regime_action=regime_action,
        action_calc=action_calc,
        stress_flag=stress_flag,
        y_pct=y_pct,
        y_val=y_val,
        c_val=c_val,
        c_signal=c_signal,
        f_val=f_val,
        f_penalty=f_penalty,
        v_pct=v_pct,
        h_pct=h_pct,
        calibrated=bool(cfg.get("calibrated", False)),
    )

    return {
        "aba_id": "cash_equivalents",
        "nome": "Caixa e equivalentes",
        "data": as_of.isoformat(),
        "cash_regime_score": cash_regime_score,
        "score_composto": cash_regime_score,
        "regime_action": regime_action,
        "regime_action_calculated": action_calc,
        "stress_flag": stress_flag,
        "estagio": regime_action_to_estagio(regime_action),
        "componentes": componentes,
        "indicador_dominante": dominant,
        "calibrated": bool(cfg.get("calibrated", False)),
        "calibration_note": cfg.get("note", ""),
        "model": "cash_regime_v1",
        "explanation": explanation,
    }


def _build_explanation(
    *,
    cash_regime_score: float,
    regime_action: str,
    action_calc: str,
    stress_flag: bool,
    y_pct: float,
    y_val: float | None,
    c_val: float | None,
    c_signal: float,
    f_val: float,
    f_penalty: float,
    v_pct: float,
    h_pct: float,
    calibrated: bool,
) -> list[str]:
    lines = [
        (
            f"CashRegimeScore = {cash_regime_score:.3f} → ação de sleeve **{regime_action}** "
            f"(quanto alocar em cash no agregado)."
        ),
        (
            f"Carry real (Y): percentil 5y = {y_pct:.0%}"
            + (f", yield real = {y_val:.2f}" if y_val is not None else "")
            + " — driver primário do score."
        ),
        (
            f"Curva 10y-2y (C): spread = {c_val:.2f}%"
            if c_val is not None
            else "Curva 10y-2y (C): dado indisponível"
        ),
    ]
    if c_val is not None:
        lines[-1] += f", C_signal = {c_signal:.2f} (invertida favorece cash)."
    lines.append(
        f"Fed cut prob (F): {f_val:.0%}, penalty = {f_penalty:.2f} — erosão do carry, não veto."
    )
    if stress_flag:
        lines.append(
            f"Stress flag ON (VIX pct {v_pct:.0%}, HY OAS pct {h_pct:.0%} > 80p) — "
            f"piso em Hold (ação calculada era {action_calc})."
        )
    else:
        lines.append(
            f"VIX/HY em percentil {v_pct:.0%}/{h_pct:.0%} — sem override de stress."
        )
    if not calibrated:
        lines.append(
            "⚠ Pesos não calibrados (`calibrated: false`) — julgamento, não regressão histórica."
        )
    return lines


def backfill_cash_regime_scores(days: int = 120) -> int:
    """Persist historical CashRegimeScore for score history charts."""
    from motor.src.calculo.score_composto import persist_aba_score

    y_series = compute_formula("DTB3 - CPIAUCSL")
    if y_series.empty:
        result = compute_cash_regime(motor_as_of_date())
        persist_aba_score(result, estagio=result["estagio"])
        return 1

    as_of_cap = motor_as_of_date()
    eligible = y_series.index[pd.to_datetime(y_series.index) <= pd.Timestamp(as_of_cap)]
    dates = eligible[-days:]
    n = 0
    for d in dates:
        d_date = d.date() if hasattr(d, "date") else dt.date.fromisoformat(str(d)[:10])
        result = compute_cash_regime(d_date)
        persist_aba_score(result, estagio=result["estagio"])
        n += 1
    return n


def cash_regime_aba_result(aba_id: str, as_of: dt.date | None = None) -> dict[str, Any]:
    result = compute_cash_regime(as_of)
    result["aba_id"] = aba_id
    return result
