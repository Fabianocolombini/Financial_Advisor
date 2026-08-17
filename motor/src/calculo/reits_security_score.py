"""REITs security — trend + trap-adjusted yield + dollar volume + inverted 20d vol (no RSI)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.calculo.cash_security_score import _directed_percentile, _latest_at
from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.indicadores_tecnicos import get_tecnico_series
from motor.src.calculo.preferred_security_score import _yield_trap_adjusted
from motor.src.calculo.us_equity_security_score import _dollar_volume
from motor.src.dates import motor_as_of_date
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "reits_regime.json"
_TECNICOS_PATH = CONFIG_DIR / "indicadores_tecnicos_reits.json"

_TREND_ID = "preco_vs_mm50"
_YIELD_ID = "dividend_yield"
_VOLUME_ID = "volume_dolar"
_SIGMA_ID = "vol_realizada"


def _load_security_ingredients() -> list[dict[str, Any]]:
    if not _TECNICOS_PATH.is_file():
        return [
            {"id": _TREND_ID, "peso": 0.3, "inverte_percentil": False},
            {"id": _YIELD_ID, "peso": 0.35, "inverte_percentil": False},
            {"id": _VOLUME_ID, "peso": 0.2, "inverte_percentil": False},
            {"id": _SIGMA_ID, "peso": 0.15, "inverte_percentil": True},
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
    if all(by_id.get(k) for k in (_TREND_ID, _YIELD_ID, _VOLUME_ID, _SIGMA_ID)):
        return {
            "wa": by_id[_TREND_ID],
            "wb": by_id[_YIELD_ID],
            "wc": by_id[_VOLUME_ID],
            "wd": by_id[_SIGMA_ID],
        }
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.3, "wb": 0.35, "wc": 0.2, "wd": 0.15}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.3)),
        "wb": float(sw.get("wb", 0.35)),
        "wc": float(sw.get("wc", 0.2)),
        "wd": float(sw.get("wd", 0.15)),
    }


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def _dgs10_aligned(as_of: dt.date, sample_yield: float) -> float:
    raw = _latest_at(get_fred_series("DGS10"), as_of)
    if raw is None:
        return 0.0
    dgs = float(raw)
    if sample_yield < 1.0 and abs(dgs) >= 1.0:
        return dgs / 100.0
    return dgs


def compute_reits_security_batch(
    tickers: list[str],
    universe_tickers: list[str] | None = None,
    as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    weights = _load_security_weights()
    wa, wb, wc, wd = weights["wa"], weights["wb"], weights["wc"], weights["wd"]
    invert_trend = bool(_ingredient(_TREND_ID).get("inverte_percentil", False))
    invert_yield = bool(_ingredient(_YIELD_ID).get("inverte_percentil", False))
    invert_vol = bool(_ingredient(_VOLUME_ID).get("inverte_percentil", False))
    invert_sigma = bool(_ingredient(_SIGMA_ID).get("inverte_percentil", True))
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

    raw_mm50: dict[str, float] = {}
    raw_mm200: dict[str, float] = {}
    raw_vol: dict[str, float] = {}
    raw_sigma: dict[str, float] = {}
    raw_yield: dict[str, float] = {}
    raw_yield_z: dict[str, float] = {}
    raw_yield_adj: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        raw_mm50[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm50"), as_of) or 0.0
        raw_mm200[t] = _latest_at(get_tecnico_series(t, "preco_vs_mm200"), as_of) or 0.0
        raw_vol[t] = _dollar_volume(t, as_of)
        raw_sigma[t] = _latest_at(get_tecnico_series(t, _SIGMA_ID), as_of) or 0.0
        y, z, y_adj = _yield_trap_adjusted(t, as_of)
        raw_yield[t] = y
        raw_yield_z[t] = z
        raw_yield_adj[t] = y_adj

    sample_y = next((v for v in raw_yield.values() if v), 0.0)
    dgs10 = _dgs10_aligned(as_of, sample_y)

    p_mm50 = _directed_percentile(raw_mm50, invert_trend)
    p_mm200 = _directed_percentile(raw_mm200, invert_trend)
    p_yield = _directed_percentile(raw_yield_adj, invert_yield)
    p_vol = _directed_percentile(raw_vol, invert_vol)
    p_sigma = _directed_percentile(raw_sigma, invert_sigma)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        trend_pct = (p_mm50.get(t, 0.5) + p_mm200.get(t, 0.5)) / 2.0
        yield_pct = p_yield.get(t, 0.5)
        vol_pct = p_vol.get(t, 0.5)
        sigma_pct = p_sigma.get(t, 0.5)

        c_trend = wa * trend_pct
        c_yield = wb * yield_pct
        c_vol = wc * vol_pct
        c_sigma = wd * sigma_pct
        security_score = c_trend + c_yield + c_vol + c_sigma

        y_raw = raw_yield.get(t, 0.0)
        y_adj = raw_yield_adj.get(t, 0.0)
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
                "nome": "Dividend yield (anti yield-trap)",
                "camada": "valuation",
                "valor": y_raw,
                "z_score": raw_yield_z.get(t),
                "valor_ajustado": y_adj,
                "dgs10": dgs10,
                "yield_spread": y_raw - dgs10,
                "percentile_cs": yield_pct,
                "peso": wb,
                "inverte_percentil": invert_yield,
                "contribuicao": c_yield,
                "yield_trap": "y / (1 + max(z_252, 0))",
                "role": "renda vs pares; DGS10 é constante no dia (spread vs 10y não muda o ranking)",
            },
            {
                "id": _VOLUME_ID,
                "nome": "Volume em dólar",
                "camada": "tecnico",
                "valor": raw_vol.get(t),
                "percentile_cs": vol_pct,
                "peso": wc,
                "inverte_percentil": invert_vol,
                "contribuicao": c_vol,
                "role": "liquidez — close × ações negociadas vs pares",
            },
            {
                "id": _SIGMA_ID,
                "nome": "Vol realizada 20d (σ20)",
                "camada": "tecnico",
                "valor": raw_sigma.get(t),
                "percentile_cs": sigma_pct,
                "peso": wd,
                "inverte_percentil": invert_sigma,
                "contribuicao": c_sigma,
                "vol_window": 20,
                "role": "desconto de swing — menor vol vs pares no mesmo dia",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))

        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking REITs — não mistura com regime).",
            f"Tendência (price return): avg(MM50,MM200) pct = {trend_pct:.0%} (contrib {c_trend:.3f}).",
            (
                f"Yield anti-trap: y={y_raw:.2%}, z={raw_yield_z.get(t, 0):.2f}, "
                f"DGS10={dgs10:.2%} (spread={y_raw - dgs10:.2%}, constante no ranking) "
                f"→ adj pct = {yield_pct:.0%} (contrib {c_yield:.3f})."
            ),
            f"Volume em dólar pct = {vol_pct:.0%} (contrib {c_vol:.3f}).",
            f"σ20 invertida pct = {sigma_pct:.0%} (contrib {c_sigma:.3f}, lookback 20d).",
        ]

        results[t] = {
            "ticker": t,
            "data": as_of.isoformat(),
            "score_composto": security_score,
            "security_score": security_score,
            "componentes": componentes,
            "indicador_dominante": dominant,
            "estagio": _security_estagio(security_score),
            "model": "reits_security_v2",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
