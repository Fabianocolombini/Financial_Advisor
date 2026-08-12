-- CreateTable
CREATE TABLE "wallet_holding" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "kind" TEXT,
    "quantity" DECIMAL(19,6) NOT NULL,
    "cost_price" DECIMAL(19,6) NOT NULL,
    "purchased_at" TIMESTAMP(3) NOT NULL,
    "target_min" DECIMAL(19,6),
    "target_max" DECIMAL(19,6),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_alert" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_holding_user_id_idx" ON "wallet_holding"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_holding_user_id_symbol_key" ON "wallet_holding"("user_id", "symbol");

-- CreateIndex
CREATE INDEX "wallet_alert_user_id_created_at_idx" ON "wallet_alert"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "wallet_holding" ADD CONSTRAINT "wallet_holding_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_alert" ADD CONSTRAINT "wallet_alert_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
