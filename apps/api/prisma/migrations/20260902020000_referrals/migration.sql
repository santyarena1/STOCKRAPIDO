-- Programa de referidos: código por local y descuento $5000 x 3 meses para ambos.

ALTER TABLE "Business" ADD COLUMN "referralCode" TEXT;
CREATE UNIQUE INDEX "Business_referralCode_key" ON "Business"("referralCode");

ALTER TABLE "Invoice" ADD COLUMN "discount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "referralMeta" JSONB;

CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrerBusinessId" TEXT NOT NULL,
    "referredBusinessId" TEXT NOT NULL,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 5000,
    "months" INTEGER NOT NULL DEFAULT 3,
    "refereeMonthsLeft" INTEGER NOT NULL DEFAULT 3,
    "referrerMonthsLeft" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Referral_referredBusinessId_key" ON "Referral"("referredBusinessId");
CREATE INDEX "Referral_referrerBusinessId_idx" ON "Referral"("referrerBusinessId");
CREATE INDEX "Referral_code_idx" ON "Referral"("code");

ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerBusinessId_fkey" FOREIGN KEY ("referrerBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredBusinessId_fkey" FOREIGN KEY ("referredBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
