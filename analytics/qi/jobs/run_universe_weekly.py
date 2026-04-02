"""Weekly: rebuild dynamic sector universes (90% relevance mass + hysteresis)."""

from __future__ import annotations

import traceback

from qi.db.session import get_session
from qi.ingest.job_logging import job_finish, job_start
from qi.universe.builder import build_all_sectors


def main() -> None:
    with get_session() as session:
        jid = job_start(session, "POLYGON", "universe_weekly")
        try:
            runs = build_all_sectors(session)
            job_finish(session, jid, True, rows_upserted=len(runs))
            print(f"Universe: {len(runs)} sector runs accepted.")
        except Exception as e:
            job_finish(session, jid, False, error_message=str(e)[:2000])
            print(f"Universe build failed: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
