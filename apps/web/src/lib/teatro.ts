/** Normaliza nombre de negocio para comparar (minúsculas, sin tildes). */
function normalizeBusinessName(businessName: string): string {
  return businessName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Detecta el tenant Teatro por nombre (sin tildes). */
export function isTeatroTenantName(businessName: string | null | undefined): boolean {
  if (!businessName) return false;
  return normalizeBusinessName(businessName).includes('teatro');
}

/** Detecta el tenant Carhué 1411 por nombre. */
export function isCarhue1411TenantName(businessName: string | null | undefined): boolean {
  if (!businessName) return false;
  const n = normalizeBusinessName(businessName);
  return n.includes('carhue') && n.includes('1411');
}

/**
 * Edición rápida de precio, control de stock + reconciliar y redondeo a $500.
 * Teatro y Carhué 1411. (Vaciar inventario / Pantallas siguen solo Teatro.)
 */
export function hasStockPriceTools(businessName: string | null | undefined): boolean {
  return isTeatroTenantName(businessName) || isCarhue1411TenantName(businessName);
}
