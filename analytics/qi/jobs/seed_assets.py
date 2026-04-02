"""Seed `qi_asset` from bundled CSV if table is empty (or force). Idempotent upsert by symbol."""

from __future__ import annotations

import csv
import datetime as dt
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from qi.db.models import QiAsset
from qi.ids import new_cuid_like

_DATA = Path(__file__).resolve().parents[1] / "data" / "seed_assets.csv"


def seed_assets_if_empty(session: Session, *, force: bool = False) -> int:
    n = session.scalar(select(func.count()).select_from(QiAsset))
    if n and not force:
        return 0
    if not _DATA.is_file():
        return 0
    n_written = 0
    now = dt.datetime.now(dt.timezone.utc)
    t = QiAsset.__table__
    with _DATA.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sym = row["symbol"].strip().upper()
            atype = row["asset_type"].strip().upper()
            name = row["name"].strip()
            sector = (row.get("gics_sector") or "").strip() or None
            ins = pg_insert(t).values(
                id=new_cuid_like(),
                symbol=sym,
                asset_type=atype,
                exchange_mic=None,
                currency="USD",
                name=name,
                gics_sector=sector,
                gics_industry=None,
                cik=None,
                is_active=True,
                metrics_cache=None,
                first_seen_at=now,
                updated_at=now,
            )
            stmt = ins.on_conflict_do_update(
                index_elements=[t.c.symbol],
                set_={
                    "name": ins.excluded.name,
                    "asset_type": ins.excluded.asset_type,
                    "gics_sector": ins.excluded.gics_sector,
                    "updated_at": ins.excluded.updated_at,
                },
            )
            session.execute(stmt)
            n_written += 1
    session.flush()
    return n_written
