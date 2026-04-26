"""
QI Python scheduler — host dedicado (Railway / Fly.io / VM).

Agenda (UTC):
  - run_ingest_daily → 11:30 (após cron TS `qi-macro` às 11:15)
  - run_universe_weekly → domingo 12:00
  - run_analysis_daily → 12:30 (após ingest diário)
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from qi.jobs.run_analysis_daily import main as run_analysis_daily
from qi.jobs.run_ingest_daily import main as run_ingest
from qi.jobs.run_universe_weekly import main as run_universe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

scheduler = BlockingScheduler(timezone="UTC")

scheduler.add_job(
    run_ingest,
    CronTrigger(hour=11, minute=30),
    id="run_ingest_daily",
    name="QI Ingest Daily (Polygon + FMP)",
    misfire_grace_time=300,
)

scheduler.add_job(
    run_universe,
    CronTrigger(day_of_week="sun", hour=12, minute=0),
    id="run_universe_weekly",
    name="QI Universe Weekly",
    misfire_grace_time=600,
)

scheduler.add_job(
    run_analysis_daily,
    CronTrigger(hour=12, minute=30),
    id="run_analysis_daily",
    name="QI Run Analysis Daily (Regime + Sectors + Recommendations)",
    misfire_grace_time=300,
)

if __name__ == "__main__":
    logger.info(
        "QI Scheduler iniciado. Jobs registados: %s",
        [j.id for j in scheduler.get_jobs()],
    )
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("QI Scheduler terminado.")
