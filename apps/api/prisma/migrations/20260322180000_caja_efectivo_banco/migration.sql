-- AlterTable
ALTER TABLE "CashRegister" ADD COLUMN "openingBank" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CashRegister" ADD COLUMN "closingBank" REAL;
