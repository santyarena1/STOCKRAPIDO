-- Catálogo local de Precios Claros (compartido entre negocios)
CREATE TABLE IF NOT EXISTS "PreciosClarosCatalog" (
  "ean" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brand" TEXT,
  "presentation" TEXT,
  "priceMin" DECIMAL(65,30),
  "priceMax" DECIMAL(65,30),
  "nameNorm" TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreciosClarosCatalog_pkey" PRIMARY KEY ("ean")
);

CREATE INDEX IF NOT EXISTS "PreciosClarosCatalog_nameNorm_idx" ON "PreciosClarosCatalog"("nameNorm");
CREATE INDEX IF NOT EXISTS "PreciosClarosCatalog_brand_idx" ON "PreciosClarosCatalog"("brand");
CREATE INDEX IF NOT EXISTS "PreciosClarosCatalog_syncedAt_idx" ON "PreciosClarosCatalog"("syncedAt");
