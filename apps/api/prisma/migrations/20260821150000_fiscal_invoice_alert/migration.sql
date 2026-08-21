-- AlterTable
ALTER TABLE "FiscalConfig" ADD COLUMN "invoiceAlertEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FiscalConfig" ADD COLUMN "invoiceAlertLimit" DECIMAL(65,30);
ALTER TABLE "FiscalConfig" ADD COLUMN "invoiceAlertPercent" INTEGER NOT NULL DEFAULT 80;
ALTER TABLE "FiscalConfig" ADD COLUMN "invoiceAlertPeriod" TEXT NOT NULL DEFAULT 'calendar_month';
