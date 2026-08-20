-- Base de comisión configurable: costo o precio de venta
ALTER TABLE "ConsignmentParty" ADD COLUMN IF NOT EXISTS "commissionBase" TEXT NOT NULL DEFAULT 'cost';
