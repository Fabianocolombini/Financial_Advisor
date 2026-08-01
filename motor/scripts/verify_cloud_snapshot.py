#!/usr/bin/env python3
"""Verify motor/dashboard-snapshot.json exists on Vercel Blob (production check)."""

from __future__ import annotations

import json
import os
import sys

import httpx

BLOB_API = "https://blob.vercel-storage.com"
SNAPSHOT_PATH = os.environ.get("MOTOR_SNAPSHOT_BLOB_PATH", "motor/dashboard-snapshot.json")
API_VERSION = "7"


def main() -> None:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip()
    if not token:
        print("[verify_cloud_snapshot] SKIP: BLOB_READ_WRITE_TOKEN not set", file=sys.stderr)
        print(
            "[verify_cloud_snapshot] Manual: GitHub Actions → Motor Daily → check upload logs",
        )
        sys.exit(0)

    url = f"{BLOB_API}/{SNAPSHOT_PATH}"
    headers = {
        "Authorization": f"Bearer {token}",
        "x-api-version": API_VERSION,
    }
    with httpx.Client(timeout=60.0) as client:
        resp = client.get(url, headers=headers)
        if resp.status_code == 404:
            print(f"[verify_cloud_snapshot] FAIL: blob missing at {SNAPSHOT_PATH}", file=sys.stderr)
            sys.exit(1)
        resp.raise_for_status()
        snap = resp.json()

    as_of = snap.get("asOf")
    updated = snap.get("updatedAt")
    classes = len(snap.get("classes", {}))
    tickers = len(snap.get("tickers", {}))
    quality = snap.get("quality", {})

    print(f"[verify_cloud_snapshot] OK asOf={as_of} updatedAt={updated}")
    print(f"[verify_cloud_snapshot] classes={classes} tickers={tickers}")
    if quality:
        print(f"[verify_cloud_snapshot] quality ok={quality.get('ok')} stale={quality.get('stale')}")
    if not snap.get("entryValidated") and tickers:
        sample = next(iter(snap["tickers"].values()))
        if "entryValidated" in sample:
            print("[verify_cloud_snapshot] entryValidated field present on tickers")


if __name__ == "__main__":
    try:
        main()
    except httpx.HTTPStatusError as e:
        print(f"[verify_cloud_snapshot] HTTP {e.response.status_code}", file=sys.stderr)
        sys.exit(1)
