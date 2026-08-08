ALTER TABLE "Product"
ADD COLUMN "supplierRef" TEXT,
ADD COLUMN "eanBox" TEXT;

ALTER TABLE "SyncedProduct"
ADD COLUMN "supplierRef" TEXT,
ADD COLUMN "eanUnit" TEXT,
ADD COLUMN "eanBox" TEXT,
ADD COLUMN "ivaAlicuota" DECIMAL(65,30),
ADD COLUMN "unitsPerDisplay" TEXT,
ADD COLUMN "displaysPerBox" TEXT,
ADD COLUMN "retornable" BOOLEAN,
ADD COLUMN "basePrice" DECIMAL(65,30);

CREATE TABLE "SyncedVariant" (
    "id" TEXT NOT NULL,
    "syncedProductId" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "multiplier" INTEGER NOT NULL DEFAULT 1,
    "skuId" TEXT,
    "refId" TEXT,
    "ean" TEXT,
    "listPrice" DECIMAL(65,30),
    "sellingPrice" DECIMAL(65,30),
    "priceWithTax" DECIMAL(65,30),
    "cost" DECIMAL(65,30),
    "stock" INTEGER,
    "taxAlicuota" DECIMAL(65,30),
    "sellerId" TEXT,
    "erpStatus" TEXT,
    CONSTRAINT "SyncedVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyncedVariant_syncedProductId_idx" ON "SyncedVariant"("syncedProductId");

ALTER TABLE "SyncedVariant"
ADD CONSTRAINT "SyncedVariant_syncedProductId_fkey"
FOREIGN KEY ("syncedProductId") REFERENCES "SyncedProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
