"""FX security — inverted expense + dollar volume + UUP fit + monotonic carry + inverted tracking error."""

from __future__ import annotations

import datetime as dt
import json
import math
from typing import Any

import pandas as pd

from motor.src.calculo.cash_security_score import _directed_percentile, _latest_at
from motor.src.calculo.derivados import get_fred_series
from motor.src.calculo.external_series_source import get_external_series
from motor.src.calculo.security_score_helpers import expense_ratio_value, rolling_beta
from motor.src.calculo.us_equity_security_score import _dollar_volume
from motor.src.dates import motor_as_of_date
from motor.src.ingestao.yfinance_client import get_price_series
from motor.src.paths import CONFIG_DIR

_CONFIG_PATH = CONFIG_DIR / "models" / "fx_regime.json"
_TECNICOS_PATH = CONFIG_DIR / "indicadores_tecnicos_currencies.json"

_ER_ID = "expense_ratio"
_VOLUME_ID = "volume_dolar"
_FIT_ID = "dollar_fit"
_CARRY_ID = "fx_carry"
_TE_ID = "tracking_error"

_DEFAULT_ER = 0.005
_DEFAULT_TARGET = 0.25
_UUP = "UUP"
_TE_WINDOW = 63
_TE_MIN_OBS = 20


def _load_tecnicos() -> dict[str, Any]:
    if not _TECNICOS_PATH.is_file():
        return {}
    return json.loads(_TECNICOS_PATH.read_text(encoding="utf-8"))


def _load_security_ingredients() -> list[dict[str, Any]]:
    cfg = _load_tecnicos()
    if cfg.get("indicadores"):
        return list(cfg["indicadores"])
    return [
        {"id": _ER_ID, "peso": 0.2, "inverte_percentil": True},
        {"id": _VOLUME_ID, "peso": 0.2, "inverte_percentil": False},
        {
            "id": _FIT_ID,
            "peso": 0.15,
            "inverte_percentil": False,
            "tipo_metrica": "distancia_ao_alvo",
            "alvo_percentil": _DEFAULT_TARGET,
        },
        {"id": _CARRY_ID, "peso": 0.3, "inverte_percentil": False},
        {"id": _TE_ID, "peso": 0.15, "inverte_percentil": True},
    ]


def _ingredient(ind_id: str) -> dict[str, Any]:
    for item in _load_security_ingredients():
        if item.get("id") == ind_id:
            return item
    return {}


def _load_security_weights() -> dict[str, float]:
    ids = (_ER_ID, _VOLUME_ID, _FIT_ID, _CARRY_ID, _TE_ID)
    by_id = {i["id"]: float(i.get("peso") or 0) for i in _load_security_ingredients()}
    if all(by_id.get(k) for k in ids):
        return {
            "wa": by_id[_ER_ID],
            "wb": by_id[_VOLUME_ID],
            "wc": by_id[_FIT_ID],
            "wd": by_id[_CARRY_ID],
            "we": by_id[_TE_ID],
        }
    if not _CONFIG_PATH.is_file():
        return {"wa": 0.2, "wb": 0.2, "wc": 0.15, "wd": 0.3, "we": 0.15}
    cfg = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    sw = cfg.get("security_weights", {})
    return {
        "wa": float(sw.get("wa", 0.2)),
        "wb": float(sw.get("wb", 0.2)),
        "wc": float(sw.get("wc", 0.15)),
        "wd": float(sw.get("wd", 0.3)),
        "we": float(sw.get("we", 0.15)),
    }


def _fit_target() -> float:
    item = _ingredient(_FIT_ID)
    if item.get("alvo_percentil") is not None:
        return float(item["alvo_percentil"])
    cfg = _load_tecnicos()
    if cfg.get("alvo_percentil") is not None:
        return float(cfg["alvo_percentil"])
    return _DEFAULT_TARGET


def _carry_map() -> dict[str, dict[str, Any]]:
    cfg = _load_tecnicos()
    raw = cfg.get("carry_map") or {}
    return {str(k).upper(): v for k, v in raw.items()}


def _security_estagio(score: float) -> str:
    if score >= 0.65:
        return "Ascendente"
    if score >= 0.25:
        return "Maduro"
    return "Descendente"


def _as_percent(value: float) -> float:
    return value * 100.0 if abs(value) < 1.0 else value


