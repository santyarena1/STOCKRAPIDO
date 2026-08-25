-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_shareToken_key" ON "Customer"("shareToken");
