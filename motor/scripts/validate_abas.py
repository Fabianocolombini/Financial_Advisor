#!/usr/bin/env python3
"""Acceptance checks for fi_treasury + credito_alternativo (and optional other abas)."""

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
        for canonical in ("fi_treasury", "credito_alternativo"):
            historico_aba = canonical
            row = conn.execute(
                """
                SELECT data, score_composto, estagio, slope
                FROM scores_historico
                WHERE aba_id = ?
                ORDER BY data DESC LIMIT 1
                """,
                (canonical,),
            ).fetchone()
            if not row and canonical == "fi_treasury":
                row = conn.execute(
                    """
                    SELECT data, score_composto, estagio, slope
                    FROM scores_historico
                    WHERE aba_id = 'taxas'
                    ORDER BY data DESC LIMIT 1
                    """
                ).fetchone()
                if row:
                    historico_aba = "taxas"
            if not row:
                errors.append(f"{canonical}: no scores_historico row")
                continue
            if row["estagio"] is None:
                errors.append(f"{canonical}: missing estagio on latest score")
            if row["data"] < expected.isoformat():
                print(f"[validate_abas] WARN {canonical} data {row['data']} < expected {expected}")

            ativos = conn.execute(
                """
                SELECT ticker, score_composto, estagio, diverge_categoria
                FROM scores_ativo WHERE aba_id = ? AND data = ?
                """,
                (historico_aba, row["data"]),
            ).fetchall()
            if not ativos:
                errors.append(f"{canonical}: no scores_ativo for {row['data']}")

        bdc_div = conn.execute(
            """
            SELECT ticker, diverge_categoria FROM scores_ativo
            WHERE aba_id = 'credito_alternativo'
            ORDER BY data DESC LIMIT 10
            """
        ).fetchall()
        if not bdc_div:
            errors.append("credito_alternativo: no BDC ticker scores")

    reports = list(OUTPUT_DIR.glob("relatorio_fi_treasury_*.md"))
    if not reports:
        reports = list(OUTPUT_DIR.glob("relatorio_taxas_*.md"))
    if not reports:
        errors.append("missing relatorio_fi_treasury_*.md (or legacy relatorio_taxas_*.md)")
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
        quality = snap.get("quality", {})
        if not quality.get("ok", True):
            errors.append(f"snapshot quality failed: {quality.get('issues')}")
        ticker_count = len(snap.get("tickers", {}))
        if ticker_count < 10:
            errors.append(f"snapshot tickerCount too low: {ticker_count}")
        tickers = snap.get("tickers", {})
        for sym in ("TLT", "ARCC"):
            if sym not in tickers:
                errors.append(f"snapshot missing ticker {sym}")
            elif "entryValidated" not in tickers[sym]:
                errors.append(f"snapshot ticker {sym} missing entryValidated")

        mlp = snap.get("classes", {}).get("energy_mlp")
        if mlp:
            ind_ids = {i.get("id") for i in mlp.get("indicators", [])}
            if "distribution_yield_spread" not in ind_ids:
                # class macro may not list all manifest ids in top-5; check manifest driver in pipeline
                print(
                    "[validate_abas] WARN: energy_mlp top indicators omit distribution_yield_spread "
                    "(may be below top-5 contribution)"
                )
        else:
            errors.append("snapshot missing energy_mlp class")

    if errors:
        for e in errors:
            print(f"[validate_abas] FAIL: {e}", file=sys.stderr)
        sys.exit(1)

    print("[validate_abas] OK — fi_treasury + credito_alternativo acceptance checks passed")


if __name__ == "__main__":
    main()
