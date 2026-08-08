ALTER TABLE "SyncConnection"
ADD COLUMN "sessionEncrypted" TEXT,
ADD COLUMN "sessionExpiresAt" TIMESTAMP(3);
