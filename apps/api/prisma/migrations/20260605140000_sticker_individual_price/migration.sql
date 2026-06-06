-- Precio opcional por figurita individual (null = hereda del país)
ALTER TABLE "Sticker" ADD COLUMN "priceUnit" DECIMAL(65,30);
