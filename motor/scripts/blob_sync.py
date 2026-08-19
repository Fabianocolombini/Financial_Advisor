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


def _find_blob(pathname: str) -> dict | None:
    """Resolve a blob by pathname. Direct GET on blob.vercel-storage.com/{path} 404s."""
    with httpx.Client(timeout=60.0) as client:
        resp = client.get(BLOB_API, headers=_headers(), params={"prefix": pathname})
        resp.raise_for_status()
        for blob in resp.json().get("blobs") or []:
            if blob.get("pathname") == pathname:
                return blob
    return None


def download_db() -> bool:
    """Baixa historico.db do Blob. Retorna False se o blob ainda não existir."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    blob = _find_blob(DB_BLOB_PATH)
    if not blob:
        print(f"[blob_sync] Blob ausente ({DB_BLOB_PATH}) — iniciando DB vazio")
        return False
    url = blob.get("downloadUrl") or blob.get("url")
    if not url:
        print(f"[blob_sync] Blob {DB_BLOB_PATH} sem URL — iniciando DB vazio")
        return False
    with httpx.Client(timeout=180.0, follow_redirects=True) as client:
        resp = client.get(url)
        resp.raise_for_status()
        DB_PATH.write_bytes(resp.content)
    print(f"[blob_sync] Download OK → {DB_PATH} ({DB_PATH.stat().st_size} bytes)")
    return True


def _put_bytes(pathname: str, data: bytes, content_type: str) -> str:
    url = f"{BLOB_API}/{pathname}"
    headers = _headers(content_type=content_type)
    headers["x-add-random-suffix"] = "false"
    headers["x-allow-overwrite"] = "true"
    with httpx.Client(timeout=120.0) as client:
        resp = client.put(url, headers=headers, content=data)
        resp.raise_for_status()
        payload = resp.json()
    return payload.get("url", url)


def _download_blob_bytes(pathname: str) -> bytes | None:
    blob = _find_blob(pathname)
    if not blob:
        return None
    url = blob.get("downloadUrl") or blob.get("url")
    if not url:
        return None
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        resp = client.get(url)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.content


def upload_db() -> str:
    """Envia historico.db para o Blob. Retorna URL do blob."""
    if not DB_PATH.is_file():
        raise FileNotFoundError(f"SQLite não encontrado: {DB_PATH}")
    blob_url = _put_bytes(DB_BLOB_PATH, DB_PATH.read_bytes(), "application/x-sqlite3")
    print(f"[blob_sync] Upload OK → {blob_url} ({DB_PATH.stat().st_size} bytes)")
    return blob_url


PREV_SNAPSHOT_BLOB_PATH = "motor/dashboard-snapshot.prev.json"


def upload_snapshot() -> str | None:
    """Envia o snapshot atual e guarda o anterior para o Homing (day-over-day)."""
    if not SNAPSHOT_PATH.is_file():
        print("[blob_sync] Sem dashboard-snapshot.json — rode export_dashboard_snapshot")
        return None
    new_data = SNAPSHOT_PATH.read_bytes()
    try:
        new_as_of = json.loads(new_data).get("asOf")
    except json.JSONDecodeError:
        new_as_of = None

    old_bytes = _download_blob_bytes(SNAPSHOT_BLOB_PATH)
    if old_bytes:
        try:
            old_as_of = json.loads(old_bytes).get("asOf")
        except json.JSONDecodeError:
            old_as_of = None
        if old_as_of and old_as_of != new_as_of:
            prev_url = _put_bytes(PREV_SNAPSHOT_BLOB_PATH, old_bytes, "application/json")
            dated = _put_bytes(f"motor/snapshots/{old_as_of}.json", old_bytes, "application/json")
            print(f"[blob_sync] Previous snapshot {old_as_of} → {prev_url}")
            print(f"[blob_sync] Archive → {dated}")

    blob_url = _put_bytes(SNAPSHOT_BLOB_PATH, new_data, "application/json")
    if new_as_of:
        dated_new = _put_bytes(f"motor/snapshots/{new_as_of}.json", new_data, "application/json")
        print(f"[blob_sync] Archive today {new_as_of} → {dated_new}")
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
        blob_url = _put_bytes(blob_path, path.read_bytes(), "text/markdown")
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