def _policy_rate(key: str, as_of: dt.date) -> float | None:
    series: pd.Series
    if key == "ecb":
        series = get_external_series("ecb", "deposit_rate")
        if series.empty:
            series = get_fred_series("ECB_MRR")
        if series.empty:
            series = get_fred_series("IRSTCI01EZM156N")
    elif key == "DFF":
        series = get_fred_series("DFF")
        if series.empty:
            series = get_fred_series("FEDFUNDS")
    else:
        series = get_fred_series(key)
    val = _latest_at(series, as_of)
    if val is None:
        return None
    return _as_percent(float(val))


def _fx_carry(ticker: str, as_of: dt.date) -> float | None:
    spec = _carry_map().get(ticker.upper())
    if not spec:
        return None
    usd = _policy_rate("DFF", as_of)
    if usd is None:
        return None
    kind = spec.get("kind", "long_fx")
    if kind == "usd_long":
        rates: list[float] = []
        for key in spec.get("foreign_rates") or []:
            v = _policy_rate(str(key), as_of)
            if v is not None:
                rates.append(v)
        if not rates:
            return None
        return usd - (sum(rates) / len(rates))
    foreign = _policy_rate(str(spec.get("foreign") or ""), as_of)
    if foreign is None:
        return None
    return foreign - usd


def _tracking_error(ticker: str, as_of: dt.date) -> float | None:
    spec = _carry_map().get(ticker.upper())
    if not spec:
        return None
    spot_id = spec.get("spot_fred")
    if not spot_id:
        return None
    invert = bool(spec.get("spot_invert"))
    etf = get_price_series(ticker)
    spot = get_fred_series(str(spot_id))
    if etf.empty or spot.empty:
        return None
    cap = pd.Timestamp(as_of)
    etf = etf.copy()
    spot = spot.copy()
    etf.index = pd.DatetimeIndex(pd.to_datetime(etf.index))
    spot.index = pd.DatetimeIndex(pd.to_datetime(spot.index))
    etf = etf.loc[etf.index <= cap]
    spot = spot.loc[spot.index <= cap]
    er = etf.pct_change()
    sr = spot.pct_change()
    if invert:
        sr = -sr
    aligned = pd.concat([er, sr], axis=1, join="inner").dropna()
    if len(aligned) < _TE_MIN_OBS:
        return None
    window = min(_TE_WINDOW, len(aligned))
    resid = aligned.iloc[-window:, 0] - aligned.iloc[-window:, 1]
    std = float(resid.std(ddof=1))
    if not math.isfinite(std):
        return None
    return std * math.sqrt(252.0)


