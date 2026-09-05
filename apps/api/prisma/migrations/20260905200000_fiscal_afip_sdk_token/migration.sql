-- Token Afip SDK por negocio (para sync de Mis Comprobantes → Recibidos).
-- Se guarda cifrado; ARCA no ofrece API oficial de recibidos.
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "afipSdkAccessTokenEncrypted" TEXT;
