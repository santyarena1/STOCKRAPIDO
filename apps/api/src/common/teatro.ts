/** Tenant Teatro (telón): por nombre o allowlist de IDs. */
export function isTeatroTenant(businessName: string, businessId?: string): boolean {
  const allow = (process.env.INVENTORY_WIPE_BUSINESS_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (businessId && allow.includes(businessId)) return true;
  const n = businessName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return n.includes('teatro');
}