def compute_fx_security_batch(
    tickers: list[str],
    universe_tickers: list[str] | None = None,
    as_of: dt.date | None = None,
) -> dict[str, dict[str, Any]]:
    as_of = as_of or motor_as_of_date()
    weights = _load_security_weights()
    wa, wb, wc = weights["wa"], weights["wb"], weights["wc"]
    wd, we = weights["wd"], weights["we"]
    invert_er = bool(_ingredient(_ER_ID).get("inverte_percentil", True))
    invert_vol = bool(_ingredient(_VOLUME_ID).get("inverte_percentil", False))
    invert_fit = bool(_ingredient(_FIT_ID).get("inverte_percentil", False))
    invert_carry = bool(_ingredient(_CARRY_ID).get("inverte_percentil", False))
    invert_te = bool(_ingredient(_TE_ID).get("inverte_percentil", True))
    target_pct = _fit_target()
    cs_universe = list(dict.fromkeys((universe_tickers or tickers) + tickers))

    raw_er: dict[str, float] = {}
    raw_vol: dict[str, float] = {}
    raw_abs_beta: dict[str, float] = {}
    raw_carry: dict[str, float] = {}
    raw_te: dict[str, float] = {}

    for ticker in cs_universe:
        t = ticker.upper()
        raw_er[t] = expense_ratio_value(t) or _DEFAULT_ER
        raw_vol[t] = _dollar_volume(t, as_of)
        raw_abs_beta[t] = abs(rolling_beta(t, _UUP, as_of=as_of))
        carry = _fx_carry(t, as_of)
        if carry is not None:
            raw_carry[t] = carry
        te = _tracking_error(t, as_of)
        if te is not None:
            raw_te[t] = te

    p_er = _directed_percentile(raw_er, invert_er)
    p_vol = _directed_percentile(raw_vol, invert_vol)
    p_beta = _directed_percentile(raw_abs_beta, invert=False)
    p_carry = _directed_percentile(raw_carry, invert_carry)
    p_te = _directed_percentile(raw_te, invert_te)

    results: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        t = ticker.upper()
        er_pct = p_er.get(t, 0.5)
        vol_pct = p_vol.get(t, 0.5)
        beta_pct = p_beta.get(t, 0.5)
        fit = 1.0 - abs(beta_pct - target_pct)
        if invert_fit:
            fit = 1.0 - fit
        carry_pct = p_carry.get(t, 0.5)
        te_pct = p_te.get(t, 0.5)

        c_er = wa * er_pct
        c_vol = wb * vol_pct
        c_fit = wc * fit
        c_carry = wd * carry_pct
        c_te = we * te_pct
        security_score = c_er + c_vol + c_fit + c_carry + c_te

        componentes = [
            {
                "id": _ER_ID,
                "nome": "Expense ratio",
                "camada": "fundamental",
                "valor": raw_er.get(t),
                "percentile_cs": er_pct,
                "peso": wa,
                "inverte_percentil": invert_er,
                "contribuicao": c_er,
                "role": "custo declarado — menor taxa vs pares no mesmo dia",
            },
            {
                "id": _VOLUME_ID,
                "nome": "Volume em dólar",
                "camada": "tecnico",
                "valor": raw_vol.get(t),
                "percentile_cs": vol_pct,
                "peso": wb,
                "inverte_percentil": invert_vol,
                "contribuicao": c_vol,
                "role": "liquidez — close × ações vs pares",
            },
            {
                "id": _FIT_ID,
                "nome": "Dollar exposure (fit vs UUP)",
                "camada": "tecnico",
                "valor": raw_abs_beta.get(t),
                "percentile_cs": fit,
                "peso": wc,
                "inverte_percentil": invert_fit,
                "tipo_metrica": "distancia_ao_alvo",
                "alvo_percentil": target_pct,
                "fit": f"1 - |P(|beta_UUP|) - {target_pct:.2f}|",
                "contribuicao": c_fit,
                "role": "veículo — proximidade ao alvo de |β vs UUP|; não é direção cambial",
            },
            {
                "id": _CARRY_ID,
                "nome": "Carry (diferencial de juros)",
                "camada": "macro",
                "valor": raw_carry.get(t),
                "percentile_cs": carry_pct,
                "peso": wd,
                "inverte_percentil": invert_carry,
                "refresh": "hold_last",
                "contribuicao": c_carry,
                "role": "monotônico — taxa da moeda do ETF vs DFF; long USD = DFF − basket",
            },
            {
                "id": _TE_ID,
                "nome": "Tracking error vs spot",
                "camada": "tecnico",
                "valor": raw_te.get(t),
                "percentile_cs": te_pct,
                "peso": we,
                "inverte_percentil": invert_te,
                "te_window": _TE_WINDOW,
                "contribuicao": c_te,
                "role": "custo realizado — menor σ do ativo vs par FRED (63d)",
            },
        ]

        dominant = max(componentes, key=lambda c: abs(c["contribuicao"]))
        explanation = [
            f"SecurityScore = {security_score:.3f} (ranking FX — veículo, não mistura com regime).",
            f"Expense invertida pct = {er_pct:.0%} (contrib {c_er:.3f}).",
            f"Volume em dólar pct = {vol_pct:.0%} (contrib {c_vol:.3f}).",
            f"Dollar fit vs alvo {target_pct:.0%} = {fit:.0%} (contrib {c_fit:.3f}).",
            f"Carry pct = {carry_pct:.0%} (contrib {c_carry:.3f}).",
            f"TE 63d invertido pct = {te_pct:.0%} (contrib {c_te:.3f}).",
        ]

        results[t] = {
            "ticker": t,
            "data": as_of.isoformat(),
            "score_composto": security_score,
            "security_score": security_score,
            "componentes": componentes,
            "indicador_dominante": dominant,
            "estagio": _security_estagio(security_score),
            "model": "fx_security_v2",
            "cross_sectional_universe_size": len(cs_universe),
            "explanation": explanation,
        }
    return results
