#!/usr/bin/env python3
"""Orquestração diária do motor: fontes → pipeline (todas as abas) → relatórios."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

MOTOR_ROOT = Path(__file__).resolve().parents[1]
ABAS_DIR = MOTOR_ROOT / "config" / "abas"

from motor.src.ingestao.pipeline_fontes import run_fontes_pipeline  # noqa: E402
from motor.src.pipeline import run_pipeline  # noqa: E402


def list_aba_ids() -> list[str]:
    return sorted(p.stem for p in ABAS_DIR.glob("*.json"))


def main() -> None:
    abas = list_aba_ids()
    if not abas:
        print("[motor:daily] Nenhuma aba em motor/config/abas/", file=sys.stderr)
        sys.exit(1)

    print("[motor:daily] Etapa 1 — ingestão de fontes...")
    fontes = run_fontes_pipeline()
    print(json.dumps({"fontes_enabled": fontes.get("enabled")}, ensure_ascii=False))

    results: list[dict] = []
    for aba_id in abas:
        print(f"[motor:daily] Pipeline — {aba_id}...")
        result = run_pipeline(aba_id)
        results.append(result)

    print("[motor:daily] Export dashboard snapshot...")
    export_script = MOTOR_ROOT / "scripts" / "export_dashboard_snapshot.py"
    subprocess.run(
        [sys.executable, str(export_script)],
        check=True,
        env={**os.environ, "PYTHONPATH": str(MOTOR_ROOT.parent)},
    )

    snapshot_path = MOTOR_ROOT / "data" / "dashboard-snapshot.json"
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

    print(json.dumps({"ok": True, "abas": results}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[motor:daily] ERRO: {e}", file=sys.stderr)
        sys.exit(1)
