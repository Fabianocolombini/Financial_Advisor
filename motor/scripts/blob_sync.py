#!/usr/bin/env python3
"""Sincroniza motor/data/historico.db e relatórios com Vercel Blob."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx

MOTOR_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = MOTOR_ROOT / "data"
OUTPUT_DIR = MOTOR_ROOT / "output"
DB_PATH = DATA_DIR / "historico.db"
SNAPSHOT_PATH = DATA_DIR / "dashboard-snapshot.json"
SNAPSHOT_BLOB_PATH = os.environ.get(
    "MOTOR_SNAPSHOT_BLOB_PATH", "motor/dashboard-snapshot.json"
)

BLOB_API = "https://blob.vercel-storage.com"
DB_BLOB_PATH = os.environ.get("MOTOR_DB_BLOB_PATH", "motor/historico.db")
API_VERSION = "7"


def _token() -> str:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN não definido")
    return token


def _headers(*, content_type: str | None = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {_token()}",
        "x-api-version": API_VERSION,
    }
    if content_type:
        headers["x-content-type"] = content_type
    return headers


def download_db() -> bool:
    """Baixa historico.db do Blob. Retorna False se o blob ainda não existir."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    url = f"{BLOB_API}/{DB_BLOB_PATH}"
    with httpx.Client(timeout=120.0) as client:
        resp = client.get(url, headers=_headers())
        if resp.status_code == 404:
            print(f"[blob_sync] Blob ausente ({DB_BLOB_PATH}) — iniciando DB vazio")
            return False
        resp.raise_for_status()
        DB_PATH.write_bytes(resp.content)
    print(f"[blob_sync] Download OK → {DB_PATH} ({DB_PATH.stat().st_size} bytes)")
    return True


def upload_db() -> str:
    """Envia historico.db para o Blob. Retorna URL do blob."""
    if not DB_PATH.is_file():
        raise FileNotFoundError(f"SQLite não encontrado: {DB_PATH}")
    url = f"{BLOB_API}/{DB_BLOB_PATH}"
    data = DB_PATH.read_bytes()
    headers = _headers(content_type="application/x-sqlite3")
    headers["x-add-random-suffix"] = "false"
    headers["x-allow-overwrite"] = "true"
    with httpx.Client(timeout=120.0) as client:
        resp = client.put(url, headers=headers, content=data)
        resp.raise_for_status()
        payload = resp.json()
    blob_url = payload.get("url", url)
    print(f"[blob_sync] Upload OK → {blob_url} ({len(data)} bytes)")
    return blob_url


def upload_snapshot() -> str | None:
    """Envia dashboard-snapshot.json para o Blob."""
    if not SNAPSHOT_PATH.is_file():
        print("[blob_sync] Sem dashboard-snapshot.json — rode export_dashboard_snapshot")
        return None
    url = f"{BLOB_API}/{SNAPSHOT_BLOB_PATH}"
    data = SNAPSHOT_PATH.read_bytes()
    headers = _headers(content_type="application/json")
    headers["x-add-random-suffix"] = "false"
    headers["x-allow-overwrite"] = "true"
    with httpx.Client(timeout=60.0) as client:
        resp = client.put(url, headers=headers, content=data)
        resp.raise_for_status()
        payload = resp.json()
    blob_url = payload.get("url", url)
    print(f"[blob_sync] Snapshot → {blob_url}")
    return blob_url


def upload_reports() -> list[str]:
    """Envia relatórios .md de motor/output/ para o Blob."""
    if not OUTPUT_DIR.is_dir():
        print("[blob_sync] Sem pasta output/ — nada a enviar")
        return []
    urls: list[str] = []
    for path in sorted(OUTPUT_DIR.glob("relatorio_*.md")):
        blob_path = f"motor/reports/{path.name}"
        url = f"{BLOB_API}/{blob_path}"
        headers = _headers(content_type="text/markdown")
        headers["x-add-random-suffix"] = "false"
        headers["x-allow-overwrite"] = "true"
        with httpx.Client(timeout=60.0) as client:
            resp = client.put(url, headers=headers, content=path.read_bytes())
            resp.raise_for_status()
            payload = resp.json()
        blob_url = payload.get("url", url)
        urls.append(blob_url)
        print(f"[blob_sync] Relatório → {blob_url}")
    return urls


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincroniza motor com Vercel Blob")
    parser.add_argument(
        "action",
        choices=["download", "upload", "upload-reports", "upload-snapshot", "sync"],
        help="download | upload | upload-reports | upload-snapshot | sync",
    )
    args = parser.parse_args()
    try:
        if args.action == "download":
            download_db()
        elif args.action == "upload":
            upload_db()
            upload_snapshot()
        elif args.action == "upload-reports":
            upload_reports()
        elif args.action == "upload-snapshot":
            upload_snapshot()
        elif args.action == "sync":
            download_db()
            upload_db()
            upload_reports()
            upload_snapshot()
    except httpx.HTTPStatusError as e:
        print(f"[blob_sync] HTTP {e.response.status_code}: {e.response.text[:500]}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[blob_sync] ERRO: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
