#!/usr/bin/env python3
"""Orquestração diária: fontes → macro por aba → score top-90% liquidez → snapshot."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

MOTOR_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = MOTOR_ROOT.parent
ABAS_DIR = MOTOR_ROOT / "config" / "abas"

from motor.src.catalog.top_liquidity import top_symbols_for_aba  # noqa: E402
from motor.src.ingestao.pipeline_fontes import run_fontes_pipeline  # noqa: E402
from motor.src.pipeline import run_pipeline  # noqa: E402
from motor.src.pipeline_top_symbols import score_symbol_list  # noqa: E402


def list_aba_ids() -> list[str]:
    return sorted(p.stem for p in ABAS_DIR.glob("*.json"))


def generate_mvp_reports() -> None:
    from motor.src.output.gerar_relatorio import generate_report

    for aba_id in ("fi_treasury", "credito_alternativo"):
        try:
            path = generate_report(aba_id)
            print(f"[motor:daily] Report {aba_id}: {path}")
        except Exception as e:
            print(f"[motor:daily] WARN: report {aba_id} failed: {e}", file=sys.stderr)


def export_catalog_json() -> None:
    script = REPO_ROOT / "scripts" / "export-catalog-for-motor.ts"
    if not script.is_file():
        print("[motor:daily] WARN: export-catalog script missing — skip", file=sys.stderr)
        return
    subprocess.run(
        ["npx", "tsx", str(script)],
        check=True,
        cwd=str(REPO_ROOT),
    )


def main() -> None:
    abas = list_aba_ids()
    if not abas:
        print("[motor:daily] Nenhuma aba em motor/config/abas/", file=sys.stderr)
        sys.exit(1)

    print("[motor:daily] Export catalog for motor...")
    try:
        export_catalog_json()
    except subprocess.CalledProcessError as e:
        print(f"[motor:daily] WARN: catalog export failed: {e}", file=sys.stderr)

    print("[motor:daily] Etapa 1 — ingestão de fontes...")
    fontes = run_fontes_pipeline()
    print(json.dumps({"fontes_enabled": fontes.get("enabled")}, ensure_ascii=False))

    results: list[dict] = []
    top90_summary: list[dict] = []

    for aba_id in abas:
        print(f"[motor:daily] Pipeline macro — {aba_id}...")
        macro = run_pipeline(aba_id, score_universe=False)
        results.append({"aba_id": aba_id, "macro": macro})

        print(f"[motor:daily] Top-90% liquidity scores — {aba_id}...")
        symbols = top_symbols_for_aba(aba_id)
        if not symbols:
            print(f"[motor:daily] WARN: no symbols for {aba_id}", file=sys.stderr)
            continue
        batch = score_symbol_list(aba_id, symbols)
        top90_summary.append(batch)
        print(
            f"[motor:daily] Scored {batch['symbols_scored']}/{batch['symbols_requested']} "
            f"for {aba_id}"
        )

    print("[motor:daily] MVP reports (fi_treasury + credito_alternativo)...")
    generate_mvp_reports()

    print("[motor:daily] Export dashboard snapshot...")
    export_script = MOTOR_ROOT / "scripts" / "export_dashboard_snapshot.py"
    subprocess.run(
        [sys.executable, str(export_script)],
        check=True,
        env={**os.environ, "PYTHONPATH": str(REPO_ROOT)},
    )

    snapshot_path = MOTOR_ROOT / "data" / "dashboard-snapshot.json"
    snap: dict = {}
    if snapshot_path.is_file():
        with snapshot_path.open(encoding="utf-8") as f:
            snap = json.load(f)
        quality = snap.get("quality", {})
        if quality.get("stale"):
            print(
                "[motor:daily] WARN: snapshot asOf is stale — "
                f"expected EOD {quality.get('expectedAsOf')}",
                file=sys.stderr,
            )
        if not quality.get("ok", True):
            print(f"[motor:daily] Snapshot quality issues: {quality.get('issues')}", file=sys.stderr)
            sys.exit(1)

    print(
        json.dumps(
            {
                "ok": True,
                "abas": len(abas),
                "top90": top90_summary,
                "tickerCount": len(snap.get("tickers", {})) if snapshot_path.is_file() else 0,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[motor:daily] ERRO: {e}", file=sys.stderr)
        sys.exit(1)
