"""Paths and env helpers for motor package."""

from __future__ import annotations

import os
from pathlib import Path

MOTOR_ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = MOTOR_ROOT / "config"
ABAS_DIR = CONFIG_DIR / "abas"
DATA_DIR = MOTOR_ROOT / "data"
OUTPUT_DIR = MOTOR_ROOT / "output"
DB_PATH = DATA_DIR / "historico.db"
REPO_ROOT = MOTOR_ROOT.parent


def load_env_from_repo() -> None:
    """Load FRED_API_KEY from repo .env.local if not set."""
    if os.environ.get("FRED_API_KEY"):
        return
    env_local = REPO_ROOT / ".env.local"
    if not env_local.is_file():
        return
    for line in env_local.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and val and key not in os.environ:
            os.environ[key] = val


def fred_api_key() -> str:
    load_env_from_repo()
    key = os.environ.get("FRED_API_KEY", "").strip()
    if not key:
        raise RuntimeError("FRED_API_KEY não definida (.env.local ou ambiente)")
    return key


def aba_config_path(aba_id: str) -> Path:
    return ABAS_DIR / f"{aba_id}.json"
