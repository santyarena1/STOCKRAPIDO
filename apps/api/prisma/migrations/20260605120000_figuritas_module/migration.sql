-- Módulo Figuritas Mundial (tablas nuevas; sync/Mondelez puede existir ya vía db push)

CREATE TABLE IF NOT EXISTS "StickerCountry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "flag" TEXT,
    "flagUrl" TEXT,
    "priceUnit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerCountry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Sticker" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StickerCatalogShare" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StickerCatalogShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StickerOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "buyerName" TEXT,
    "buyerPhone" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StickerOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "StickerOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StickerCountry_businessId_name_key" ON "StickerCountry"("businessId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Sticker_businessId_countryId_number_key" ON "Sticker"("businessId", "countryId", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "StickerCatalogShare_businessId_key" ON "StickerCatalogShare"("businessId");
CREATE UNIQUE INDEX IF NOT EXISTS "StickerCatalogShare_token_key" ON "StickerCatalogShare"("token");

DO $$ BEGIN
  ALTER TABLE "StickerCountry" ADD COLUMN IF NOT EXISTS "code" TEXT;
  ALTER TABLE "StickerCountry" ADD COLUMN IF NOT EXISTS "flagUrl" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StickerCountry" ADD CONSTRAINT "StickerCountry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "StickerCountry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StickerCatalogShare" ADD CONSTRAINT "StickerCatalogShare_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StickerOrder" ADD CONSTRAINT "StickerOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StickerOrderItem" ADD CONSTRAINT "StickerOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StickerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StickerOrderItem" ADD CONSTRAINT "StickerOrderItem_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "Sticker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
