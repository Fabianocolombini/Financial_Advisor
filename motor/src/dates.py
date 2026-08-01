"""Motor dating conventions — scores always reflect previous calendar day close (EOD)."""

from __future__ import annotations

import datetime as dt
import os

AS_OF_CONVENTION = "previous_day_close"


def motor_as_of_date() -> dt.date:
    """
    Reference date for daily motor scores.
    Always the previous calendar day (last available EOD snapshot when the daily job runs).
    Override with MOTOR_AS_OF=YYYY-MM-DD for backfills or tests.
    """
    override = os.environ.get("MOTOR_AS_OF", "").strip()
    if override:
        return dt.date.fromisoformat(override)
    return dt.date.today() - dt.timedelta(days=1)


def motor_snapshot_timestamps(as_of: dt.date) -> dict[str, str]:
    now = dt.datetime.now(dt.timezone.utc)
    return {
        "asOf": as_of.isoformat(),
        "asOfConvention": AS_OF_CONVENTION,
        "updatedAt": now.isoformat().replace("+00:00", "Z"),
    }
