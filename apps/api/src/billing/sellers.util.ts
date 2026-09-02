export type SellerCommissionType = 'percent' | 'fixed';

export function isSellerCommissionType(value: unknown): value is SellerCommissionType {
  return value === 'percent' || value === 'fixed';
}

/** percent: % sobre el importe cobrado. fixed: monto fijo (primera venta del local). */
export function computeSellerCommission(type: SellerCommissionType, value: number, invoiceAmount: number): number {
  const rate = Number(value);
  const sold = Number(invoiceAmount);
  if (!Number.isFinite(rate) || rate < 0) return 0;
  if (!Number.isFinite(sold) || sold < 0) return 0;
  if (type === 'percent') return Math.max(0, Math.round((sold * rate) / 100));
  return Math.max(0, Math.round(rate));
}

export function argentinaYearMonth(at: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(at);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return { year, month };
}

export function monthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
