"""BDC security — NAV discount + non-accrual + NII coverage + trend (no RSI, no raw yield)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _directed_percentile, _latest_at
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.dates import motor_as_of_date
from motor.src.db.connection import get_connection
from motor.src.ingestao.edgar_client import get_edgar_metric_at
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "bdc_regime.json"
_TECNICOS_PATH = CONFIG_DIR / "indicadores_tecnicos_bdc.json"

_NAV_ID = "nav_premium_discount"
_NA_ID = "non_accrual_rate"
_COV_ID = "nii_coverage"
_TREND_ID = "preco_vs_mm50"


def _load_security_ingredients() -> list[dict[str, Any]]:
    if not _TECNICOS_PATH.is_file():
        return [
            {"id": _NAV_ID, "peso": 0.3, "inverte_percentil": True},
            {"id": _NA_ID, "peso": 0.3, "inverte_percentil": True},
            {"id": _COV_ID, "peso": 0.25, "inverte_percentil": False},
            {"id": _TREND_ID, "peso": 0.15, "inverte_percentil": False},
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
    if all(by_id.get(k) for k in (_NAV_ID, _NA_ID, _COV_ID, _TREND_ID)):
        return {
            "wa": by_id[_NAV_ID],
            "wb": by_id[_NA_ID],
            "wc": by_id[_COV_ID],
            "wd": by_id[_TREND_ID],
        }
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.3, "wb": 0.3, "wc": 0.25, "wd": 0.15}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.3)),
        "wb": float(sw.get("wb", 0.3)),
        "wc": float(sw.get("wc", 0.25)),
        "wd": float(sw.get("wd", 0.15)),
    }


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def _price_at(ticker: str, as_of: dt.date) -> float | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT close FROM price_daily
            WHERE ticker = ? AND data <= ?
            ORDER BY data DESC LIMIT 1
            """,
            (ticker.upper(), as_of.isoformat()),
        ).fetchone()
    if not row or row["close"] is None:
        return None
    return float(row["close"])


def _nav_premium_pct(ticker: str, as_of: dt.date) -> float | None:
    """(price_as_of / NAV_hold − 1) × 100. Positive = premium. Missing → None."""
    nav = get_edgar_metric_at(ticker, "nav_per_share", as_of)
    price = _price_at(ticker, as_of)
    if nav is not None and nav > 0 and price is not None:
        return (price / nav - 1.0) * 100.0
    return get_edgar_metric_at(ticker, _NAV_ID, as_of)


def compute_bdc_security_batch(
    tickers: list[str],
    universe_tickers: list[str] | None = None,
    as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    weights = _load_security_weights()
    wa, wb, wc, wd = weights["wa"], weights["wb"], weights["wc"], weights["wd"]
    invert_nav = bool(_ingredient(_NAV_ID).get("inverte_percentil", True))
    invert_na = bool(_ingredient(_NA_ID).get("inverte_percentil", True))
    invert_cov = bool(_ingredient(_COV_ID).get("inverte_percentil", False))
    invert_trend = bool(_ingredient(_TREND_ID).get("inverte_percentil", False))
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

    raw_nav: dict[str, float] = {}
    raw_na: dict[str, float] = {}
    raw_cov: dict[str, float] = {}
    raw_mm50: dict[str, float] = {}
    raw_mm200: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        prem = _nav_premium_pct(t, as_of)
        if prem is not None:
            raw_nav[t] = prem
        na = get_edgar_metric_at(t, _NA_ID, as_of)
        if na is not None:
            raw_na[t] = na
        cov = get_edgar_metric_at(t, _COV_ID, as_of)
        if cov is not None:
            raw_cov[t] = cov
        raw_mm50[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0
        raw_mm200[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0

    p_nav = _directed_percentile(raw_nav, invert_nav)
    p_na = _directed_percentile(raw_na, invert_na)
    p_cov = _directed_percentile(raw_cov, invert_cov)
    p_mm50 = _directed_percentile(raw_mm50, invert_trend)
    p_mm200 = _directed_percentile(raw_mm200, invert_trend)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        nav_pct = p_nav.get(t, 0.5)
        na_pct = p_na.get(t, 0.5)
        cov_pct = p_cov.get(t, 0.5)
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0

        c_nav = wa * nav_pct
        c_na = wb * na_pct
        c_cov = wc * cov_pct
        c_trend = wd * trend_pct
        security_score = c_nav + c_na + c_cov + c_trend

        componentes = [
            {
                "id": _NAV_ID,
                "nome": "NAV premium/discount",
                "camada": "valuation",
                "valor": raw_nav.get(t),
                "percentile_cs": nav_pct,
                "peso": wa,
                "inverte_percentil": invert_nav,
                "contribuicao": c_nav,
                "refresh": "hold_last",
                "role": "valuation — desconto vs NAV hold-last; checagem cruzada com non-accrual",
            },
            {
                "id": _NA_ID,
                "nome": "Non-accrual rate",
                "camada": "fundamental",
                "valor": raw_na.get(t),
                "percentile_cs": na_pct,
                "peso": wb,
                "inverte_percentil": invert_na,
                "contribuicao": c_na,
                "refresh": "hold_last",
                "role": "qualidade de crédito — menor non-accrual vs pares no mesmo dia",
            },
            {
                "id": _COV_ID,
                "nome": "Distribution coverage (NII / dividendos)",
                "camada": "fundamental",
                "valor": raw_cov.get(t),
                "percentile_cs": cov_pct,
                "peso": wc,
                "inverte_percentil": invert_cov,
                "contribuicao": c_cov,
                "refresh": "hold_last",
                "role": "cobertura do dividendo — NII reportado (heurística 10-Q), não fee-adjusted",
            },
            {
                "id": _TREND_ID,
                "nome": "Tendência (MM50+MM200)",
                "camada": "tecnico",
                "valor": (raw_mm50.get(t, 0.0) + raw_mm200.get(t, 0.0)) / 2.0,
                "percentile_cs": trend_pct,
                "peso": wd,
                "inverte_percentil": invert_trend,
                "contribuicao": c_trend,
                "role": "tendência residual — close da cota (price return, não total return)",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking BDC — não mistura com regime).",
            (
                f"NAV discount invertido: premium={raw_nav.get(t)} "
                f"pct = {nav_pct:.0%} (contrib {c_nav:.3f})."
            ),
            (
                f"Non-accrual invertido: na={raw_na.get(t)} "
                f"pct = {na_pct:.0%} (contrib {c_na:.3f})."
            ),
            f"NII coverage pct = {cov_pct:.0%} (contrib {c_cov:.3f}).",
            f"Tendência (price return): avg(MM50,MM200) pct = {trend_pct:.0%} (contrib {c_trend:.3f}).",
        ]

        results[t] = {
            "ticker": t,
            "data": as_of.isoformat(),
            "score_composto": security_score,
            "security_score": security_score,
            "componentes": componentes,
            "indicador_dominante": dominant,
            "estagio": _security_estagio(security_score),
            "model": "bdc_security_v2",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
