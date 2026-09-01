-- AlterTable
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "onboarding" JSONB;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "branchLabel" TEXT;

-- AlterTable Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publishToCatalog" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sourcePublicProductId" TEXT;

-- CreateTable Organization
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable PublicProduct
CREATE TABLE IF NOT EXISTS "PublicProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "barcode" TEXT,
    "imageUrl" TEXT,
    "unitsPerBox" TEXT,
    "weight" TEXT,
    "format" TEXT,
    "flavor" TEXT,
    "presentation" TEXT,
    "subcategory" TEXT,
    "keywords" TEXT,
    "publishedByBusinessId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable CatalogImportLog
CREATE TABLE IF NOT EXISTS "CatalogImportLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "publicProductId" TEXT NOT NULL,
    "localProductId" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PublicProduct_barcode_idx" ON "PublicProduct"("barcode");
CREATE INDEX IF NOT EXISTS "PublicProduct_name_idx" ON "PublicProduct"("name");
CREATE INDEX IF NOT EXISTS "PublicProduct_publishedByBusinessId_idx" ON "PublicProduct"("publishedByBusinessId");
CREATE INDEX IF NOT EXISTS "PublicProduct_status_createdAt_idx" ON "PublicProduct"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "CatalogImportLog_businessId_importedAt_idx" ON "CatalogImportLog"("businessId", "importedAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Business" ADD CONSTRAINT "Business_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PublicProduct" ADD CONSTRAINT "PublicProduct_publishedByBusinessId_fkey" FOREIGN KEY ("publishedByBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CatalogImportLog" ADD CONSTRAINT "CatalogImportLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
