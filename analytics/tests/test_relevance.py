import numpy as np

from qi.universe.relevance import compute_masses


def test_compute_masses_sums_positive():
    n = 5
    caps = np.array([1e9, 5e8, 2e9, 3e8, 1e8], dtype=float)
    liqs = np.array([1e7, 2e7, 5e7, 1e6, 3e6], dtype=float)
    etf = np.array([0, 1, 0, 0, 1], dtype=float)
    masses, bd = compute_masses(market_caps=caps, dollar_vols=liqs, is_etf=etf)
    assert len(masses) == n
    assert masses.sum() > 0
    assert len(bd) == n
    assert all(b.relevance_mass > 0 for b in bd)
