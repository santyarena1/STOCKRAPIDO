-- CreateTable
CREATE TABLE "ExternalFiscalEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "note" TEXT,
    "invoicedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalFiscalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalFiscalEntry_businessId_invoicedAt_idx" ON "ExternalFiscalEntry"("businessId", "invoicedAt");

-- AddForeignKey
ALTER TABLE "ExternalFiscalEntry" ADD CONSTRAINT "ExternalFiscalEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
