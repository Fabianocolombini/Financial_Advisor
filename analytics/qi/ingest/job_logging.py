"""Persist `qi_ingestion_job` rows for observability."""

from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from qi.db.models import QiIngestionJob
from qi.ids import new_cuid_like


def job_start(session: Session, source: str, job_name: str) -> str:
    jid = new_cuid_like()
    row = QiIngestionJob(
        id=jid,
        source=source,
        job_name=job_name,
        status="RUNNING",
        started_at=dt.datetime.now(dt.timezone.utc),
        cursor=None,
    )
    session.add(row)
    session.flush()
    return jid


def job_finish(
    session: Session,
    job_id: str,
    success: bool,
    *,
    rows_upserted: int | None = None,
    rows_failed: int | None = None,
    error_message: str | None = None,
    cursor: dict[str, Any] | None = None,
) -> None:
    row = session.get(QiIngestionJob, job_id)
    if not row:
        return
    row.status = "SUCCESS" if success else "FAILED"
    row.finished_at = dt.datetime.now(dt.timezone.utc)
    row.rows_upserted = rows_upserted
    row.rows_failed = rows_failed
    row.error_message = error_message
    if cursor is not None:
        row.cursor = cursor


def last_successful_cursor(session: Session, source: str, job_name: str) -> dict[str, Any] | None:
    q = (
        select(QiIngestionJob)
        .where(QiIngestionJob.source == source, QiIngestionJob.job_name == job_name)
        .order_by(QiIngestionJob.created_at.desc())
        .limit(5)
    )
    for row in session.scalars(q):
        if row.status == "SUCCESS" and row.cursor:
            return dict(row.cursor)
    return None
