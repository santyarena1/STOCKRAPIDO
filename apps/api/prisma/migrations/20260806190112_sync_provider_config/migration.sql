ALTER TABLE "SyncConnection"
ADD COLUMN "credentialsEncrypted" TEXT,
ADD COLUMN "syncFrequency" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "syncHourLocal" INTEGER,
ADD COLUMN "columnsConfig" JSONB;
