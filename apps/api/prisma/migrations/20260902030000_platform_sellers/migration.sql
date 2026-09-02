-- Vendedores comerciales de StockRápido: código, comisión y cuenta corriente.

CREATE TABLE "PlatformSeller" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "commissionType" TEXT NOT NULL DEFAULT 'percent',
    "commissionValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSeller_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSeller_code_key" ON "PlatformSeller"("code");

CREATE TABLE "PlatformSellerAttribution" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSellerAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSellerAttribution_businessId_key" ON "PlatformSellerAttribution"("businessId");
CREATE INDEX "PlatformSellerAttribution_sellerId_createdAt_idx" ON "PlatformSellerAttribution"("sellerId", "createdAt");

CREATE TABLE "PlatformSellerLedgerEntry" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "businessId" TEXT,
    "invoiceId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "PlatformSellerLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSellerLedgerEntry_invoiceId_key" ON "PlatformSellerLedgerEntry"("invoiceId");
CREATE INDEX "PlatformSellerLedgerEntry_sellerId_periodYear_periodMonth_idx" ON "PlatformSellerLedgerEntry"("sellerId", "periodYear", "periodMonth");
CREATE INDEX "PlatformSellerLedgerEntry_sellerId_createdAt_idx" ON "PlatformSellerLedgerEntry"("sellerId", "createdAt");

ALTER TABLE "PlatformSellerAttribution" ADD CONSTRAINT "PlatformSellerAttribution_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "PlatformSeller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformSellerAttribution" ADD CONSTRAINT "PlatformSellerAttribution_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformSellerLedgerEntry" ADD CONSTRAINT "PlatformSellerLedgerEntry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "PlatformSeller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
