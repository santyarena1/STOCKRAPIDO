CREATE TABLE "SupplierAccount" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clienteId" TEXT,
    "razonSocial" TEXT,
    "balance" DECIMAL(65,30),
    "creditLimit" DECIMAL(65,30),
    "availableCredit" DECIMAL(65,30),
    "currency" TEXT DEFAULT 'ARS',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "number" TEXT,
    "date" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "total" DECIMAL(65,30),
    "saldoPendiente" DECIMAL(65,30),
    "status" TEXT,
    "pdfUrl" TEXT,
    "raw" JSONB,
    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierAccountMovement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "type" TEXT,
    "reference" TEXT,
    "amount" DECIMAL(65,30),
    "runningBalance" DECIMAL(65,30),
    CONSTRAINT "SupplierAccountMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierCredit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tipo" TEXT,
    "montoDisponible" DECIMAL(65,30),
    "montoUsado" DECIMAL(65,30),
    "vencimiento" TIMESTAMP(3),
    "condiciones" TEXT,
    CONSTRAINT "SupplierCredit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierAccount_connectionId_key" ON "SupplierAccount"("connectionId");
CREATE INDEX "SupplierInvoice_accountId_idx" ON "SupplierInvoice"("accountId");
CREATE INDEX "SupplierAccountMovement_accountId_idx" ON "SupplierAccountMovement"("accountId");
CREATE INDEX "SupplierCredit_accountId_idx" ON "SupplierCredit"("accountId");

ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SyncConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SupplierAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierAccountMovement" ADD CONSTRAINT "SupplierAccountMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SupplierAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SupplierAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
