-- Fidelización, puntos y vínculo opcional en ventas. Campos nuevos con default para no romper ventas existentes.

ALTER TABLE "Sale" ADD COLUMN "fiscalMode" TEXT,
ADD COLUMN "loyaltyAccountId" TEXT,
ADD COLUMN "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "loyaltyArsRedeemed" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "loyaltyPointsEarned" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LoyaltyConfig" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerArs" INTEGER NOT NULL DEFAULT 10,
    "cashbackPercent" DECIMAL(6,2) NOT NULL DEFAULT 5,
    "checkInTtlMinutes" INTEGER NOT NULL DEFAULT 8,
    "claimTtlHours" INTEGER NOT NULL DEFAULT 168,
    "transferAlias" TEXT,
    "transferCbuCvu" TEXT,
    "transferHolder" TEXT,
    "transferBank" TEXT,
    "transferInstructions" TEXT,
    "programName" TEXT NOT NULL DEFAULT 'Fidelización',
    "publicSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "normalizedPhone" TEXT,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "pinHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "balancePoints" INTEGER NOT NULL DEFAULT 0,
    "purchasedPoints" INTEGER NOT NULL DEFAULT 0,
    "freePoints" INTEGER NOT NULL DEFAULT 0,
    "publicToken" TEXT NOT NULL,
    "appleSerial" TEXT,
    "appleAuthTokenEnc" TEXT,
    "googleObjectId" TEXT,
    "pinFailedCount" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "walletSyncedAt" TIMESTAMP(3),
    "walletSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "purchasedDelta" INTEGER NOT NULL DEFAULT 0,
    "freeDelta" INTEGER NOT NULL DEFAULT 0,
    "arsEquivalent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sourceSaleId" TEXT,
    "sourceTopupId" TEXT,
    "sourceRedemptionId" TEXT,
    "reversalOfId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltySaleLink" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "loyaltyAccountId" TEXT,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "freePointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "purchasedPointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "arsRedeemed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "claimTokenHash" TEXT,
    "claimTokenEnc" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltySaleLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyCheckIn" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attachedSaleId" TEXT,
    "attachedByUserId" TEXT,
    "openKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyTopupRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "amountArs" DECIMAL(14,2) NOT NULL,
    "points" INTEGER NOT NULL,
    "pointsPerArsSnapshot" INTEGER NOT NULL,
    "payerName" TEXT NOT NULL,
    "note" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyTopupRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stock" INTEGER,
    "linkedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyRedemption" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "deliveredById" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyMilestoneRule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "everyNPurchases" INTEGER NOT NULL,
    "bonusPoints" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyMilestoneRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyMilestoneAward" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "saleId" TEXT,
    "purchaseCount" INTEGER NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyMilestoneAward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltySession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyWalletDevice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "deviceLibraryIdentifier" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "passTypeIdentifier" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyWalletDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyPinReset" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyPinReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyConfig_businessId_key" ON "LoyaltyConfig"("businessId");
