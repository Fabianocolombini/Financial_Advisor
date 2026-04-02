from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parents[2]
_QI_DATA = Path(__file__).resolve().parent / "data"
load_dotenv(_ROOT / ".env.local")
load_dotenv(_ROOT / ".env")


def fred_manifest_path() -> Path:
    """JSON de séries FRED para modo manifest (`QI_FRED_MANIFEST`, default `macro_series.json`)."""
    raw = os.environ.get("QI_FRED_MANIFEST", "macro_series.json").strip() or "macro_series.json"
    p = Path(raw)
    if p.is_absolute():
        return p
    return _QI_DATA / p


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required")
    return url


def polygon_api_key() -> str | None:
    return os.environ.get("POLYGON_API_KEY")


def fred_api_key() -> str | None:
    return os.environ.get("FRED_API_KEY")


def fmp_api_key() -> str | None:
    return os.environ.get("FMP_API_KEY")


def cron_secret() -> str | None:
    return os.environ.get("CRON_SECRET")


MODEL_VERSION = os.environ.get("QI_MODEL_VERSION", "v0.1.0")
