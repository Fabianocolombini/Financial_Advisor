"""Smoke tests for each data source (Etapa 1)."""

from __future__ import annotations

import datetime as dt
import json
import sys
from typing import Any

from motor.src.db.connection import get_connection, init_db
from motor.src.ingestao.ecb_client import test_connection as ecb_test
from motor.src.ingestao.edgar_client import ticker_to_cik
from motor.src.ingestao.fred_client import run_test as fred_test
from motor.src.ingestao.fontes_registry import load_manifest
from motor.src.ingestao.world_bank_client import test_connection as wb_test
from motor.src.ingestao.yfinance_fields import test_connection as yf_test

import httpx


def _persist_status(fonte: str, ok: bool, detail: str) -> None:
    init_db()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO source_status (fonte, ok, last_test_at, detail)
            VALUES (?, ?, ?, ?)
            """,
            (fonte, 1 if ok else 0, dt.datetime.now(dt.timezone.utc).isoformat(), detail),
        )
        conn.commit()


def test_edgar() -> dict[str, Any]:
    with httpx.Client() as client:
        cik = ticker_to_cik(client, "ARCC")
    if not cik:
        return {"ok": False, "error": "ARCC CIK not found"}
    return {"ok": True, "ARCC_cik": cik}


def run_all_tests() -> dict[str, Any]:
    manifest = load_manifest()
    results: dict[str, Any] = {}

    tests = {
        "fred": lambda: fred_test(),
        "yfinance": lambda: yf_test(),
        "edgar": lambda: test_edgar(),
        "world_bank": lambda: wb_test(),
        "ecb": lambda: ecb_test(),
    }

    for name, fn in tests.items():
        fonte_cfg = manifest.get("fontes", {}).get(name, {})
        if not fonte_cfg.get("enabled", False):
            results[name] = {"ok": True, "skipped": True, "reason": "disabled in manifest"}
            continue
        try:
            r = fn()
            if name == "fred" and isinstance(r, dict) and "DGS10" in r:
                r = {"ok": True, "series": r}
            ok = bool(r.get("ok")) or r.get("skipped")
            results[name] = r
            _persist_status(name, ok, json.dumps(r))
        except Exception as e:
            results[name] = {"ok": False, "error": str(e)}
            _persist_status(name, False, str(e))

    # Disabled sources — document only
    for name in ("nareit", "cftc", "multpl"):
        cfg = manifest.get("fontes", {}).get(name, {})
        if not cfg.get("enabled"):
            results[name] = {"ok": True, "skipped": True, "nota": cfg.get("nota", "Fase 2/3")}

    results["all_ok"] = all(
        r.get("ok") or r.get("skipped") for r in results.values()
    )
    return results


def main() -> None:
    out = run_all_tests()
    print(json.dumps(out, indent=2))
    if not out.get("all_ok"):
        sys.exit(1)


if __name__ == "__main__":
    main()
