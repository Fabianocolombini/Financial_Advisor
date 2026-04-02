"""Run macro, risk, sector, asset engines + allocation for `as_of` (default: today UTC)."""

from __future__ import annotations

import datetime as dt
import os
import traceback

from sqlalchemy import delete

from qi.config import MODEL_VERSION
from qi.db.models import (
    QiAssetScoreSnapshot,
    QiRecommendation,
    QiRegimeSnapshot,
    QiSectorScoreSnapshot,
)
from qi.db.session import get_session
from qi.engines.allocation import run_allocation
from qi.engines.asset_scoring import run_asset_scoring
from qi.engines.macro_regime import run_macro_regime
from qi.engines.risk_regime import run_risk_regime
from qi.engines.sector_rotation import run_sector_rotation


def main() -> None:
    raw = os.environ.get("QI_AS_OF_DATE")
    as_of = dt.date.fromisoformat(raw) if raw else dt.datetime.now(dt.timezone.utc).date()

    with get_session() as session:
        try:
            session.execute(
                delete(QiRegimeSnapshot).where(
                    QiRegimeSnapshot.as_of_date == as_of,
                    QiRegimeSnapshot.model_version == MODEL_VERSION,
                )
            )
            session.execute(
                delete(QiSectorScoreSnapshot).where(
                    QiSectorScoreSnapshot.as_of_date == as_of,
                    QiSectorScoreSnapshot.model_version == MODEL_VERSION,
                )
            )
            session.execute(
                delete(QiAssetScoreSnapshot).where(
                    QiAssetScoreSnapshot.as_of_date == as_of,
                    QiAssetScoreSnapshot.model_version == MODEL_VERSION,
                )
            )
            session.execute(
                delete(QiRecommendation).where(
                    QiRecommendation.valid_from == as_of,
                    QiRecommendation.engine == "allocation",
                    QiRecommendation.model_version == MODEL_VERSION,
                )
            )

            m = run_macro_regime(session, as_of)
            r = run_risk_regime(session, as_of)
            ns = run_sector_rotation(session, as_of)
            na = run_asset_scoring(session, as_of)
            rid = run_allocation(session, as_of)
            print(
                f"as_of={as_of} macro={m} risk={r} sector_rows={ns} asset_rows={na} "
                f"recommendation={rid}"
            )
        except Exception as e:
            print(f"Analysis failed: {e}\n{traceback.format_exc()}")
            raise


if __name__ == "__main__":
    main()
