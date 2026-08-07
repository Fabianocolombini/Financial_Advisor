"""Scheduled external/scraper ingest jobs (Wave 2)."""

from __future__ import annotations

import datetime as dt
import json
import logging
from typing import Any, Callable

from motor.src.db.connection import get_connection, init_db
from motor.src.ingestao.cftc_client import ingest_cftc
from motor.src.ingestao.fontes_registry import load_manifest

log = logging.getLogger(__name__)

_INGESTORS: dict[str, Callable[..., dict[str, Any]]] = {}


def _register(name: str, fn: Callable[..., dict[str, Any]]) -> None:
    _INGESTORS[name] = fn


def _safe_import_clients() -> None:
    try:
        from motor.src.ingestao.scrapers.cme_fedwatch_client import ingest as cme_ingest
        _register("cme_fedwatch", cme_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.shiller_client import ingest as shiller_ingest
        _register("shiller", shiller_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.cboe_client import ingest as cboe_ingest
        _register("cboe", cboe_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.aaii_client import ingest as aaii_ingest
        _register("aaii", aaii_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.naaim_client import ingest as naaim_ingest
        _register("naaim", naaim_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.finra_client import ingest as finra_ingest
        _register("finra", finra_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.nareit_client import ingest as nareit_ingest
        _register("nareit", nareit_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.eia_client import ingest as eia_ingest
        _register("eia", eia_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.etf_holdings_client import ingest as etf_ingest
        _register("etf_holdings", etf_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.wgc_client import ingest as wgc_ingest
        _register("wgc", wgc_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.star_capital_client import ingest as star_ingest
        _register("star_capital", star_ingest)
    except ImportError:
        pass
    try:
        from motor.src.ingestao.scrapers.fda_calendar_client import ingest as fda_ingest
        _register("fda_calendar", fda_ingest)
    except ImportError:
        pass


def run_external_jobs(
    frequencies: list[str] | None = None,
    conn=None,
) -> dict[str, Any]:
    """Run scrapers matching manifest frequency (graceful degradation)."""
    _safe_import_clients()
    freqs = set(frequencies or ["daily", "weekly", "monthly"])
    manifest = load_manifest()
    fontes = manifest.get("fontes", {})
    results: dict[str, Any] = {}

    def _run_fonte(name: str, fn: Callable) -> None:
        try:
            out = fn(conn=conn) if conn is not None else fn()
            results[name] = out
        except Exception as e:
            log.warning("external job %s failed: %s", name, e)
            results[name] = {"ok": False, "error": str(e)}

    if "cftc" in fontes and fontes["cftc"].get("enabled"):
        freq = fontes["cftc"].get("frequency", "weekly")
        if freq in freqs:
            _run_fonte("cftc", ingest_cftc)

    for name, cfg in fontes.items():
        if not cfg.get("enabled"):
            continue
        freq = cfg.get("frequency", "daily")
        if freq not in freqs:
            continue
        if name in _INGESTORS:
            _run_fonte(name, _INGESTORS[name])

    from motor.src.calculo.proxy_indicators import ingest_form_d_biotech

    try:
        ingest_form_d_biotech(conn)
        results["edgar_form_d"] = {"ok": True}
    except Exception as e:
        results["edgar_form_d"] = {"ok": False, "error": str(e)}

    return results


def _log_job(conn, fonte: str, status: str, detail: str) -> None:
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO ingestion_log (fonte, started_at, finished_at, status, records, detail)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (fonte, started, started, status, 0, detail),
    )


def run_external_jobs_logged(frequencies: list[str] | None = None) -> dict[str, Any]:
    """Run scrapers and log results. Ensures Fase 2 schema on Blob DB downloads."""
    init_db()
    with get_connection() as conn:
        out = run_external_jobs(frequencies, conn=conn)
        for name, res in out.items():
            ok = bool(res.get("ok")) or bool(res.get("skipped"))
            try:
                _log_job(conn, name, "success" if ok else "degraded", json.dumps(res))
            except Exception as e:
                log.warning("could not log external job %s: %s", name, e)
        conn.commit()
    return out
