"""Cash security selection model — which instrument within cash (Model 2)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import pandas as pd

from motor.src.calculo.indicadores_tecnicos import get_tecnico_series, mm50_distance_zscore
from motor.src.dates import motor_as_of_date
from motor.src.db.connection import get_connection
from motor.src.ingestao.yfinance_client import get_price_series
from motor.src.paths import CONFIG_DIR

_TECNICOS_PATH = CONFIG_DIR / "indicadores_tecnicos_cash.json"
_CONFIG_PATH = CONFIG_DIR / "models" / "cash_regime.json"

_VOLUME_ID = "volume_negociado"
_SIGMA_ID = "vol_realizada"
_DELTA_ID = "preco_vs_mm50_z_abs"


def _load_security_ingredients() -> list[dict[str, Any]]:
    if not _TECNICOS_PATH.is_file():
        return [
            {"id": _VOLUME_ID, "peso": 0.5, "inverte_percentil": False},
            {"id": _SIGMA_ID, "peso": 0.35, "inverte_percentil": True},
            {"id": _DELTA_ID, "peso": 0.15, "inverte_percentil": True},
        ]
    cfg = json.loads(_TECNICOS_PATH.read_text(encoding="utf-8"))
    return list(cfg.get("indicadores") or [])


def _ingredient(ind_id: str) -> dict[str, Any]:
    for item in _load_security_ingredients():
        if item.get("id") == ind_id:
            return item
    return {}


def _load_security_weights() -> dict[str, float]:
    by_id = {i["id"]: float(i.get("peso") or 0) for i in _load_security_ingredients()}
    if by_id.get(_VOLUME_ID) and by_id.get(_SIGMA_ID) and by_id.get(_DELTA_ID):
        return {
            "wa": by_id[_VOLUME_ID],
            "wb": by_id[_SIGMA_ID],
            "wc": by_id[_DELTA_ID],
        }
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.5, "wb": 0.35, "wc": 0.15}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.5)),
        "wb": float(sw.get("wb", 0.35)),
        "wc": float(sw.get("wc", 0.15)),
    }


def _cross_sectional_percentile(values: dict[str, float]) -> dict[str, float]:
    """Rank tickers at the same moment → percentile in [0, 1]. Ties share the average rank."""
    valid = {t: v for t, v in values.items() if v is not None and pd.notna(v)}
    if not valid:
        return {t: 0.5 for t in values}
    if len(valid) == 1:
        return {t: 0.5 for t in values}
    grouped: dict[float, list[str]] = {}
    for ticker, value in valid.items():
        grouped.setdefault(value, []).append(ticker)
    n = len(valid)
    ranks: dict[str, float] = {}
    running = 0.0
    for value in sorted(grouped):
        names = grouped[value]
        avg_rank = running + (len(names) - 1) / 2.0
        share = avg_rank / (n - 1)
        for ticker in names:
            ranks[ticker] = share
        running += len(names)
    for t in values:
        if t not in ranks:
            ranks[t] = 0.5
    return ranks


def _directed_percentile(values: dict[str, float], invert: bool) -> dict[str, float]:
    """Cross-sectional percentile; invert=True → highest score = lowest raw value."""
    if invert:
        flipped = {t: -v for t, v in values.items()}
        return _cross_sectional_percentile(flipped)
    return _cross_sectional_percentile(values)


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


def _volume_series(ticker: str) -> pd.Series:
    stored = get_tecnico_series(ticker, _VOLUME_ID)
    if not stored.empty:
        return stored
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT data, volume FROM price_daily WHERE ticker = ? ORDER BY data",
            (ticker.upper(),),
        ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["volume"] or 0) for r in rows]
    return pd.Series(vals, index=dates)


def _ma50_z_abs(ticker: str, as_of: dt.date) -> float:
    stored = _latest_at(get_tecnico_series(ticker, _DELTA_ID), as_of)
    if stored is not None:
        return abs(stored)
    prices = get_price_series(ticker)
    if prices.empty:
        return 0.0
    z_s = mm50_distance_zscore(prices).abs()
    val = _latest_at(z_s, as_of)
    return abs(val) if val is not None else 0.0


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
    invert_vol = bool(_ingredient(_VOLUME_ID).get("inverte_percentil", False))
    invert_sigma = bool(_ingredient(_SIGMA_ID).get("inverte_percentil", True))
    invert_delta = bool(_ingredient(_DELTA_ID).get("inverte_percentil", True))
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

    raw_vol: dict[str, float] = {}
    raw_sigma: dict[str, float] = {}
    raw_delta: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        vol_s = _volume_series(t)
        sigma_s = get_tecnico_series(t, _SIGMA_ID)
        raw_vol[t] = _latest_at(vol_s, as_of) or 0.0
        raw_sigma[t] = _latest_at(sigma_s, as_of) or 0.0
        raw_delta[t] = _ma50_z_abs(t, as_of)

    p_vol = _directed_percentile(raw_vol, invert_vol)
    p_sigma = _directed_percentile(raw_sigma, invert_sigma)
    p_delta = _directed_percentile(raw_delta, invert_delta)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        vol_pct = p_vol.get(t, 0.5)
        sigma_pct = p_sigma.get(t, 0.5)
        delta_pct = p_delta.get(t, 0.5)

        c_vol = wa * vol_pct
        c_sigma = wb * sigma_pct
        c_delta = wc * delta_pct
        security_score = c_vol + c_sigma + c_delta

        componentes = [
            {
                "id": _VOLUME_ID,
                "nome": "Volume negociado",
                "camada": "tecnico",
                "valor": raw_vol.get(t),
                "percentile_cs": vol_pct,
                "peso": wa,
                "inverte_percentil": invert_vol,
                "contribuicao": c_vol,
                "role": "liquidez — maior volume bruto vs pares cash",
            },
            {
                "id": _SIGMA_ID,
                "nome": "Vol realizada 20d (σ20)",
                "camada": "tecnico",
                "valor": raw_sigma.get(t),
                "percentile_cs": sigma_pct,
                "peso": wb,
                "inverte_percentil": invert_sigma,
                "contribuicao": c_sigma,
                "role": "estabilidade — menor vol vs pares",
            },
            {
                "id": _DELTA_ID,
                "nome": "|Preço vs MM50| z-score (Δ50z)",
                "camada": "tecnico",
                "valor": raw_delta.get(t),
                "percentile_cs": delta_pct,
                "peso": wc,
                "inverte_percentil": invert_delta,
                "contribuicao": c_delta,
                "role": "anomalia — |z| vs MA50; drift saudável ≠ extensão",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking dentro do universo cash, não mistura com regime).",
            (
                f"Liquidez: volume bruto pct cross-sectional = {vol_pct:.0%} "
                f"(contrib {c_vol:.3f}, peso {wa:.0%})."
            ),
            (
                f"Estabilidade: σ20 pct invertido = {sigma_pct:.0%} "
                f"(contrib {c_sigma:.3f}, peso {wb:.0%})."
            ),
            (
                f"Anomalia: |Δ50| z-score pct invertido = {delta_pct:.0%} "
                f"(contrib {c_delta:.3f}, peso {wc:.0%})."
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
            "model": "cash_security_v3",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results


def cash_security_explanation_note() -> str:
    return (
        "Modelo 2: percentis cross-sectional entre instrumentos cash no mesmo momento. "
        "Volume bruto 50% / σ20 35% / |ΔMA50| z-score 15%. "
        "Não combina com CashRegimeScore (Modelo 1)."
    )
