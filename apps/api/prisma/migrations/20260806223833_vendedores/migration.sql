ALTER TABLE "Sale"
ADD COLUMN "sellerId" TEXT;

CREATE TABLE "Vendedor" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vendedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendedorSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "VendedorSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Vendedor_businessId_active_idx" ON "Vendedor"("businessId", "active");
CREATE INDEX "VendedorSession_businessId_endedAt_idx" ON "VendedorSession"("businessId", "endedAt");
CREATE INDEX "VendedorSession_vendedorId_startedAt_idx" ON "VendedorSession"("vendedorId", "startedAt");

ALTER TABLE "Vendedor"
ADD CONSTRAINT "Vendedor_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendedorSession"
ADD CONSTRAINT "VendedorSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VendedorSession"
ADD CONSTRAINT "VendedorSession_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
