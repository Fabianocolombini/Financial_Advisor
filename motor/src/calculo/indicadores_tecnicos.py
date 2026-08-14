"""Six generic technical indicators per ticker."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd

from motor.src.config_loader import load_aba_config, load_tecnicos_config
from motor.src.db.connection import get_connection, init_db
from motor.src.ingestao.yfinance_client import get_price_series


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def mm50_distance_zscore(prices: pd.Series, window: int = 50) -> pd.Series:
    """(price − MA) / std(price, window). Distinguishes healthy drift from a real anomaly."""
    mm = prices.rolling(window).mean()
    std = prices.rolling(window).std().replace(0, np.nan)
    return (prices - mm) / std


def compute_for_ticker(ticker: str, benchmark: str, cfg: dict) -> dict[str, pd.Series]:
    prices = get_price_series(ticker)
    bench = get_price_series(benchmark) if benchmark else pd.Series(dtype=float)
    if prices.empty:
        return {}

    out: dict[str, pd.Series] = {}
    mm50 = prices.rolling(50).mean()
    mm200 = prices.rolling(200).mean()
    out["preco_vs_mm50"] = prices / mm50 - 1.0
    out["preco_vs_mm200"] = prices / mm200 - 1.0
    out["preco_vs_mm50_abs"] = out["preco_vs_mm50"].abs()
    z50 = mm50_distance_zscore(prices, int(cfg.get("ma50_zscore_window", 50)))
    out["preco_vs_mm50_z"] = z50
    out["preco_vs_mm50_z_abs"] = z50.abs()
    out["rsi_14"] = _rsi(prices, cfg.get("rsi_period", 14))
    vol = prices.pct_change().rolling(cfg.get("vol_window", 20)).std()
    out["vol_realizada"] = vol
    # volume from price_daily
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT data, volume FROM price_daily WHERE ticker = ? ORDER BY data",
            (ticker.upper(),),
        ).fetchall()
    if rows:
        vdates = [dt.date.fromisoformat(r["data"]) for r in rows]
        volumes = pd.Series([float(r["volume"] or 0) for r in rows], index=vdates)
        vma = volumes.rolling(20).mean()
        out["volume_vs_media"] = volumes / vma - 1.0
    else:
        out["volume_vs_media"] = pd.Series(dtype=float)

    if not bench.empty:
        aligned = pd.concat([prices, bench], axis=1, join="inner")
        if len(aligned.columns) >= 2:
            ret_t = aligned.iloc[:, 0].pct_change(63)
            ret_b = aligned.iloc[:, 1].pct_change(63)
            out["forca_relativa"] = ret_t - ret_b
    else:
        out["forca_relativa"] = prices.pct_change(63)

    return out


def persist_tecnicos(ticker: str, benchmark: str, aba_id: str | None = None) -> int:
    cfg = load_tecnicos_config(aba_id)
    computed = compute_for_ticker(ticker, benchmark, cfg)
    allowed = {i["id"] for i in cfg.get("indicadores", [])}
    exclude = set(cfg.get("exclude_indicators", []))
    n = 0
    with get_connection() as conn:
        for ind_id, series in computed.items():
            if ind_id in exclude:
                continue
            if allowed and ind_id not in allowed:
                continue
            for date_idx, val in series.dropna().items():
                if not np.isfinite(val):
                    continue
                d = date_idx.isoformat() if hasattr(date_idx, "isoformat") else str(date_idx)
                conn.execute(
                    """
                    INSERT OR REPLACE INTO indicadores_tecnicos
                    (ticker, data, indicador_id, valor) VALUES (?, ?, ?, ?)
                    """,
                    (ticker.upper(), d, ind_id, float(val)),
                )
                n += 1
        conn.commit()
    return n


def compute_aba_tecnicos(aba_id: str) -> dict[str, int]:
    init_db()
    aba = load_aba_config(aba_id)
    counts: dict[str, int] = {}
    for item in aba.get("universo", []):
        t = item["ticker"].upper()
        b = (item.get("benchmark") or "").upper()
        counts[t] = persist_tecnicos(t, b, aba_id=aba_id)
    return counts


def get_tecnico_series(ticker: str, indicador_id: str) -> pd.Series:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT data, valor FROM indicadores_tecnicos
            WHERE ticker = ? AND indicador_id = ?
            ORDER BY data
            """,
            (ticker.upper(), indicador_id),
        ).fetchall()
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(r["data"]) for r in rows]
    vals = [float(r["valor"]) for r in rows]
    return pd.Series(vals, index=dates)
