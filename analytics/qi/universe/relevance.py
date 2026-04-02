"""Cross-sectional relevance scores (stocks vs ETFs) — explainable components."""

from __future__ import annotations


from dataclasses import dataclass
from typing import Any, Optional

import numpy as np


@dataclass
class RelevanceBreakdown:
    """Numeric inputs copied into `qi_universe_member.inclusion_reason`."""

    z_log_cap: float
    z_log_liq: float
    z_etf_vehicle: float
    z_purity: float
    weights: dict[str, float]
    relevance_raw: float
    relevance_mass: float


def _z(x: np.ndarray) -> np.ndarray:
    m = np.nanmean(x)
    s = np.nanstd(x)
    if not np.isfinite(s) or s < 1e-12:
        return np.zeros_like(x, dtype=float)
    return (x - m) / s


def compute_masses(
    *,
    market_caps: np.ndarray,
    dollar_vols: np.ndarray,
    is_etf: np.ndarray,
    sector_purity: Optional[np.ndarray] = None,
    w_cap: float = 0.45,
    w_liq: float = 0.35,
    w_etf: float = 0.12,
    w_purity: float = 0.08,
) -> tuple[np.ndarray, list[RelevanceBreakdown]]:
    """Return relevance_mass (non-negative) per row; sum defines 90% coverage denominator."""
    n = len(market_caps)
    log_cap = np.log1p(np.maximum(market_caps, 0.0))
    log_liq = np.log1p(np.maximum(dollar_vols, 0.0))
    zc = _z(log_cap)
    zl = _z(log_liq)
    z_etf = np.where(is_etf > 0.5, 0.75, 0.0)  # vehicle bonus (scaled in z below)
    z_etf = _z(z_etf + np.zeros(n))
    pur = sector_purity if sector_purity is not None else np.where(is_etf > 0.5, 1.0, 1.0)
    zp = _z(pur)
    raw = w_cap * zc + w_liq * zl + w_etf * z_etf + w_purity * zp
    raw = np.maximum(raw, 0.0)
    masses = raw + 1e-8
    bd: list[RelevanceBreakdown] = []
    wdict = {"cap": w_cap, "liq": w_liq, "etf_vehicle": w_etf, "purity": w_purity}
    for i in range(n):
        bd.append(
            RelevanceBreakdown(
                z_log_cap=float(zc[i]),
                z_log_liq=float(zl[i]),
                z_etf_vehicle=float(z_etf[i]),
                z_purity=float(zp[i]),
                weights=wdict,
                relevance_raw=float(raw[i]),
                relevance_mass=float(masses[i]),
            )
        )
    return masses, bd
