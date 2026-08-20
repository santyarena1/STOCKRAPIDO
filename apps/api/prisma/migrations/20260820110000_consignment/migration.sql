-- Productos comisionados (consignación)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "consigned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "consignmentPartyId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "consignmentCommissionPercent" DECIMAL(65,30);

CREATE TABLE IF NOT EXISTS "ConsignmentParty" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "defaultCommissionPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentParty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConsignmentLedgerEntry" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "productId" TEXT,
  "saleId" TEXT,
  "saleItemId" TEXT,
  "qty" INTEGER NOT NULL,
  "unitCost" DECIMAL(65,30) NOT NULL,
  "commissionPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount" DECIMAL(65,30) NOT NULL,
  "note" TEXT,
  "voided" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConsignmentPayment" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Product_businessId_consigned_idx" ON "Product"("businessId", "consigned");
CREATE INDEX IF NOT EXISTS "Product_consignmentPartyId_idx" ON "Product"("consignmentPartyId");
CREATE INDEX IF NOT EXISTS "ConsignmentParty_businessId_active_idx" ON "ConsignmentParty"("businessId", "active");
CREATE INDEX IF NOT EXISTS "ConsignmentLedgerEntry_businessId_partyId_createdAt_idx" ON "ConsignmentLedgerEntry"("businessId", "partyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConsignmentLedgerEntry_saleId_idx" ON "ConsignmentLedgerEntry"("saleId");
CREATE INDEX IF NOT EXISTS "ConsignmentPayment_businessId_partyId_createdAt_idx" ON "ConsignmentPayment"("businessId", "partyId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ConsignmentParty" ADD CONSTRAINT "ConsignmentParty_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_consignmentPartyId_fkey"
    FOREIGN KEY ("consignmentPartyId") REFERENCES "ConsignmentParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConsignmentLedgerEntry" ADD CONSTRAINT "ConsignmentLedgerEntry_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConsignmentLedgerEntry" ADD CONSTRAINT "ConsignmentLedgerEntry_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "ConsignmentParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConsignmentLedgerEntry" ADD CONSTRAINT "ConsignmentLedgerEntry_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConsignmentPayment" ADD CONSTRAINT "ConsignmentPayment_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConsignmentPayment" ADD CONSTRAINT "ConsignmentPayment_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "ConsignmentParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
