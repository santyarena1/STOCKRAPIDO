-- AlterTable
ALTER TABLE "FiscalConfig" ADD COLUMN "invoiceYearAlertEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FiscalConfig" ADD COLUMN "invoiceYearAlertLimit" DECIMAL(65,30);
ALTER TABLE "FiscalConfig" ADD COLUMN "invoiceYearAlertPercent" INTEGER NOT NULL DEFAULT 80;