CREATE UNIQUE INDEX "LoyaltyConfig_publicSlug_key" ON "LoyaltyConfig"("publicSlug");
CREATE UNIQUE INDEX "LoyaltyAccount_publicToken_key" ON "LoyaltyAccount"("publicToken");
CREATE UNIQUE INDEX "LoyaltyAccount_appleSerial_key" ON "LoyaltyAccount"("appleSerial");
CREATE UNIQUE INDEX "LoyaltyAccount_businessId_normalizedPhone_key" ON "LoyaltyAccount"("businessId", "normalizedPhone");
CREATE UNIQUE INDEX "LoyaltyAccount_businessId_normalizedEmail_key" ON "LoyaltyAccount"("businessId", "normalizedEmail");
CREATE INDEX "LoyaltyAccount_businessId_name_idx" ON "LoyaltyAccount"("businessId", "name");
CREATE INDEX "LoyaltyAccount_businessId_active_idx" ON "LoyaltyAccount"("businessId", "active");
CREATE UNIQUE INDEX "LoyaltyTransaction_reversalOfId_key" ON "LoyaltyTransaction"("reversalOfId");
CREATE UNIQUE INDEX "LoyaltyTransaction_businessId_idempotencyKey_key" ON "LoyaltyTransaction"("businessId", "idempotencyKey");
CREATE INDEX "LoyaltyTransaction_loyaltyAccountId_createdAt_idx" ON "LoyaltyTransaction"("loyaltyAccountId", "createdAt");
CREATE INDEX "LoyaltyTransaction_businessId_type_createdAt_idx" ON "LoyaltyTransaction"("businessId", "type", "createdAt");
CREATE INDEX "LoyaltyTransaction_sourceSaleId_idx" ON "LoyaltyTransaction"("sourceSaleId");
CREATE INDEX "LoyaltyTransaction_sourceTopupId_idx" ON "LoyaltyTransaction"("sourceTopupId");
CREATE UNIQUE INDEX "LoyaltySaleLink_saleId_key" ON "LoyaltySaleLink"("saleId");
CREATE UNIQUE INDEX "LoyaltySaleLink_claimTokenHash_key" ON "LoyaltySaleLink"("claimTokenHash");
CREATE INDEX "LoyaltySaleLink_businessId_status_idx" ON "LoyaltySaleLink"("businessId", "status");
CREATE UNIQUE INDEX "LoyaltyCheckIn_attachedSaleId_key" ON "LoyaltyCheckIn"("attachedSaleId");
CREATE UNIQUE INDEX "LoyaltyCheckIn_openKey_key" ON "LoyaltyCheckIn"("openKey");
CREATE INDEX "LoyaltyCheckIn_businessId_status_expiresAt_idx" ON "LoyaltyCheckIn"("businessId", "status", "expiresAt");
CREATE INDEX "LoyaltyCheckIn_loyaltyAccountId_createdAt_idx" ON "LoyaltyCheckIn"("loyaltyAccountId", "createdAt");
CREATE UNIQUE INDEX "LoyaltyTopupRequest_transactionId_key" ON "LoyaltyTopupRequest"("transactionId");
CREATE INDEX "LoyaltyTopupRequest_businessId_status_createdAt_idx" ON "LoyaltyTopupRequest"("businessId", "status", "createdAt");
CREATE INDEX "LoyaltyReward_businessId_active_idx" ON "LoyaltyReward"("businessId", "active");
CREATE UNIQUE INDEX "LoyaltyRedemption_transactionId_key" ON "LoyaltyRedemption"("transactionId");
CREATE UNIQUE INDEX "LoyaltyRedemption_businessId_code_key" ON "LoyaltyRedemption"("businessId", "code");
CREATE INDEX "LoyaltyRedemption_businessId_status_createdAt_idx" ON "LoyaltyRedemption"("businessId", "status", "createdAt");
CREATE INDEX "LoyaltyMilestoneRule_businessId_active_idx" ON "LoyaltyMilestoneRule"("businessId", "active");
CREATE UNIQUE INDEX "LoyaltyMilestoneAward_transactionId_key" ON "LoyaltyMilestoneAward"("transactionId");
CREATE UNIQUE INDEX "LoyaltyMilestoneAward_ruleId_saleId_key" ON "LoyaltyMilestoneAward"("ruleId", "saleId");
CREATE INDEX "LoyaltyMilestoneAward_businessId_loyaltyAccountId_idx" ON "LoyaltyMilestoneAward"("businessId", "loyaltyAccountId");
CREATE UNIQUE INDEX "LoyaltySession_tokenHash_key" ON "LoyaltySession"("tokenHash");
CREATE INDEX "LoyaltySession_loyaltyAccountId_expiresAt_idx" ON "LoyaltySession"("loyaltyAccountId", "expiresAt");
CREATE UNIQUE INDEX "LoyaltyWalletDevice_deviceLibraryIdentifier_serialNumber_key" ON "LoyaltyWalletDevice"("deviceLibraryIdentifier", "serialNumber");
CREATE INDEX "LoyaltyWalletDevice_serialNumber_idx" ON "LoyaltyWalletDevice"("serialNumber");
CREATE UNIQUE INDEX "LoyaltyPinReset_tokenHash_key" ON "LoyaltyPinReset"("tokenHash");
CREATE INDEX "Sale_loyaltyAccountId_idx" ON "Sale"("loyaltyAccountId");

ALTER TABLE "LoyaltyConfig" ADD CONSTRAINT "LoyaltyConfig_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_sourceSaleId_fkey" FOREIGN KEY ("sourceSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LoyaltyTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltySaleLink" ADD CONSTRAINT "LoyaltySaleLink_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltySaleLink" ADD CONSTRAINT "LoyaltySaleLink_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltySaleLink" ADD CONSTRAINT "LoyaltySaleLink_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyCheckIn" ADD CONSTRAINT "LoyaltyCheckIn_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyCheckIn" ADD CONSTRAINT "LoyaltyCheckIn_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyCheckIn" ADD CONSTRAINT "LoyaltyCheckIn_attachedByUserId_fkey" FOREIGN KEY ("attachedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyCheckIn" ADD CONSTRAINT "LoyaltyCheckIn_attachedSaleId_fkey" FOREIGN KEY ("attachedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTopupRequest" ADD CONSTRAINT "LoyaltyTopupRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTopupRequest" ADD CONSTRAINT "LoyaltyTopupRequest_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTopupRequest" ADD CONSTRAINT "LoyaltyTopupRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_linkedProductId_fkey" FOREIGN KEY ("linkedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "LoyaltyReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyMilestoneRule" ADD CONSTRAINT "LoyaltyMilestoneRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyMilestoneAward" ADD CONSTRAINT "LoyaltyMilestoneAward_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyMilestoneAward" ADD CONSTRAINT "LoyaltyMilestoneAward_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "LoyaltyMilestoneRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyMilestoneAward" ADD CONSTRAINT "LoyaltyMilestoneAward_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyMilestoneAward" ADD CONSTRAINT "LoyaltyMilestoneAward_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltySession" ADD CONSTRAINT "LoyaltySession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltySession" ADD CONSTRAINT "LoyaltySession_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyWalletDevice" ADD CONSTRAINT "LoyaltyWalletDevice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyWalletDevice" ADD CONSTRAINT "LoyaltyWalletDevice_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyPinReset" ADD CONSTRAINT "LoyaltyPinReset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyPinReset" ADD CONSTRAINT "LoyaltyPinReset_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
