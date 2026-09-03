-- Comprobantes de compra recibidos desde ARCA (Mis Comprobantes)
CREATE TABLE "FiscalReceivedInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "voucherType" TEXT NOT NULL,
    "voucherTypeCode" INTEGER,
    "pointOfSale" INTEGER NOT NULL,
    "numberFrom" INTEGER NOT NULL,
    "numberTo" INTEGER NOT NULL,
    "authCode" TEXT,
    "issuerDocType" TEXT,
    "issuerDocNumber" TEXT NOT NULL,
    "issuerName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PES',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "netTaxed" DECIMAL(65,30),
    "netNotTaxed" DECIMAL(65,30),
    "exemptAmount" DECIMAL(65,30),
    "otherTaxes" DECIMAL(65,30),
    "vatAmount" DECIMAL(65,30),
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'imported',
    "verifyResult" JSONB,
    "verifyMessage" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'csv',
    "importBatchId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalReceivedInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalReceivedInvoice_businessId_issuerDocNumber_voucherTypeCode_pointOfSale_numberFrom_key"
  ON "FiscalReceivedInvoice"("businessId", "issuerDocNumber", "voucherTypeCode", "pointOfSale", "numberFrom");

CREATE INDEX "FiscalReceivedInvoice_businessId_issuedAt_idx" ON "FiscalReceivedInvoice"("businessId", "issuedAt");
CREATE INDEX "FiscalReceivedInvoice_businessId_issuerDocNumber_idx" ON "FiscalReceivedInvoice"("businessId", "issuerDocNumber");
CREATE INDEX "FiscalReceivedInvoice_businessId_status_idx" ON "FiscalReceivedInvoice"("businessId", "status");

ALTER TABLE "FiscalReceivedInvoice"
  ADD CONSTRAINT "FiscalReceivedInvoice_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
