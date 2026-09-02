-- AlterTable DeliveryIntegration
ALTER TABLE "DeliveryIntegration" ADD COLUMN IF NOT EXISTS "priceMarkupPercent" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryIntegration" ADD COLUMN IF NOT EXISTS "platformCommissionPercent" DECIMAL(65,30) NOT NULL DEFAULT 28;
ALTER TABLE "DeliveryIntegration" ADD COLUMN IF NOT EXISTS "publishMode" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "DeliveryIntegration" ADD COLUMN IF NOT EXISTS "testMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable DeliveryMenuItem
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "platformCategoryId" TEXT;
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "platformCategoryName" TEXT;
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "basePrice" DECIMAL(65,30);
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "markupPercent" DECIMAL(65,30);
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "listPrice" DECIMAL(65,30);
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "priceMode" TEXT NOT NULL DEFAULT 'calculated';
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "syncStatus" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "validationErrors" JSONB;
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "lastPushedAt" TIMESTAMP(3);
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "pausedReason" TEXT;
ALTER TABLE "DeliveryMenuItem" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable DeliveryCategoryRule
CREATE TABLE IF NOT EXISTS "DeliveryCategoryRule" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "platformCategoryId" TEXT,
    "platformCategoryName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryCategoryRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryCategoryRule_integrationId_categoryId_key" ON "DeliveryCategoryRule"("integrationId", "categoryId");
CREATE INDEX IF NOT EXISTS "DeliveryCategoryRule_integrationId_published_idx" ON "DeliveryCategoryRule"("integrationId", "published");

ALTER TABLE "DeliveryCategoryRule" ADD CONSTRAINT "DeliveryCategoryRule_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "DeliveryIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryCategoryRule" ADD CONSTRAINT "DeliveryCategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
