"""Load external_series as pandas Series."""

from __future__ import annotations

import datetime as dt

import pandas as pd

from motor.src.db.external_series_store import get_series


def get_external_series(source: str, series_id: str) -> pd.Series:
    rows = get_series(source, series_id)
    if not rows:
        return pd.Series(dtype=float)
    dates = [dt.date.fromisoformat(d) for d, _ in rows]
    vals = [v for _, v in rows]
    return pd.Series(vals, index=dates)
