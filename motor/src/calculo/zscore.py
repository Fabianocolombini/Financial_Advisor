"""Generic z-score and percentile utilities."""

from __future__ import annotations

import numpy as np
import pandas as pd

TRADING_DAYS_PER_YEAR = 252


def _window_days(window_years: float) -> int:
    return max(1, int(window_years * TRADING_DAYS_PER_YEAR))


def clip_scale(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def delta_n(series: pd.Series, periods: int) -> pd.Series:
    if series.empty:
        return pd.Series(dtype=float)
    return series - series.shift(periods)


def percentile_latest(series: pd.Series, window_years: float = 5.0) -> float | None:
    """Percentile (0–100) of the latest value vs trailing window. None if insufficient history."""
    s = series.dropna()
    window = _window_days(window_years)
    if len(s) < 10:
        return None
    tail = s.iloc[-window:] if len(s) > window else s
    latest = float(tail.iloc[-1])
    return float((tail < latest).sum() / len(tail) * 100.0)


def zscore_latest(series: pd.Series, window_years: float = 1.0) -> float | None:
    """Z-score of the latest value vs trailing window. None if insufficient history."""
    s = series.dropna()
    window = _window_days(window_years)
    if len(s) < 10:
        return None
    tail = s.iloc[-window:] if len(s) > window else s
    latest = float(tail.iloc[-1])
    mean = float(tail.mean())
    std = float(tail.std())
    # Constant (or float-noise-constant) series: treat as z = None, not 1/ε.
    eps = max(1e-12, abs(mean) * 1e-9)
    if not np.isfinite(std) or std <= eps:
        return None
    return float((latest - mean) / std)


def percentile_latest_detail(
    series: pd.Series, window: int = 1260
) -> tuple[float, float, float]:
    """
    Return (percentile_0_100, latest_value, window_min) for ranking vs history.
    Legacy tuple API — uses window in trading days.
    """
    s = series.dropna()
    if len(s) < 10:
        latest = float(s.iloc[-1]) if len(s) else 0.0
        return 50.0, latest, latest
    tail = s.iloc[-window:] if len(s) > window else s
    latest = float(tail.iloc[-1])
    pct = percentile_latest(s, window_years=window / TRADING_DAYS_PER_YEAR)
    if pct is None:
        pct = 50.0
    return pct, latest, float(tail.min())


def zscore_latest_detail(
    series: pd.Series, window: int = 252
) -> tuple[float, float, float]:
    """
    Return (z_score, latest_value, mean_window) for the most recent observation.
    Legacy tuple API — uses window in trading days.
    """
    s = series.dropna()
    if len(s) < 10:
        latest = float(s.iloc[-1]) if len(s) else 0.0
        return 0.0, latest, latest
    tail = s.iloc[-window:] if len(s) > window else s
    latest = float(tail.iloc[-1])
    mean = float(tail.mean())
    z = zscore_latest(s, window_years=window / TRADING_DAYS_PER_YEAR)
    if z is None:
        return 0.0, latest, mean
    return z, latest, mean


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
