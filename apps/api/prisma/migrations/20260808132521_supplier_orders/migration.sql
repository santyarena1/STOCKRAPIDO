ALTER TABLE "SupplierAccount" ADD COLUMN "loyaltyPoints" INTEGER;

CREATE TABLE "SupplierOrder" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'harvested',
    "externalOrderId" TEXT,
    "status" TEXT,
    "total" DECIMAL(65,30),
    "deliveryDate" TIMESTAMP(3),
    "tracking" TEXT,
    "placedAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "syncedProductId" TEXT,
    "name" TEXT,
    "uom" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30),
    "total" DECIMAL(65,30),
    CONSTRAINT "SupplierOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierOrder_connectionId_source_idx" ON "SupplierOrder"("connectionId", "source");
CREATE INDEX "SupplierOrderItem_orderId_idx" ON "SupplierOrderItem"("orderId");

ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SyncConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SupplierOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
