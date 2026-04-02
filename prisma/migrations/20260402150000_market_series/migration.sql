-- CreateEnum
CREATE TYPE "MarketDataProvider" AS ENUM ('YFINANCE', 'FRED');

-- CreateTable
CREATE TABLE "MarketSeries" (
    "id" TEXT NOT NULL,
    "provider" "MarketDataProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "frequency" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketObservation" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(24,8) NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketSeries_provider_idx" ON "MarketSeries"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSeries_provider_externalId_key" ON "MarketSeries"("provider", "externalId");

-- CreateIndex
CREATE INDEX "MarketObservation_seriesId_observedAt_idx" ON "MarketObservation"("seriesId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketObservation_seriesId_observedAt_key" ON "MarketObservation"("seriesId", "observedAt");

-- AddForeignKey
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MarketSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
