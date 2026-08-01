#!/usr/bin/env python3
"""Acceptance checks for taxas + credito_alternativo (and optional other abas)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

MOTOR_ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = MOTOR_ROOT / "data" / "dashboard-snapshot.json"
OUTPUT_DIR = MOTOR_ROOT / "output"


def main() -> None:
    from motor.src.db.connection import get_connection, init_db
    from motor.src.dates import motor_as_of_date

    init_db()
    expected = motor_as_of_date()
    errors: list[str] = []

    with get_connection() as conn:
        for aba_id in ("taxas", "credito_alternativo"):
            row = conn.execute(
                """
                SELECT data, score_composto, estagio, slope
                FROM scores_historico
                WHERE aba_id = ?
                ORDER BY data DESC LIMIT 1
                """,
                (aba_id,),
            ).fetchone()
            if not row:
                errors.append(f"{aba_id}: no scores_historico row")
                continue
            if row["estagio"] is None:
                errors.append(f"{aba_id}: missing estagio on latest score")
            if row["data"] < expected.isoformat():
                print(f"[validate_abas] WARN {aba_id} data {row['data']} < expected {expected}")

            ativos = conn.execute(
                """
                SELECT ticker, score_composto, estagio, diverge_categoria
                FROM scores_ativo WHERE aba_id = ? AND data = ?
                """,
                (aba_id, row["data"]),
            ).fetchall()
            if not ativos:
                errors.append(f"{aba_id}: no scores_ativo for {row['data']}")

        bdc_div = conn.execute(
            """
            SELECT ticker, diverge_categoria FROM scores_ativo
            WHERE aba_id = 'credito_alternativo'
            ORDER BY data DESC LIMIT 10
            """
        ).fetchall()
        if not bdc_div:
            errors.append("credito_alternativo: no BDC ticker scores")

    reports = list(OUTPUT_DIR.glob("relatorio_taxas_*.md"))
    if not reports:
        errors.append("missing relatorio_taxas_*.md")
    reports_alt = list(OUTPUT_DIR.glob("relatorio_credito_alternativo_*.md"))
    if not reports_alt:
        errors.append("missing relatorio_credito_alternativo_*.md")

    if not SNAPSHOT.is_file():
        errors.append("missing dashboard-snapshot.json — run export_dashboard_snapshot")
    else:
        snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
        if not snap.get("classes", {}).get("fi_treasury"):
            errors.append("snapshot missing fi_treasury class")
        if not snap.get("classes", {}).get("alt_bdc"):
            errors.append("snapshot missing alt_bdc class")
        tickers = snap.get("tickers", {})
        for sym in ("TLT", "ARCC"):
            if sym not in tickers:
                errors.append(f"snapshot missing ticker {sym}")
            elif "entryValidated" not in tickers[sym]:
                errors.append(f"snapshot ticker {sym} missing entryValidated")

    if errors:
        for e in errors:
            print(f"[validate_abas] FAIL: {e}", file=sys.stderr)
        sys.exit(1)

    print("[validate_abas] OK — taxas + credito_alternativo acceptance checks passed")


if __name__ == "__main__":
    main()
