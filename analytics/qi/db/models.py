"""SQLAlchemy models mirroring Prisma `qi_*` tables (PostgreSQL)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# --- PostgreSQL enums (created by Prisma migrations; do not create_type) ---
QiAssetType = ENUM("EQUITY", "ETF", "INDEX", "OTHER", name="QiAssetType", create_type=False)
QiPriceSource = ENUM("POLYGON", "YFINANCE", "OTHER", name="QiPriceSource", create_type=False)
QiMacroProvider = ENUM("FRED", name="QiMacroProvider", create_type=False)
QiFundStmt = ENUM("Q", "A", "TTM", name="QiFundamentalStatementType", create_type=False)
QiJobStatus = ENUM(
    "PENDING", "RUNNING", "SUCCESS", "FAILED", name="QiIngestionJobStatus", create_type=False
)
QiIngestSource = ENUM(
    "POLYGON",
    "FRED",
    "FMP",
    "CFTC",
    "SEC_EDGAR",
    "ALPHA_VANTAGE",
    name="QiIngestionSource",
    create_type=False,
)
QiIdType = ENUM(
    "POLYGON_TICKER", "CUSIP", "ISIN", "FIGI", name="QiIdentifierType", create_type=False
)
QiRegimeKind = ENUM("MACRO", "RISK", name="QiRegimeKind", create_type=False)


class Base(DeclarativeBase):
    pass


class QiAsset(Base):
    __tablename__ = "qi_asset"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    symbol: Mapped[str] = mapped_column(String, unique=True)
    asset_type: Mapped[str] = mapped_column(QiAssetType)
    exchange_mic: Mapped[Optional[str]] = mapped_column("exchange_mic", String)
    currency: Mapped[str] = mapped_column(String, server_default=text("'USD'"))
    name: Mapped[str] = mapped_column(String)
    gics_sector: Mapped[Optional[str]] = mapped_column("gics_sector", String)
    gics_industry: Mapped[Optional[str]] = mapped_column("gics_industry", String)
    cik: Mapped[Optional[str]] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, server_default=text("true"))
    metrics_cache: Mapped[Optional[Dict[str, Any]]] = mapped_column("metrics_cache", JSONB)
    first_seen_at: Mapped[dt.datetime] = mapped_column(
        "first_seen_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        "updated_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiMarketPriceDaily(Base):
    __tablename__ = "qi_market_price_daily"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    asset_id: Mapped[str] = mapped_column(
        String, ForeignKey("qi_asset.id", ondelete="CASCADE")
    )
    trade_date: Mapped[dt.date] = mapped_column("trade_date", Date)
    open: Mapped[Decimal] = mapped_column(Numeric(19, 6))
    high: Mapped[Decimal] = mapped_column(Numeric(19, 6))
    low: Mapped[Decimal] = mapped_column(Numeric(19, 6))
    close: Mapped[Decimal] = mapped_column(Numeric(19, 6))
    volume: Mapped[int] = mapped_column(BigInteger)
    adjusted_close: Mapped[Optional[Decimal]] = mapped_column(
        "adjusted_close", Numeric(19, 6)
    )
    source: Mapped[str] = mapped_column(QiPriceSource)
    ingested_at: Mapped[dt.datetime] = mapped_column(
        "ingested_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiFxRateDaily(Base):
    __tablename__ = "qi_fx_rate_daily"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    base_ccy: Mapped[str] = mapped_column("base_ccy", String)
    quote_ccy: Mapped[str] = mapped_column("quote_ccy", String)
    rate_date: Mapped[dt.date] = mapped_column("rate_date", Date)
    rate: Mapped[Decimal] = mapped_column(Numeric(19, 8))
    source: Mapped[str] = mapped_column(QiPriceSource)
    ingested_at: Mapped[dt.datetime] = mapped_column(
        "ingested_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiMacroSeries(Base):
    __tablename__ = "qi_macro_series"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(QiMacroProvider)
    external_id: Mapped[str] = mapped_column("external_id", String)
    title: Mapped[Optional[str]] = mapped_column(String)
    frequency: Mapped[Optional[str]] = mapped_column(String)
    units: Mapped[Optional[str]] = mapped_column(String)
    seasonal_adjustment: Mapped[Optional[str]] = mapped_column("seasonal_adjustment", String)
    last_successful_run_at: Mapped[Optional[dt.datetime]] = mapped_column(
        "last_successful_run_at", DateTime(timezone=True)
    )
    metadata_: Mapped[Optional[Dict[str, Any]]] = mapped_column("metadata", JSONB)
    created_at: Mapped[dt.datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        "updated_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiMacroSeriesPoint(Base):
    __tablename__ = "qi_macro_series_point"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    series_id: Mapped[str] = mapped_column(
        String, ForeignKey("qi_macro_series.id", ondelete="CASCADE")
    )
    observed_on: Mapped[dt.date] = mapped_column("observed_on", Date)
    value: Mapped[Decimal] = mapped_column(Numeric(24, 8))
    raw: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    created_at: Mapped[dt.datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiFundamentalSnapshot(Base):
    __tablename__ = "qi_fundamental_snapshot"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    asset_id: Mapped[str] = mapped_column(
        String, ForeignKey("qi_asset.id", ondelete="CASCADE")
    )
    period_end: Mapped[dt.date] = mapped_column("period_end", Date)
    statement_type: Mapped[str] = mapped_column(QiFundStmt)
    market_cap: Mapped[Optional[Decimal]] = mapped_column("market_cap", Numeric(22, 2))
    pe_ratio: Mapped[Optional[Decimal]] = mapped_column("pe_ratio", Numeric(19, 6))
    pb_ratio: Mapped[Optional[Decimal]] = mapped_column("pb_ratio", Numeric(19, 6))
    ev_to_ebitda: Mapped[Optional[Decimal]] = mapped_column("ev_to_ebitda", Numeric(19, 6))
    debt_to_equity: Mapped[Optional[Decimal]] = mapped_column("debt_to_equity", Numeric(19, 6))
    roe: Mapped[Optional[Decimal]] = mapped_column(Numeric(19, 6))
    revenue_ttm: Mapped[Optional[Decimal]] = mapped_column("revenue_ttm", Numeric(22, 2))
    eps_ttm: Mapped[Optional[Decimal]] = mapped_column("eps_ttm", Numeric(19, 6))
    payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    source: Mapped[str] = mapped_column(String, server_default=text("'fmp'"))
    fetched_at: Mapped[dt.datetime] = mapped_column(
        "fetched_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiIngestionJob(Base):
    __tablename__ = "qi_ingestion_job"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source: Mapped[str] = mapped_column(QiIngestSource)
    job_name: Mapped[str] = mapped_column("job_name", String)
    status: Mapped[str] = mapped_column(QiJobStatus, server_default=text("'PENDING'"))
    started_at: Mapped[Optional[dt.datetime]] = mapped_column("started_at", DateTime(timezone=True))
    finished_at: Mapped[Optional[dt.datetime]] = mapped_column(
        "finished_at", DateTime(timezone=True)
    )
    cursor: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    rows_upserted: Mapped[Optional[int]] = mapped_column("rows_upserted")
    rows_failed: Mapped[Optional[int]] = mapped_column("rows_failed")
    error_message: Mapped[Optional[str]] = mapped_column("error_message", Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiUniverseRun(Base):
    __tablename__ = "qi_universe_run"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    run_at: Mapped[dt.datetime] = mapped_column(
        "run_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )
    model_version: Mapped[str] = mapped_column("model_version", String)
    gics_sector: Mapped[str] = mapped_column("gics_sector", String)
    coverage_target: Mapped[Decimal] = mapped_column("coverage_target", Numeric(5, 4))
    total_relevance_mass: Mapped[Optional[Decimal]] = mapped_column(
        "total_relevance_mass", Numeric(24, 8)
    )
    metadata_: Mapped[Optional[Dict[str, Any]]] = mapped_column("metadata", JSONB)
    is_accepted: Mapped[bool] = mapped_column(
        "is_accepted", Boolean, server_default=text("false")
    )
class QiUniverseMember(Base):
    __tablename__ = "qi_universe_member"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    universe_run_id: Mapped[str] = mapped_column(
        String, ForeignKey("qi_universe_run.id", ondelete="CASCADE")
    )
    asset_id: Mapped[str] = mapped_column(String, ForeignKey("qi_asset.id", ondelete="CASCADE"))
    member_rank: Mapped[int] = mapped_column("member_rank")
    relevance_score: Mapped[Decimal] = mapped_column("relevance_score", Numeric(24, 8))
    relevance_mass: Mapped[Decimal] = mapped_column("relevance_mass", Numeric(24, 8))
    cumulative_coverage: Mapped[Decimal] = mapped_column(
        "cumulative_coverage", Numeric(7, 6)
    )
    is_etf: Mapped[bool] = mapped_column("is_etf", Boolean)
    inclusion_reason: Mapped[Optional[Dict[str, Any]]] = mapped_column("inclusion_reason", JSONB)
class QiUniverseConfig(Base):
    __tablename__ = "qi_universe_config"

    gics_sector: Mapped[str] = mapped_column("gics_sector", String, primary_key=True)
    accepted_run_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("qi_universe_run.id", ondelete="SET NULL")
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        "updated_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiSectorScoreSnapshot(Base):
    __tablename__ = "qi_sector_score_snapshot"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sector_code: Mapped[str] = mapped_column("sector_code", String)
    as_of_date: Mapped[dt.date] = mapped_column("as_of_date", Date)
    model_version: Mapped[str] = mapped_column("model_version", String)
    composite_score: Mapped[Decimal] = mapped_column("composite_score", Numeric(19, 8))
    sector_rank: Mapped[int] = mapped_column("rank", Integer)
    regime_tag: Mapped[Optional[str]] = mapped_column("regime_tag", String)
    components: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    universe_run_id: Mapped[Optional[str]] = mapped_column("universe_run_id", String)
    created_at: Mapped[dt.datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiAssetScoreSnapshot(Base):
    __tablename__ = "qi_asset_score_snapshot"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    asset_id: Mapped[str] = mapped_column(
        String, ForeignKey("qi_asset.id", ondelete="CASCADE")
    )
    as_of_date: Mapped[dt.date] = mapped_column("as_of_date", Date)
    model_version: Mapped[str] = mapped_column("model_version", String)
    composite_score: Mapped[Decimal] = mapped_column("composite_score", Numeric(19, 8))
    asset_rank: Mapped[Optional[int]] = mapped_column("rank", Integer)
    components: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    universe_run_id: Mapped[Optional[str]] = mapped_column("universe_run_id", String)
    created_at: Mapped[dt.datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiRegimeSnapshot(Base):
    __tablename__ = "qi_regime_snapshot"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str] = mapped_column(QiRegimeKind)
    as_of_date: Mapped[dt.date] = mapped_column("as_of_date", Date)
    model_version: Mapped[str] = mapped_column("model_version", String)
    regime_label: Mapped[str] = mapped_column("regime_label", String)
    composite_score: Mapped[Optional[Decimal]] = mapped_column("composite_score", Numeric(19, 8))
    components: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    created_at: Mapped[dt.datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiPortfolio(Base):
    __tablename__ = "qi_portfolio"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[Optional[str]] = mapped_column("user_id", String)
    name: Mapped[str] = mapped_column(String)
    base_currency: Mapped[str] = mapped_column(
        "base_currency", String, server_default=text("'USD'")
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        "updated_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiPortfolioSnapshot(Base):
    __tablename__ = "qi_portfolio_snapshot"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    portfolio_id: Mapped[str] = mapped_column(
        String, ForeignKey("qi_portfolio.id", ondelete="CASCADE")
    )
    snapshot_date: Mapped[dt.date] = mapped_column("snapshot_date", Date)
    total_value_usd: Mapped[Optional[Decimal]] = mapped_column("total_value_usd", Numeric(22, 2))
    weights: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    risk_metrics: Mapped[Optional[Dict[str, Any]]] = mapped_column("risk_metrics", JSONB)
    benchmark_weights: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        "benchmark_weights", JSONB
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiRecommendation(Base):
    __tablename__ = "qi_recommendation"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    portfolio_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("qi_portfolio.id", ondelete="SET NULL")
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )
    valid_from: Mapped[dt.date] = mapped_column("valid_from", Date)
    valid_until: Mapped[Optional[dt.date]] = mapped_column("valid_until", Date)
    engine: Mapped[str] = mapped_column(String)
    model_version: Mapped[str] = mapped_column("model_version", String)
    status: Mapped[str] = mapped_column(String, server_default=text("'draft'"))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    universe_run_id: Mapped[Optional[str]] = mapped_column("universe_run_id", String)


class QiCotContractMap(Base):
    __tablename__ = "qi_cot_contract_map"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    cftc_code: Mapped[str] = mapped_column("cftc_code", String, unique=True)
    asset_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("qi_asset.id", ondelete="SET NULL")
    )
    gics_sector: Mapped[Optional[str]] = mapped_column("gics_sector", String)
    display_name: Mapped[Optional[str]] = mapped_column("display_name", String)


class QiCotSnapshot(Base):
    __tablename__ = "qi_cot_snapshot"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    cot_report_date: Mapped[dt.date] = mapped_column("cot_report_date", Date)
    cftc_code: Mapped[str] = mapped_column("cftc_code", String)
    market_type: Mapped[str] = mapped_column("market_type", String)
    positions: Mapped[dict[str, Any]] = mapped_column(JSONB)
    open_interest: Mapped[Optional[Decimal]] = mapped_column("open_interest", Numeric(22, 2))
    source: Mapped[str] = mapped_column(String, server_default=text("'cftc_socrata'"))
    fetched_at: Mapped[dt.datetime] = mapped_column(
        "fetched_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class QiInstitutionalFlowSnapshot(Base):
    __tablename__ = "qi_institutional_flow_snapshot"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    filer_cik: Mapped[str] = mapped_column("filer_cik", String)
    period_end: Mapped[dt.date] = mapped_column("period_end", Date)
    asset_id: Mapped[str] = mapped_column(
        String, ForeignKey("qi_asset.id", ondelete="CASCADE")
    )
    shares_held: Mapped[Optional[Decimal]] = mapped_column("shares_held", Numeric(22, 4))
    value_usd: Mapped[Optional[Decimal]] = mapped_column("value_usd", Numeric(22, 2))
    delta_shares: Mapped[Optional[Decimal]] = mapped_column("delta_shares", Numeric(22, 4))
    delta_value_usd: Mapped[Optional[Decimal]] = mapped_column("delta_value_usd", Numeric(22, 2))
    source: Mapped[str] = mapped_column(String, server_default=text("'sec_edgar'"))
    fetched_at: Mapped[dt.datetime] = mapped_column(
        "fetched_at", DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )
