CREATE TABLE "SyncedPriceHistory" (
    "id" TEXT NOT NULL,
    "syncedProductId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "cost" DECIMAL(65,30),
    "listPrice" DECIMAL(65,30),
    "sellingPrice" DECIMAL(65,30),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncedPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyncedPriceHistory_syncedProductId_capturedAt_idx" ON "SyncedPriceHistory"("syncedProductId", "capturedAt");

ALTER TABLE "SyncedPriceHistory" ADD CONSTRAINT "SyncedPriceHistory_syncedProductId_fkey" FOREIGN KEY ("syncedProductId") REFERENCES "SyncedProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
