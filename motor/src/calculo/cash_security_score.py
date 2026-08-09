"""Cash security selection model — which instrument within cash (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "cash_regime.json"


def _load_security_weights() -> dict[str, float]:
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.4, "wb": 0.35, "wc": 0.25}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.4)),
        "wb": float(sw.get("wb", 0.35)),
        "wc": float(sw.get("wc", 0.25)),
    }


def _cross_sectional_percentile(values: dict[str, float]) -> dict[str, float]:
    """Rank tickers at the same moment → percentile in [0, 1]."""
    valid = {t: v for t, v in values.items() if v is not None and pd.notna(v)}
    if not valid:
        return {t: 0.5 for t in values}
    if len(valid) == 1:
        return {t: 0.5 for t in values}
    sorted_items = sorted(valid.items(), key=lambda x: x[1])
    ranks: dict[str, float] = {}
    n = len(sorted_items)
    for i, (ticker, _) in enumerate(sorted_items):
        ranks[ticker] = i / (n - 1)
    for t in values:
        if t not in ranks:
            ranks[t] = 0.5
    return ranks


def _latest_at(series: pd.Series, as_of: dt.date) -> float | None:
    if series.empty:
        return None
    cap = pd.Timestamp(as_of)
    truncated = series.loc[pd.DatetimeIndex(pd.to_datetime(series.index)) <= cap]
    if truncated.empty:
        return None
    val = float(truncated.iloc[-1])
    if not pd.notna(val):
        return None
    return val


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def compute_cash_security_batch(
    tickers: list[str],
    universe_tickers: list[str] | None = None,
    as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Cross-sectional SecurityScore for cash universe.
    Percentiles compare instruments to each other at the same date.
    """
    as_of = as_of or motor_as_of_date()
    weights = _load_security_weights()
    wa, wb, wc = weights["wa"], weights["wb"], weights["wc"]
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

    raw_vol: dict[str, float] = {}
    raw_sigma: dict[str, float] = {}
    raw_delta: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        vol_s = get_tecnico_series(t, "volume_vs_media")
        sigma_s = get_tecnico_series(t, "vol_realizada")
        mm50_s = get_tecnico_series(t, "preco_vs_mm50")
        raw_vol[t] = _latest_at(vol_s, as_of) or 0.0
        raw_sigma[t] = _latest_at(sigma_s, as_of) or 0.0
        mm50_val = _latest_at(mm50_s, as_of)
        raw_delta[t] = abs(mm50_val) if mm50_val is not None else 0.0

    p_vol = _cross_sectional_percentile(raw_vol)
    p_sigma = _cross_sectional_percentile(raw_sigma)
    p_delta = _cross_sectional_percentile(raw_delta)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        vol_pct = p_vol.get(t, 0.5)
        sigma_pct = p_sigma.get(t, 0.5)
        delta_pct = p_delta.get(t, 0.5)

        c_vol = wa * vol_pct
        c_sigma = wb * (1.0 - sigma_pct)
        c_delta = wc * (1.0 - delta_pct)
        security_score = c_vol + c_sigma + c_delta

        componentes = [
            {
                "id": "volume_vs_media",
                "nome": "Volume vs média (Vol_rel)",
                "camada": "tecnico",
                "valor": raw_vol.get(t),
                "percentile_cs": vol_pct,
                "peso": wa,
                "contribuicao": c_vol,
                "role": "liquidez — mais líquido vs pares cash",
            },
            {
                "id": "vol_realizada",
                "nome": "Vol realizada 20d (σ20)",
                "camada": "tecnico",
                "valor": raw_sigma.get(t),
                "percentile_cs": sigma_pct,
                "peso": wb,
                "contribuicao": c_sigma,
                "role": "estabilidade — menor vol vs pares",
            },
            {
                "id": "preco_vs_mm50_abs",
                "nome": "|Preço vs MM50| (Δ50)",
                "camada": "tecnico",
                "valor": raw_delta.get(t),
                "percentile_cs": delta_pct,
                "peso": wc,
                "contribuicao": c_delta,
                "role": "anomalia — extensão grande desconfia, não é bullish",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking dentro do universo cash, não mistura com regime).",
            (
                f"Liquidez: Vol_rel pct cross-sectional = {vol_pct:.0%} "
                f"(contrib {c_vol:.3f})."
            ),
            (
                f"Estabilidade: σ20 pct = {sigma_pct:.0%} → "
                f"(1−pct)×wb = {c_sigma:.3f}."
            ),
            (
                f"Anomalia: |Δ50| pct = {delta_pct:.0%} → "
                f"(1−pct)×wc = {c_delta:.3f}."
            ),
            "RSI excluído — NAV monotônico de ETFs cash/CLO distorce momentum.",
        ]

        results[t] = {
            "ticker": t,
            "data": as_of.isoformat(),
            "score_composto": security_score,
            "security_score": security_score,
            "componentes": componentes,
            "indicador_dominante": dominant,
            "estagio": _security_estagio(security_score),
            "model": "cash_security_v1",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results


def cash_security_explanation_note() -> str:
    return (
        "Modelo 2: percentis cross-sectional entre instrumentos cash no mesmo momento. "
        "Não combina com CashRegimeScore (Modelo 1)."
    )
