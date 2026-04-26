"""Run phase-3 analysis engines: regime -> sector rotation -> recommendations."""

from __future__ import annotations

import datetime as dt
import traceback

from sqlalchemy import delete

from qi.analysis.recommendation_engine import generate_recommendations
from qi.analysis.regime_engine import run_regime_engine
from qi.analysis.sector_rotation import run_sector_rotation
from qi.config import MODEL_VERSION
from qi.db.models import QiRecommendation, QiSectorScoreSnapshot
from qi.db.session import get_session
from qi.ingest.job_logging import job_finish, job_start


def main() -> None:
    as_of = dt.datetime.now(dt.timezone.utc).date()
    with get_session() as session:
        # keep run idempotent for the day/model
        session.execute(
            delete(QiSectorScoreSnapshot).where(
                QiSectorScoreSnapshot.as_of_date == as_of,
                QiSectorScoreSnapshot.model_version == MODEL_VERSION,
            )
        )
        session.execute(
            delete(QiRecommendation).where(
                QiRecommendation.valid_from == as_of,
                QiRecommendation.engine == "recommendation_engine",
                QiRecommendation.model_version == MODEL_VERSION,
            )
        )
        session.flush()

        jid_regime = job_start(session, "FRED", "regime_engine")
        try:
            regimes = run_regime_engine(session, regions=["US", "EU", "JP", "EM"], as_of=as_of)
            job_finish(session, jid_regime, True, rows_upserted=len(regimes))
        except Exception as e:
            session.rollback()
            job_finish(session, jid_regime, False, error_message=str(e)[:2000])
            raise RuntimeError(f"regime_engine failed: {e}\n{traceback.format_exc()}") from e

        jid_sector = job_start(session, "YFINANCE", "sector_rotation")
        try:
            rows = run_sector_rotation(session, region="US", as_of=as_of)
            job_finish(session, jid_sector, True, rows_upserted=len(rows))
        except Exception as e:
            session.rollback()
            job_finish(session, jid_sector, False, error_message=str(e)[:2000])
            raise RuntimeError(f"sector_rotation failed: {e}\n{traceback.format_exc()}") from e

        jid_rec = job_start(session, "YFINANCE", "recommendation_engine")
        try:
            recs = generate_recommendations(
                session,
                region="US",
                top_n_sectors=3,
                candidates_per_sector=5,
                as_of=as_of,
            )
            job_finish(session, jid_rec, True, rows_upserted=len(recs))
        except Exception as e:
            session.rollback()
            job_finish(session, jid_rec, False, error_message=str(e)[:2000])
            raise RuntimeError(f"recommendation_engine failed: {e}\n{traceback.format_exc()}") from e

        print(
            f"analysis_daily as_of={as_of} regimes={len(regimes)} "
            f"sector_rows={len(rows)} recommendations={len(recs)}"
        )


if __name__ == "__main__":
    main()

