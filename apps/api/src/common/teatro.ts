/** Normaliza nombre de negocio para comparar (minúsculas, sin tildes). */
function normalizeBusinessName(businessName: string): string {
  return businessName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Tenant Teatro (telón): por nombre o allowlist de IDs (wipe / pantallas). */
export function isTeatroTenant(businessName: string, businessId?: string): boolean {
  const allow = (process.env.INVENTORY_WIPE_BUSINESS_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (businessId && allow.includes(businessId)) return true;
  return normalizeBusinessName(businessName).includes('teatro');
}

/** Tenant Carhué 1411: por nombre. */
export function isCarhue1411Tenant(businessName: string, businessId?: string): boolean {
  const allow = (process.env.CARHUE_1411_BUSINESS_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (businessId && allow.includes(businessId)) return true;
  const n = normalizeBusinessName(businessName);
  return n.includes('carhue') && n.includes('1411');
}

/**
 * Herramientas de stock/precio (edición rápida, control+reconcile, redondeo $500).
 * No incluye vaciar inventario ni Pantallas.
 */
export function hasStockPriceTools(businessName: string, businessId?: string): boolean {
  return isTeatroTenant(businessName, businessId) || isCarhue1411Tenant(businessName, businessId);
}
