"""Generic z-score from a numeric series."""

from __future__ import annotations

import numpy as np
import pandas as pd


def zscore_latest(series: pd.Series, window: int = 252) -> tuple[float, float, float]:
    """
    Return (z_score, latest_value, mean_window) for the most recent observation.
    Uses the last `window` non-null values.
    """
    s = series.dropna()
    if len(s) < 10:
        latest = float(s.iloc[-1]) if len(s) else 0.0
        return 0.0, latest, latest
    tail = s.iloc[-window:] if len(s) > window else s
    latest = float(tail.iloc[-1])
    mean = float(tail.mean())
    std = float(tail.std())
    if std == 0 or not np.isfinite(std):
        return 0.0, latest, mean
    z = (latest - mean) / std
    return float(z), latest, mean


def percentile_latest(series: pd.Series, window: int = 1260) -> tuple[float, float, float]:
    """Return (percentile_0_100, latest_value, window_min) for ranking vs history."""
    s = series.dropna()
    if len(s) < 10:
        latest = float(s.iloc[-1]) if len(s) else 0.0
        return 50.0, latest, latest
    tail = s.iloc[-window:] if len(s) > window else s
    latest = float(tail.iloc[-1])
    pct = float((tail < latest).sum() / len(tail) * 100.0)
    return pct, latest, float(tail.min())


def ewma_volatility(returns: pd.Series, lam: float = 0.94) -> float:
    """EWMA variance (RiskMetrics) → annualized vol."""
    r = returns.dropna()
    if len(r) < 5:
        return 0.0
    var = float(r.iloc[0] ** 2)
    for x in r.iloc[1:]:
        var = lam * var + (1 - lam) * float(x ** 2)
    return float(np.sqrt(var * 252))


def apply_direction(z: float, direcao: str) -> float:
    if direcao == "negativa":
        return -z
    return z
