CREATE TABLE "FiscalConfig" (
 "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
 "environment" TEXT NOT NULL DEFAULT 'homologation', "cuit" TEXT NOT NULL, "pointOfSale" INTEGER NOT NULL,
 "legalName" TEXT, "grossIncomeNumber" TEXT, "activityStartDate" TIMESTAMP(3), "address" TEXT,
 "certificateEncrypted" TEXT, "privateKeyEncrypted" TEXT, "certificateExpiresAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FiscalConfig_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FiscalDocument" (
 "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "saleId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "status" TEXT NOT NULL, "pointOfSale" INTEGER, "receiptType" INTEGER, "receiptNumber" INTEGER,
 "cae" TEXT, "caeExpiresAt" TIMESTAMP(3), "qrPayload" TEXT, "errorMessage" TEXT, "arcaResult" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FiscalConfig_businessId_key" ON "FiscalConfig"("businessId");
CREATE UNIQUE INDEX "FiscalDocument_saleId_key" ON "FiscalDocument"("saleId");
CREATE INDEX "FiscalDocument_businessId_createdAt_idx" ON "FiscalDocument"("businessId", "createdAt");
CREATE UNIQUE INDEX "FiscalDocument_businessId_pointOfSale_receiptType_receiptNumber_key" ON "FiscalDocument"("businessId", "pointOfSale", "receiptType", "receiptNumber");
ALTER TABLE "FiscalConfig" ADD CONSTRAINT "FiscalConfig_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;