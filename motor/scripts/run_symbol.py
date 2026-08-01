#!/usr/bin/env python3
"""Run motor pipeline for a single watchlisted symbol (on ★ add)."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

MOTOR_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Motor on-demand symbol pipeline")
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--class-id", required=True)
    parser.add_argument("--start", default="2019-01-01")
    args = parser.parse_args()

    from motor.src.pipeline_symbol import run_symbol_pipeline

    result = run_symbol_pipeline(args.symbol, args.class_id, args.start)
    print(json.dumps(result, indent=2, ensure_ascii=False))

    export_script = MOTOR_ROOT / "scripts" / "export_dashboard_snapshot.py"
    subprocess.run(
        [sys.executable, str(export_script)],
        check=True,
        env={**os.environ, "PYTHONPATH": str(MOTOR_ROOT.parent)},
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[run_symbol] ERRO: {e}", file=sys.stderr)
        sys.exit(1)
