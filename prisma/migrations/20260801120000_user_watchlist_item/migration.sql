-- CreateTable
CREATE TABLE "user_watchlist_item" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "kind" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_watchlist_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_watchlist_item_user_id_idx" ON "user_watchlist_item"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_watchlist_item_user_id_symbol_key" ON "user_watchlist_item"("user_id", "symbol");

-- AddForeignKey
ALTER TABLE "user_watchlist_item" ADD CONSTRAINT "user_watchlist_item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
