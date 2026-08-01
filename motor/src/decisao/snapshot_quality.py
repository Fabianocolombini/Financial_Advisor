"""Quality gates before publishing dashboard snapshot to Blob."""

from __future__ import annotations

import datetime as dt
from typing import Any

from motor.src.config.aba_class_map import ABA_TO_CLASS
from motor.src.dates import motor_as_of_date


def check_snapshot_quality(snapshot: dict[str, Any]) -> dict[str, Any]:
    expected = motor_as_of_date()
    issues: list[str] = []
    warnings: list[str] = []

    as_of_raw = snapshot.get("asOf")
    if not as_of_raw:
        issues.append("missing asOf date")
        as_of_date = None
    else:
        as_of_date = dt.date.fromisoformat(str(as_of_raw))
        if as_of_date < expected:
            warnings.append(
                f"asOf {as_of_date.isoformat()} is before expected EOD {expected.isoformat()}"
            )

    classes = snapshot.get("classes") or {}
    tickers = snapshot.get("tickers") or {}

    if not classes:
        issues.append("no class scores in snapshot")

    configured_abas = set(ABA_TO_CLASS.keys())
    missing_abas = configured_abas - {c.get("abaId") for c in classes.values()}
    if missing_abas:
        warnings.append(f"missing class scores for abas: {sorted(missing_abas)}")

    if not tickers:
        warnings.append("no ticker scores in snapshot")

    for cls in classes.values():
        if cls.get("score") is None:
            warnings.append(f"class {cls.get('classId')} missing score")

    stale = bool(as_of_date and as_of_date < expected)

    return {
        "ok": len(issues) == 0,
        "stale": stale,
        "expectedAsOf": expected.isoformat(),
        "issues": issues,
        "warnings": warnings,
        "classCount": len(classes),
        "tickerCount": len(tickers),
    }
