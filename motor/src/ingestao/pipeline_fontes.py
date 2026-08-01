"""Etapa 1 — pipeline de gestão de fontes (ingest + log)."""

from __future__ import annotations

import datetime as dt
import json
import sys
from typing import Any

from motor.src.db.connection import get_connection, init_db
from motor.src.ingestao.calculated_ingest import persist_calculated_latest
from motor.src.ingestao.ecb_client import ingest_ecb_rate
from motor.src.ingestao.edgar_client import fetch_bdc_metric
from motor.src.ingestao.fontes_registry import (
    all_fred_series,
    enabled_fontes,
    load_manifest,
)
from motor.src.ingestao.fred_client import ingest_series
from motor.src.ingestao.world_bank_client import ingest_em_gdp_growth
from motor.src.ingestao.yfinance_fields import ingest_manifest_yfinance_fields, ingest_test_tickers


def _log_start(conn, fonte: str) -> int:
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    cur = conn.execute(
        "INSERT INTO ingestion_log (fonte, started_at, status) VALUES (?, ?, ?)",
        (fonte, started, "running"),
    )
    return cur.lastrowid or 0


def _log_finish(conn, log_id: int, status: str, records: int, detail: str = "") -> None:
    finished = dt.datetime.now(dt.timezone.utc).isoformat()
    conn.execute(
        """
        UPDATE ingestion_log SET finished_at = ?, status = ?, records = ?, detail = ?
        WHERE id = ?
        """,
        (finished, status, records, detail, log_id),
    )


def run_fontes_pipeline(start: str = "2019-01-01") -> dict[str, Any]:
    init_db()
    manifest = load_manifest()
    result: dict[str, Any] = {"fontes": {}, "enabled": enabled_fontes(manifest)}

    with get_connection() as conn:
        if "fred" in result["enabled"]:
            log_id = _log_start(conn, "fred")
            try:
                series = all_fred_series(manifest)
                counts = ingest_series(series, start, conn=conn)
                conn.commit()
                total = sum(counts.values())
                _log_finish(conn, log_id, "success", total, json.dumps(counts))
                result["fontes"]["fred"] = {"points": total, "series": len(counts)}
            except Exception as e:
                _log_finish(conn, log_id, "failed", 0, str(e))
                result["fontes"]["fred"] = {"error": str(e)}

        if "yfinance" in result["enabled"]:
            log_id = _log_start(conn, "yfinance")
            try:
                price_counts = ingest_test_tickers(manifest, start, conn=conn)
                field_counts = ingest_manifest_yfinance_fields(manifest, conn)
                conn.commit()
                total_prices = sum(price_counts.values())
                _log_finish(
                    conn,
                    log_id,
                    "success",
                    total_prices,
                    json.dumps({"prices": price_counts, "fields": field_counts}),
                )
                result["fontes"]["yfinance"] = {
                    "price_bars": total_prices,
                    "fields": field_counts,
                }
            except Exception as e:
                _log_finish(conn, log_id, "failed", 0, str(e))
                result["fontes"]["yfinance"] = {"error": str(e)}

        # Calculated (depends on FRED + yfinance snapshots)
        log_id = _log_start(conn, "calculado")
        try:
            calc = persist_calculated_latest(conn)
            conn.commit()
            _log_finish(conn, log_id, "success", len(calc), json.dumps(calc))
            result["fontes"]["calculado"] = calc
        except Exception as e:
            _log_finish(conn, log_id, "failed", 0, str(e))
            result["fontes"]["calculado"] = {"error": str(e)}

        if "edgar" in result["enabled"]:
            log_id = _log_start(conn, "edgar")
            try:
                # Reuse credito_alternativo config path for BDC — manifest-driven tickers
                from motor.src.ingestao.edgar_client import fetch_bdc_metric as _fetch

                edgar_out: dict[str, Any] = {}
                for cls in manifest.get("classes", []):
                    for ind in cls.get("indicadores", []):
                        if ind.get("fonte") != "edgar":
                            continue
                        t = ind.get("ticker_proxy", "").upper()
                        m = ind.get("metric", "")
                        if t and m:
                            r = _fetch(t, m)
                            if r:
                                filed, val = r
                                conn.execute(
                                    """
                                    INSERT OR REPLACE INTO edgar_metrics
                                    (ticker, data, metric, valor) VALUES (?, ?, ?, ?)
                                    """,
                                    (t, filed, m, val),
                                )
                                edgar_out[t] = {"metric": m, "value": val, "date": filed}
                conn.commit()
                _log_finish(conn, log_id, "success", len(edgar_out), json.dumps(edgar_out))
                result["fontes"]["edgar"] = edgar_out
            except Exception as e:
                _log_finish(conn, log_id, "failed", 0, str(e))
                result["fontes"]["edgar"] = {"error": str(e)}

        if "world_bank" in result["enabled"]:
            log_id = _log_start(conn, "world_bank")
            try:
                n = ingest_em_gdp_growth(conn)
                conn.commit()
                _log_finish(conn, log_id, "success", n)
                result["fontes"]["world_bank"] = {"records": n}
            except Exception as e:
                _log_finish(conn, log_id, "failed", 0, str(e))
                result["fontes"]["world_bank"] = {"error": str(e)}

        if "ecb" in result["enabled"]:
            log_id = _log_start(conn, "ecb")
            try:
                n = ingest_ecb_rate(conn)
                conn.commit()
                _log_finish(conn, log_id, "success", n)
                result["fontes"]["ecb"] = {"records": n}
            except Exception as e:
                _log_finish(conn, log_id, "failed", 0, str(e))
                result["fontes"]["ecb"] = {"error": str(e)}

        conn.commit()

    return result


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Motor fontes pipeline (Etapa 1)")
    parser.add_argument("--start", default="2019-01-01")
    args = parser.parse_args()
    try:
        out = run_fontes_pipeline(args.start)
        print(json.dumps(out, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
