#!/usr/bin/env python3
"""Pre-flight check for QI database tables and minimum columns."""

import os
import sys

from sqlalchemy import create_engine, text
from sqlalchemy.exc import ArgumentError, SQLAlchemyError


GREEN = "\033[32m"
RED = "\033[31m"
RESET = "\033[0m"

TABLE_REQUIREMENTS = {
    "qi_ingestion_job": {"id", "source", "job_name", "status", "started_at", "finished_at"},
    "qi_macro_series_point": {"id", "series_id", "observed_on", "value"},
    "qi_market_price_daily": {"id", "asset_id", "trade_date", "close", "volume"},
    "qi_fundamental_snapshot": {"id", "asset_id", "period_end", "market_cap", "pe_ratio"},
}


def _exists_table(conn, table_name: str) -> bool:
    query = text(
        """
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = :table_name
        )
        """
    )
    return bool(conn.execute(query, {"table_name": table_name}).scalar())


def _table_columns(conn, table_name: str) -> set[str]:
    query = text(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table_name
        """
    )
    rows = conn.execute(query, {"table_name": table_name}).fetchall()
    return {row[0] for row in rows}


def _table_count(conn, table_name: str) -> int:
    query = text(f'SELECT COUNT(*) FROM public."{table_name}"')
    return int(conn.execute(query).scalar() or 0)


def main() -> int:
    print("[CHECK] Validando banco QI...")
    print()

    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if not database_url:
        print(f"{RED}[ERROR]{RESET} DATABASE_URL ausente.")
        return 1

    normalized_url = database_url
    if database_url.startswith("postgresql://"):
        normalized_url = "postgresql+psycopg://" + database_url[len("postgresql://") :]
    elif database_url.startswith("postgres://"):
        normalized_url = "postgresql+psycopg://" + database_url[len("postgres://") :]

    try:
        engine = create_engine(
            normalized_url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 5},
        )
    except ArgumentError as exc:
        print(f"{RED}[ERROR]{RESET} DATABASE_URL invalida: {exc}")
        return 1

    blocking = 0
    try:
        with engine.connect() as conn:
            for table_name, min_columns in TABLE_REQUIREMENTS.items():
                if not _exists_table(conn, table_name):
                    print(f"{RED}[MISSING TABLE]{RESET} {table_name}")
                    blocking += 1
                    continue

                count = _table_count(conn, table_name)
                print(f"{GREEN}[OK]{RESET} {table_name} existe | rows={count}")

                columns = _table_columns(conn, table_name)
                missing_cols = sorted(min_columns - columns)
                if missing_cols:
                    print(
                        f"{RED}[MISSING COLUMN]{RESET} {table_name}: "
                        f"faltando {', '.join(missing_cols)}"
                    )
                    blocking += 1

            if _exists_table(conn, "qi_ingestion_job"):
                columns = _table_columns(conn, "qi_ingestion_job")
                if "status" in columns:
                    print(f"{GREEN}[OK]{RESET} qi_ingestion_job.status presente")
                else:
                    print(f"{RED}[MISSING COLUMN]{RESET} qi_ingestion_job.status ausente")
                    blocking += 1
    except SQLAlchemyError as exc:
        print(f"{RED}[ERROR]{RESET} Falha ao conectar/consultar banco: {exc}")
        return 1
    finally:
        engine.dispose()

    print()
    if blocking == 0:
        print(f"{GREEN}✓ Ambiente pronto{RESET}")
        return 0

    print(f"{RED}✗ {blocking} problema(s) de banco - pipeline bloqueado{RESET}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
