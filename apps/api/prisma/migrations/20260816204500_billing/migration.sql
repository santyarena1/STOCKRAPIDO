-- Planes y facturación por negocio.
ALTER TABLE "Business" ADD COLUMN "planId" TEXT NOT NULL DEFAULT 'kiosco';
ALTER TABLE "Business" ADD COLUMN "planStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Business" ADD COLUMN "billingCycle" TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE "Business" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "planRenewsAt" TIMESTAMP(3);

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "method" TEXT,
    "notes" TEXT,
    "mpPreferenceId" TEXT,
    "mpPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Invoice_businessId_createdAt_idx" ON "Invoice"("businessId", "createdAt");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
