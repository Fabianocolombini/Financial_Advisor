"""Infrastructure security — trend + yield z + FCF coverage + EV/EBITDA z + debt/EBITDA + inverted vol."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

import numpy as np
import pandas as pd

from motor.src.calculo.cash_security_score import _directed_percentile, _latest_at
from motor.src.calculo.derivados import dividend_yield_series
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.series_sources import get_edgar_metrics_series
from motor.src.dates import motor_as_of_date
from motor.src.ingestao.edgar_client import get_edgar_metric_at
from motor.src.ingestao.yfinance_client import get_price_series
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "alt_infrastructure_regime.json"
_TECNICOS_PATH = CONFIG_DIR / "indicadores_tecnicos_alt_infrastructure.json"

_TREND_ID = "preco_vs_mm50"
_YIELD_ID = "dividend_yield"
_COV_ID = "fcf_coverage"
_EV_ID = "ev_ebitda"
_DEBT_ID = "debt_ebitda"
_SIGMA_ID = "vol_realizada"

_YIELD_Z_WINDOW = 756  # 3 years of sessions
_FUND_Z_OBS = 12  # 3 years of quarters
_FUND_Z_MIN = 4


def _load_security_ingredients() -> list[dict[str, Any]]:
    if not _TECNICOS_PATH.is_file():
        return [
            {"id": _TREND_ID, "peso": 0.2, "inverte_percentil": False},
            {"id": _YIELD_ID, "peso": 0.15, "inverte_percentil": False},
            {"id": _COV_ID, "peso": 0.2, "inverte_percentil": False},
            {"id": _EV_ID, "peso": 0.2, "inverte_percentil": True},
            {"id": _DEBT_ID, "peso": 0.15, "inverte_percentil": True},
            {"id": _SIGMA_ID, "peso": 0.1, "inverte_percentil": True},
        ]
    cfg = json.loads(_TECNICOS_PATH.read_text(encoding="utf-8"))
    return list(cfg.get("indicadores") or [])


def _ingredient(ind_id: str) -> dict[str, Any]:
    for item in _load_security_ingredients():
        if item.get("id") == ind_id:
            return item
    return {}


def _load_security_weights() -> dict[str, float]:
    ids = (_TREND_ID, _YIELD_ID, _COV_ID, _EV_ID, _DEBT_ID, _SIGMA_ID)
    by_id = {i["id"]: float(i.get("peso") or 0) for i in _load_security_ingredients()}
    if all(by_id.get(k) for k in ids):
        return {
            "wa": by_id[_TREND_ID],
            "wb": by_id[_YIELD_ID],
            "wc": by_id[_COV_ID],
            "wd": by_id[_EV_ID],
            "we": by_id[_DEBT_ID],
            "wf": by_id[_SIGMA_ID],
        }
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.2, "wb": 0.15, "wc": 0.2, "wd": 0.2, "we": 0.15, "wf": 0.1}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.2)),
        "wb": float(sw.get("wb", 0.15)),
        "wc": float(sw.get("wc", 0.2)),
        "wd": float(sw.get("wd", 0.2)),
        "we": float(sw.get("we", 0.15)),
        "wf": float(sw.get("wf", 0.1)),
    }


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def _z_vs_history(
    series: pd.Series,
    as_of: dt.date,
    *,
    max_obs: int,
    min_obs: int = _FUND_Z_MIN,
) -> float | None:
    if series is None or series.empty:
        return None
    idx = pd.DatetimeIndex(pd.to_datetime(series.index))
    s = pd.Series(pd.to_numeric(series.values, errors="coerce"), index=idx)
    truncated = s.loc[s.index <= pd.Timestamp(as_of)].dropna()
    if len(truncated) < min_obs:
        return None
    tail = truncated.iloc[-max_obs:]
    latest = float(tail.iloc[-1])
    mean = float(tail.mean())
    std = float(tail.std(ddof=1)) if len(tail) > 1 else 0.0
    if not np.isfinite(std) or std <= max(1e-12, abs(mean) * 1e-9):
        return 0.0
    return (latest - mean) / std


def _yield_own_z(ticker: str, as_of: dt.date) -> tuple[float | None, float | None]:
    """Latest yield and 3y own-history z. Sticky DPS / close when snapshots are sparse."""
    prices = get_price_series(ticker)
    y_series = dividend_yield_series(ticker)
    y_now = _latest_at(y_series, as_of) if not y_series.empty else None
    p_now = _latest_at(prices, as_of)
    if y_now is None or p_now is None or p_now <= 0:
        return y_now, None
    y = float(y_now)
    if y > 1.0:
        y = y / 100.0
    dps = y * float(p_now)
    if prices.empty or dps <= 0:
        z = _z_vs_history(y_series, as_of, max_obs=_YIELD_Z_WINDOW, min_obs=10)
        return y, z
    yield_path = dps / prices.replace(0, pd.NA)
    z = _z_vs_history(yield_path, as_of, max_obs=_YIELD_Z_WINDOW, min_obs=20)
    return y, z


def _ev_ebitda_own_z(ticker: str, as_of: dt.date) -> tuple[float | None, float | None]:
    series = get_edgar_metrics_series(ticker, _EV_ID)
    val = get_edgar_metric_at(ticker, _EV_ID, as_of)
    z = _z_vs_history(series, as_of, max_obs=_FUND_Z_OBS, min_obs=_FUND_Z_MIN)
    return val, z


def compute_alt_infrastructure_security_batch(
    tickers: list[str],
    universe_tickers: list[str] | None = None,
    as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    weights = _load_security_weights()
    wa, wb, wc = weights["wa"], weights["wb"], weights["wc"]
    wd, we, wf = weights["wd"], weights["we"], weights["wf"]
    invert_trend = bool(_ingredient(_TREND_ID).get("inverte_percentil", False))
    invert_yield = bool(_ingredient(_YIELD_ID).get("inverte_percentil", False))
    invert_cov = bool(_ingredient(_COV_ID).get("inverte_percentil", False))
    invert_ev = bool(_ingredient(_EV_ID).get("inverte_percentil", True))
    invert_debt = bool(_ingredient(_DEBT_ID).get("inverte_percentil", True))
    invert_sigma = bool(_ingredient(_SIGMA_ID).get("inverte_percentil", True))
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

    raw_mm50: dict[str, float] = {}
    raw_mm200: dict[str, float] = {}
    raw_yield: dict[str, float] = {}
    raw_yield_z: dict[str, float] = {}
    raw_cov: dict[str, float] = {}
    raw_ev: dict[str, float] = {}
    raw_ev_z: dict[str, float] = {}
    raw_debt: dict[str, float] = {}
    raw_sigma: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        raw_mm50[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0
        raw_mm200[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0
        y, yz = _yield_own_z(t, as_of)
        if y is not None:
            raw_yield[t] = y
        if yz is not None:
            raw_yield_z[t] = yz
        cov = get_edgar_metric_at(t, _COV_ID, as_of)
        if cov is not None:
            raw_cov[t] = cov
        ev, evz = _ev_ebitda_own_z(t, as_of)
        if ev is not None:
            raw_ev[t] = ev
        if evz is not None:
            raw_ev_z[t] = evz
        debt = get_edgar_metric_at(t, _DEBT_ID, as_of)
        if debt is not None:
            raw_debt[t] = debt
        raw_sigma[t] = _latest_at(get_tecnico_series(t, _SIGMA_ID), as_of) or 0.0

    p_mm50 = _directed_percentile(raw_mm50, invert_trend)
    p_mm200 = _directed_percentile(raw_mm200, invert_trend)
    p_yield = _directed_percentile(raw_yield_z, invert_yield)
    p_cov = _directed_percentile(raw_cov, invert_cov)
    p_ev = _directed_percentile(raw_ev_z, invert_ev)
    p_debt = _directed_percentile(raw_debt, invert_debt)
    p_sigma = _directed_percentile(raw_sigma, invert_sigma)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0
        yield_pct = p_yield.get(t, 0.5)
        cov_pct = p_cov.get(t, 0.5)
        ev_pct = p_ev.get(t, 0.5)
        debt_pct = p_debt.get(t, 0.5)
        sigma_pct = p_sigma.get(t, 0.5)

        c_trend = wa * trend_pct
        c_yield = wb * yield_pct
        c_cov = wc * cov_pct
        c_ev = wd * ev_pct
        c_debt = we * debt_pct
        c_sigma = wf * sigma_pct
        security_score = c_trend + c_yield + c_cov + c_ev + c_debt + c_sigma

        componentes = [
            {
                "id": _TREND_ID,
                "nome": "Tendência (MM50+MM200)",
                "camada": "tecnico",
                "valor": (raw_mm50.get(t, 0.0) + raw_mm200.get(t, 0.0)) / 2.0,
                "percentile_cs": trend_pct,
                "peso": wa,
                "inverte_percentil": invert_trend,
                "contribuicao": c_trend,
                "role": "tendência — close da cota (price return, não total return)",
            },
            {
                "id": _YIELD_ID,
                "nome": "Dividend yield (z vs história 3y)",
                "camada": "valuation",
                "valor": raw_yield.get(t),
                "z_score": raw_yield_z.get(t),
                "percentile_cs": yield_pct,
                "peso": wb,
                "inverte_percentil": invert_yield,
                "contribuicao": c_yield,
                "zscore_window": _YIELD_Z_WINDOW,
                "role": "renda vs a própria história, depois percentil na classe",
            },
            {
                "id": _COV_ID,
                "nome": "Distribution coverage (FCF / dividendos)",
                "camada": "fundamental",
                "valor": raw_cov.get(t),
                "percentile_cs": cov_pct,
                "peso": wc,
                "inverte_percentil": invert_cov,
                "contribuicao": c_cov,
                "refresh": "hold_last",
                "role": "cobertura FCF — hold-last companyfacts",
            },
            {
                "id": _EV_ID,
                "nome": "EV/EBITDA vs história (z 3y)",
                "camada": "valuation",
                "valor": raw_ev.get(t),
                "z_score": raw_ev_z.get(t),
                "percentile_cs": ev_pct,
                "peso": wd,
                "inverte_percentil": invert_ev,
                "contribuicao": c_ev,
                "refresh": "hold_last",
                "role": "desconto vs o próprio múltiplo (12 trimestres) — invertido",
            },
            {
                "id": _DEBT_ID,
                "nome": "Dívida/EBITDA",
                "camada": "fundamental",
                "valor": raw_debt.get(t),
                "percentile_cs": debt_pct,
                "peso": we,
                "inverte_percentil": invert_debt,
                "contribuicao": c_debt,
                "refresh": "hold_last",
                "role": "alavancagem — menor dívida/EBITDA vs pares no mesmo dia",
            },
            {
                "id": _SIGMA_ID,
                "nome": "Vol realizada 20d (σ20)",
                "camada": "tecnico",
                "valor": raw_sigma.get(t),
                "percentile_cs": sigma_pct,
                "peso": wf,
                "inverte_percentil": invert_sigma,
                "contribuicao": c_sigma,
                "vol_window": 20,
                "role": "estabilidade — menor vol vs pares no mesmo dia",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))
        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking Infrastructure — não mistura com regime).",
            f"Tendência (price return): avg(MM50,MM200) pct = {trend_pct:.0%} (contrib {c_trend:.3f}).",
            f"Yield z_3y pct = {yield_pct:.0%} (contrib {c_yield:.3f}).",
            f"FCF coverage pct = {cov_pct:.0%} (contrib {c_cov:.3f}).",
            f"EV/EBITDA z invertido pct = {ev_pct:.0%} (contrib {c_ev:.3f}).",
            f"Dívida/EBITDA invertida pct = {debt_pct:.0%} (contrib {c_debt:.3f}).",
            f"σ20 invertida pct = {sigma_pct:.0%} (contrib {c_sigma:.3f}).",
        ]

        results[t] = {
            "ticker": t,
            "data": as_of.isoformat(),
            "score_composto": security_score,
            "security_score": security_score,
            "componentes": componentes,
            "indicador_dominante": dominant,
            "estagio": _security_estagio(security_score),
            "model": "alt_infrastructure_security_v2",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
