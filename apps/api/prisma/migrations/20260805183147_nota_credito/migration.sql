ALTER TABLE "FiscalDocument"
ADD COLUMN "creditNoteType" INTEGER,
ADD COLUMN "creditNoteNumber" INTEGER,
ADD COLUMN "creditNoteCae" TEXT,
ADD COLUMN "creditNoteCaeExpiresAt" TIMESTAMP(3),
ADD COLUMN "creditNoteQr" TEXT,
ADD COLUMN "creditNoteResult" JSONB,
ADD COLUMN "voidedAt" TIMESTAMP(3);
