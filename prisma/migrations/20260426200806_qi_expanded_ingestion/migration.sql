-- AlterEnum
ALTER TYPE "QiAssetType" ADD VALUE 'COMMODITY';

-- CreateTable
CREATE TABLE "qi_insider_transaction" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "filed_at" TIMESTAMP(3) NOT NULL,
    "transaction_date" DATE NOT NULL,
    "insider_name" TEXT NOT NULL,
    "insider_title" TEXT,
    "transaction_type" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "price_per_share" DOUBLE PRECISION,
    "value_total" DOUBLE PRECISION,
    "ownership_type" TEXT NOT NULL,
    "form_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_insider_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_institutional_holding" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "filer_cik" TEXT NOT NULL,
    "filer_name" TEXT NOT NULL,
    "period_of_report" DATE NOT NULL,
    "shares_held" DOUBLE PRECISION NOT NULL,
    "value_usd" DOUBLE PRECISION NOT NULL,
    "change_in_shares" DOUBLE PRECISION,
    "change_pct" DOUBLE PRECISION,
    "filed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_institutional_holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qi_cot_position" (
    "id" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "commercial_long" INTEGER NOT NULL,
    "commercial_short" INTEGER NOT NULL,
    "noncommercial_long" INTEGER NOT NULL,
    "noncommercial_short" INTEGER NOT NULL,
    "net_speculative" INTEGER NOT NULL,
    "net_speculative_pct" DOUBLE PRECISION,
    "open_interest" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qi_cot_position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qi_insider_transaction_asset_id_filed_at_idx" ON "qi_insider_transaction"("asset_id", "filed_at");

-- CreateIndex
CREATE UNIQUE INDEX "qi_insider_transaction_symbol_filed_at_insider_name_transac_key" ON "qi_insider_transaction"("symbol", "filed_at", "insider_name", "transaction_type", "shares");

-- CreateIndex
CREATE INDEX "qi_institutional_holding_filer_cik_period_of_report_idx" ON "qi_institutional_holding"("filer_cik", "period_of_report");

-- CreateIndex
CREATE UNIQUE INDEX "qi_institutional_holding_symbol_filer_cik_period_of_report_key" ON "qi_institutional_holding"("symbol", "filer_cik", "period_of_report");

-- CreateIndex
CREATE INDEX "qi_cot_position_report_date_idx" ON "qi_cot_position"("report_date");

-- CreateIndex
CREATE UNIQUE INDEX "qi_cot_position_commodity_report_date_key" ON "qi_cot_position"("commodity", "report_date");

-- AddForeignKey
ALTER TABLE "qi_insider_transaction" ADD CONSTRAINT "qi_insider_transaction_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qi_institutional_holding" ADD CONSTRAINT "qi_institutional_holding_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "qi_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
