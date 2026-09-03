-- Clave Fiscal + sync automático de facturas recibidas (Mis Comprobantes).
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "portalUsername" TEXT;
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "portalPasswordEncrypted" TEXT;
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "receivedAutoSync" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "receivedLastSyncAt" TIMESTAMP(3);
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "receivedLastSyncError" TEXT;
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "receivedLastSyncCount" INTEGER;
