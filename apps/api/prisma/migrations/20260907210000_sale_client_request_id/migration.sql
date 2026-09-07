ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Sale_businessId_clientRequestId_key"
  ON "Sale"("businessId", "clientRequestId");

CREATE INDEX IF NOT EXISTS "Sale_businessId_userId_createdAt_idx"
  ON "Sale"("businessId", "userId", "createdAt");
