from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from qi.config import database_url

_engine = None
_SessionLocal = None


def _engine_url(url: str) -> str:
    """Use psycopg v3 driver when URL is plain postgresql://."""
    if url.startswith("postgresql://") and not url.startswith("postgresql+psycopg://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(
            _engine_url(database_url()),
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=2,
            pool_recycle=120,
            connect_args={
                "keepalives": 1,
                "keepalives_idle": 30,
                "keepalives_interval": 10,
                "keepalives_count": 5,
                "connect_timeout": 10,
            },
        )
    return _engine


def _get_session_local():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=_get_engine(),
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
    return _SessionLocal


@contextmanager
def get_session() -> Generator[Session, None, None]:
    SessionLocal = _get_session_local()
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
