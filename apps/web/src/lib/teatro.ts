/** Detecta el tenant Teatro por nombre (sin tildes). */
export function isTeatroTenantName(businessName: string | null | undefined): boolean {
  if (!businessName) return false;
  const n = businessName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /teatro/i.test(n);
}
