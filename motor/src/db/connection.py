"""SQLite connection and schema bootstrap."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from motor.src.paths import DATA_DIR, DB_PATH


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    schema_path = Path(__file__).resolve().parent / "schema.sql"
    sql = schema_path.read_text()
    with get_connection() as conn:
        conn.executescript(sql)
        conn.commit()
