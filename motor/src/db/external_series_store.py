"""Read/write external_series table (scrapers, CFTC, etc.)."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from motor.src.db.connection import get_connection


def upsert_point(
    source: str,
    series_id: str,
    data: str | dt.date,
    valor: float | None,
    meta: dict[str, Any] | None = None,
    conn=None,
) -> None:
    d = data.isoformat() if isinstance(data, dt.date) else str(data)
    meta_json = json.dumps(meta or {}, ensure_ascii=False) if meta else None
    sql = """
        INSERT OR REPLACE INTO external_series (source, series_id, data, valor, meta_json)
        VALUES (?, ?, ?, ?, ?)
    """
    if conn is not None:
        conn.execute(sql, (source, series_id, d, valor, meta_json))
        return
    with get_connection() as c:
        c.execute(sql, (source, series_id, d, valor, meta_json))
        c.commit()


def get_series(source: str, series_id: str) -> list[tuple[str, float]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT data, valor FROM external_series
            WHERE source = ? AND series_id = ? AND valor IS NOT NULL
            ORDER BY data
            """,
            (source, series_id),
        ).fetchall()
    return [(r["data"], float(r["valor"])) for r in rows]


def latest_value(source: str, series_id: str) -> tuple[str, float] | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT data, valor FROM external_series
            WHERE source = ? AND series_id = ?
            ORDER BY data DESC LIMIT 1
            """,
            (source, series_id),
        ).fetchone()
    if not row or row["valor"] is None:
        return None
    return str(row["data"]), float(row["valor"])
