"""
SEC EDGAR 13F-HR filings → `qi_institutional_flow_snapshot` (phase 2).

Stub: index filings by CIK, parse XML holdings, resolve CUSIP/symbol to `qi_asset.id`.
"""

from __future__ import annotations

from typing import Any


def list_13f_filings_stub(cik: str) -> list[dict[str, Any]]:
    return []


def ingest_institutional_flows_stub() -> int:
    return 0
