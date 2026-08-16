-- Producto silencioso: cambia el nombre solo en el comprobante impreso.
ALTER TABLE "Product" ADD COLUMN "silent" BOOLEAN NOT NULL DEFAULT false;
