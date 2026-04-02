"""
CFTC Commitments of Traders via Socrata Open Data API (phase 2).

Stub: implement dataset-specific GET + map rows into `qi_cot_snapshot`.
See https://publicreporting.cftc.gov/ and contract codes for `qi_cot_contract_map`.
"""

from __future__ import annotations

from typing import Any


def fetch_cot_stub() -> list[dict[str, Any]]:
    """Return [] until CFTC dataset id and column mapping are configured."""
    return []


def ingest_cot_to_db() -> int:
    """Placeholder — wire httpx + upsert `QiCotSnapshot` when ready."""
    return 0
