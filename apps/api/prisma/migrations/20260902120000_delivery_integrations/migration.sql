-- AlterTable
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "orderSource" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "externalOrderId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Sale_businessId_orderSource_idx" ON "Sale"("businessId", "orderSource");
CREATE INDEX IF NOT EXISTS "Sale_businessId_externalOrderId_idx" ON "Sale"("businessId", "externalOrderId");

-- CreateTable
CREATE TABLE "DeliveryIntegration" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "storeExternalId" TEXT,
    "chainExternalId" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'AR',
    "config" JSONB,
    "credentialsEncrypted" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "webhookToken" TEXT NOT NULL,
    "storeOpen" BOOLEAN NOT NULL DEFAULT true,
    "autoAccept" BOOLEAN NOT NULL DEFAULT false,
    "autoConfirmSale" BOOLEAN NOT NULL DEFAULT true,
    "prepMinutesDefault" INTEGER NOT NULL DEFAULT 15,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_accept',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "deliveryAddress" TEXT,
    "deliveryNotes" TEXT,
    "paymentMethod" TEXT,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "scheduledFor" TIMESTAMP(3),
    "placedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "saleId" TEXT,
    "raw" JSONB,
    "mappingIssues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalItemId" TEXT,
    "externalSku" TEXT,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "productId" TEXT,
    "mapped" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DeliveryOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProductMapping" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalSku" TEXT NOT NULL,
    "externalName" TEXT,
    "productId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryMenuItem" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalId" TEXT,
    "externalSku" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "price" DECIMAL(65,30),
    "available" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "productId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "raw" JSONB,

    CONSTRAINT "DeliveryMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryIntegrationEvent" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryIntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryIntegration_businessId_provider_key" ON "DeliveryIntegration"("businessId", "provider");
CREATE INDEX "DeliveryIntegration_webhookToken_idx" ON "DeliveryIntegration"("webhookToken");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_saleId_key" ON "DeliveryOrder"("saleId");
CREATE UNIQUE INDEX "DeliveryOrder_businessId_provider_externalOrderId_key" ON "DeliveryOrder"("businessId", "provider", "externalOrderId");
CREATE INDEX "DeliveryOrder_businessId_status_createdAt_idx" ON "DeliveryOrder"("businessId", "status", "createdAt");
CREATE INDEX "DeliveryOrder_integrationId_status_idx" ON "DeliveryOrder"("integrationId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_orderId_idx" ON "DeliveryOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryOrderEvent_orderId_createdAt_idx" ON "DeliveryOrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProductMapping_integrationId_externalSku_key" ON "DeliveryProductMapping"("integrationId", "externalSku");

-- CreateIndex
CREATE INDEX "DeliveryMenuItem_integrationId_externalSku_idx" ON "DeliveryMenuItem"("integrationId", "externalSku");

-- CreateIndex
CREATE INDEX "DeliveryIntegrationEvent_integrationId_createdAt_idx" ON "DeliveryIntegrationEvent"("integrationId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryIntegration" ADD CONSTRAINT "DeliveryIntegration_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "DeliveryIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderEvent" ADD CONSTRAINT "DeliveryOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProductMapping" ADD CONSTRAINT "DeliveryProductMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "DeliveryIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryProductMapping" ADD CONSTRAINT "DeliveryProductMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryMenuItem" ADD CONSTRAINT "DeliveryMenuItem_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "DeliveryIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryMenuItem" ADD CONSTRAINT "DeliveryMenuItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIntegrationEvent" ADD CONSTRAINT "DeliveryIntegrationEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "DeliveryIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
