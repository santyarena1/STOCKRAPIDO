CREATE TABLE "DataBackup" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataBackup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataBackup_businessId_category_idx" ON "DataBackup"("businessId", "category");
CREATE INDEX "DataBackup_expiresAt_idx" ON "DataBackup"("expiresAt");

ALTER TABLE "DataBackup"
ADD CONSTRAINT "DataBackup_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
