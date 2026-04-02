CREATE TYPE "QiAssetType" AS ENUM ('EQUITY', 'ETF', 'INDEX', 'OTHER');

-- CreateEnum
CREATE TYPE "QiPriceSource" AS ENUM ('POLYGON', 'YFINANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "QiMacroProvider" AS ENUM ('FRED');

-- CreateEnum
CREATE TYPE "QiFundamentalStatementType" AS ENUM ('Q', 'A', 'TTM');

-- CreateEnum
CREATE TYPE "QiIngestionJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "QiIngestionSource" AS ENUM ('POLYGON', 'FRED', 'FMP', 'CFTC', 'SEC_EDGAR', 'ALPHA_VANTAGE');

-- CreateEnum
CREATE TYPE "QiIdentifierType" AS ENUM ('POLYGON_TICKER', 'CUSIP', 'ISIN', 'FIGI');

-- CreateEnum
CREATE TYPE "QiRegimeKind" AS ENUM ('MACRO', 'RISK');

CREATE TABLE "qi_asset" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "asset_type" "QiAssetType" NOT NULL,
    "exchange_mic" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "name" TEXT NOT NULL,
    "gics_sector" TEXT,
    "gics_industry" TEXT,
    "cik" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metrics_cache" JSONB,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qi_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_asset_identifier" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "id_type" "QiIdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_asset_identifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_market_price_daily" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "open" DECIMAL(19,6) NOT NULL,
    "high" DECIMAL(19,6) NOT NULL,
    "low" DECIMAL(19,6) NOT NULL,
    "close" DECIMAL(19,6) NOT NULL,
    "volume" BIGINT NOT NULL,
    "adjusted_close" DECIMAL(19,6),
    "source" "QiPriceSource" NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_market_price_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_fx_rate_daily" (
    "id" TEXT NOT NULL,
    "base_ccy" TEXT NOT NULL,
    "quote_ccy" TEXT NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate" DECIMAL(19,8) NOT NULL,
    "source" "QiPriceSource" NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_fx_rate_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_macro_series" (
    "id" TEXT NOT NULL,
    "provider" "QiMacroProvider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT,
    "frequency" TEXT,
    "units" TEXT,
    "seasonal_adjustment" TEXT,
    "last_successful_run_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qi_macro_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_macro_series_point" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "observed_on" DATE NOT NULL,
    "value" DECIMAL(24,8) NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_macro_series_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_fundamental_snapshot" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "period_end" DATE NOT NULL,
    "statement_type" "QiFundamentalStatementType" NOT NULL,
    "market_cap" DECIMAL(22,2),
    "pe_ratio" DECIMAL(19,6),
    "pb_ratio" DECIMAL(19,6),
    "ev_to_ebitda" DECIMAL(19,6),
    "debt_to_equity" DECIMAL(19,6),
    "roe" DECIMAL(19,6),
    "revenue_ttm" DECIMAL(22,2),
    "eps_ttm" DECIMAL(19,6),
    "payload" JSONB,
    "source" TEXT NOT NULL DEFAULT 'fmp',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_fundamental_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_ingestion_job" (
    "id" TEXT NOT NULL,
    "source" "QiIngestionSource" NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" "QiIngestionJobStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "cursor" JSONB,
    "rows_upserted" INTEGER,
    "rows_failed" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_ingestion_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_universe_run" (
    "id" TEXT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_version" TEXT NOT NULL,
    "gics_sector" TEXT NOT NULL,
    "coverage_target" DECIMAL(5,4) NOT NULL,
    "total_relevance_mass" DECIMAL(24,8),
    "metadata" JSONB,
    "is_accepted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "qi_universe_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_universe_member" (
    "id" TEXT NOT NULL,
    "universe_run_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "member_rank" INTEGER NOT NULL,
    "relevance_score" DECIMAL(24,8) NOT NULL,
    "relevance_mass" DECIMAL(24,8) NOT NULL,
    "cumulative_coverage" DECIMAL(7,6) NOT NULL,
    "is_etf" BOOLEAN NOT NULL,
    "inclusion_reason" JSONB,

    CONSTRAINT "qi_universe_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_universe_config" (
    "gics_sector" TEXT NOT NULL,
    "accepted_run_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qi_universe_config_pkey" PRIMARY KEY ("gics_sector")
);

-- CreateTable
CREATE TABLE "qi_sector_score_snapshot" (
    "id" TEXT NOT NULL,
    "sector_code" TEXT NOT NULL,
    "as_of_date" DATE NOT NULL,
    "model_version" TEXT NOT NULL,
    "composite_score" DECIMAL(19,8) NOT NULL,
    "rank" INTEGER NOT NULL,
    "regime_tag" TEXT,
    "components" JSONB,
    "universe_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_sector_score_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_asset_score_snapshot" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "as_of_date" DATE NOT NULL,
    "model_version" TEXT NOT NULL,
    "composite_score" DECIMAL(19,8) NOT NULL,
    "rank" INTEGER,
    "components" JSONB,
    "universe_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_asset_score_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_regime_snapshot" (
    "id" TEXT NOT NULL,
    "kind" "QiRegimeKind" NOT NULL,
    "as_of_date" DATE NOT NULL,
    "model_version" TEXT NOT NULL,
    "regime_label" TEXT NOT NULL,
    "composite_score" DECIMAL(19,8),
    "components" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_regime_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_portfolio" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qi_portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_portfolio_holding" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" DECIMAL(22,8),
    "weight" DECIMAL(9,6),
    "as_of_date" DATE,

    CONSTRAINT "qi_portfolio_holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_portfolio_snapshot" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "total_value_usd" DECIMAL(22,2),
    "weights" JSONB,
    "risk_metrics" JSONB,
    "benchmark_weights" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_portfolio_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_recommendation" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "engine" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "universe_run_id" TEXT,

    CONSTRAINT "qi_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_cot_contract_map" (
    "id" TEXT NOT NULL,
    "cftc_code" TEXT NOT NULL,
    "asset_id" TEXT,
    "gics_sector" TEXT,
    "display_name" TEXT,

    CONSTRAINT "qi_cot_contract_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_cot_snapshot" (
    "id" TEXT NOT NULL,
    "cot_report_date" DATE NOT NULL,
    "cftc_code" TEXT NOT NULL,
    "market_type" TEXT NOT NULL,
    "positions" JSONB NOT NULL,
    "open_interest" DECIMAL(22,2),
    "source" TEXT NOT NULL DEFAULT 'cftc_socrata',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_cot_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_institutional_flow_snapshot" (
    "id" TEXT NOT NULL,
    "filer_cik" TEXT NOT NULL,
    "period_end" DATE NOT NULL,
    "asset_id" TEXT NOT NULL,
    "shares_held" DECIMAL(22,4),
    "value_usd" DECIMAL(22,2),
    "delta_shares" DECIMAL(22,4),
    "delta_value_usd" DECIMAL(22,2),
    "source" TEXT NOT NULL DEFAULT 'sec_edgar',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_institutional_flow_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qi_asset_symbol_key" ON "qi_asset"("symbol");

-- CreateIndex
CREATE INDEX "qi_asset_gics_sector_idx" ON "qi_asset"("gics_sector");

-- CreateIndex
CREATE INDEX "qi_asset_asset_type_idx" ON "qi_asset"("asset_type");

-- CreateIndex
CREATE INDEX "qi_asset_identifier_asset_id_idx" ON "qi_asset_identifier"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "qi_asset_identifier_id_type_value_key" ON "qi_asset_identifier"("id_type", "value");

-- CreateIndex
CREATE INDEX "qi_market_price_daily_trade_date_idx" ON "qi_market_price_daily"("trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "qi_market_price_daily_asset_id_trade_date_source_key" ON "qi_market_price_daily"("asset_id", "trade_date", "source");

-- CreateIndex
CREATE INDEX "qi_fx_rate_daily_rate_date_idx" ON "qi_fx_rate_daily"("rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "qi_fx_rate_daily_base_ccy_quote_ccy_rate_date_source_key" ON "qi_fx_rate_daily"("base_ccy", "quote_ccy", "rate_date", "source");

-- CreateIndex
CREATE INDEX "qi_macro_series_provider_idx" ON "qi_macro_series"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "qi_macro_series_provider_external_id_key" ON "qi_macro_series"("provider", "external_id");

-- CreateIndex
CREATE INDEX "qi_macro_series_point_series_id_observed_on_idx" ON "qi_macro_series_point"("series_id", "observed_on");

-- CreateIndex
CREATE UNIQUE INDEX "qi_macro_series_point_series_id_observed_on_key" ON "qi_macro_series_point"("series_id", "observed_on");

-- CreateIndex
CREATE INDEX "qi_fundamental_snapshot_asset_id_period_end_idx" ON "qi_fundamental_snapshot"("asset_id", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "qi_fundamental_snapshot_asset_id_period_end_statement_type__key" ON "qi_fundamental_snapshot"("asset_id", "period_end", "statement_type", "source");

-- CreateIndex
CREATE INDEX "qi_ingestion_job_source_job_name_created_at_idx" ON "qi_ingestion_job"("source", "job_name", "created_at");

-- CreateIndex
CREATE INDEX "qi_universe_run_gics_sector_run_at_idx" ON "qi_universe_run"("gics_sector", "run_at");

-- CreateIndex
CREATE INDEX "qi_universe_run_is_accepted_gics_sector_idx" ON "qi_universe_run"("is_accepted", "gics_sector");

-- CreateIndex
CREATE INDEX "qi_universe_member_universe_run_id_member_rank_idx" ON "qi_universe_member"("universe_run_id", "member_rank");

-- CreateIndex
CREATE UNIQUE INDEX "qi_universe_member_universe_run_id_asset_id_key" ON "qi_universe_member"("universe_run_id", "asset_id");

-- CreateIndex
CREATE INDEX "qi_sector_score_snapshot_as_of_date_idx" ON "qi_sector_score_snapshot"("as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "qi_sector_score_snapshot_sector_code_as_of_date_model_versi_key" ON "qi_sector_score_snapshot"("sector_code", "as_of_date", "model_version");

-- CreateIndex
CREATE INDEX "qi_asset_score_snapshot_as_of_date_idx" ON "qi_asset_score_snapshot"("as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "qi_asset_score_snapshot_asset_id_as_of_date_model_version_key" ON "qi_asset_score_snapshot"("asset_id", "as_of_date", "model_version");

-- CreateIndex
CREATE INDEX "qi_regime_snapshot_as_of_date_idx" ON "qi_regime_snapshot"("as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "qi_regime_snapshot_kind_as_of_date_model_version_key" ON "qi_regime_snapshot"("kind", "as_of_date", "model_version");

-- CreateIndex
CREATE INDEX "qi_portfolio_holding_portfolio_id_idx" ON "qi_portfolio_holding"("portfolio_id");

-- CreateIndex
CREATE INDEX "qi_portfolio_holding_asset_id_idx" ON "qi_portfolio_holding"("asset_id");

-- CreateIndex
CREATE INDEX "qi_portfolio_snapshot_portfolio_id_snapshot_date_idx" ON "qi_portfolio_snapshot"("portfolio_id", "snapshot_date");

-- CreateIndex
CREATE INDEX "qi_recommendation_portfolio_id_created_at_idx" ON "qi_recommendation"("portfolio_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "qi_cot_contract_map_cftc_code_key" ON "qi_cot_contract_map"("cftc_code");

-- CreateIndex
CREATE INDEX "qi_cot_snapshot_cot_report_date_idx" ON "qi_cot_snapshot"("cot_report_date");

-- CreateIndex
CREATE UNIQUE INDEX "qi_cot_snapshot_cot_report_date_cftc_code_market_type_key" ON "qi_cot_snapshot"("cot_report_date", "cftc_code", "market_type");

-- CreateIndex
CREATE INDEX "qi_institutional_flow_snapshot_asset_id_period_end_idx" ON "qi_institutional_flow_snapshot"("asset_id", "period_end");

-- CreateIndex
CREATE INDEX "qi_institutional_flow_snapshot_filer_cik_period_end_idx" ON "qi_institutional_flow_snapshot"("filer_cik", "period_end");

-- AddForeignKey

ALTER TABLE "qi_asset_identifier" ADD CONSTRAINT "qi_asset_identifier_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_market_price_daily" ADD CONSTRAINT "qi_market_price_daily_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_macro_series_point" ADD CONSTRAINT "qi_macro_series_point_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "qi_macro_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_fundamental_snapshot" ADD CONSTRAINT "qi_fundamental_snapshot_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_universe_member" ADD CONSTRAINT "qi_universe_member_universe_run_id_fkey" FOREIGN KEY ("universe_run_id") REFERENCES "qi_universe_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_universe_member" ADD CONSTRAINT "qi_universe_member_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_universe_config" ADD CONSTRAINT "qi_universe_config_accepted_run_id_fkey" FOREIGN KEY ("accepted_run_id") REFERENCES "qi_universe_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_asset_score_snapshot" ADD CONSTRAINT "qi_asset_score_snapshot_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_portfolio_holding" ADD CONSTRAINT "qi_portfolio_holding_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "qi_portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_portfolio_holding" ADD CONSTRAINT "qi_portfolio_holding_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_portfolio_snapshot" ADD CONSTRAINT "qi_portfolio_snapshot_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "qi_portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_recommendation" ADD CONSTRAINT "qi_recommendation_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "qi_portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_cot_contract_map" ADD CONSTRAINT "qi_cot_contract_map_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_institutional_flow_snapshot" ADD CONSTRAINT "qi_institutional_flow_snapshot_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
