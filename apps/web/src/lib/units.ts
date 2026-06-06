/** Misma lógica que apps/api/src/common/units.ts — precios siempre unitarios en UI/POS. */

export function parseUnitsPerBox(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value >= 2 ? Math.floor(value) : null;
  const digits = String(value).replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = parseInt(digits.slice(0, 6), 10);
  return Number.isFinite(n) && n >= 2 ? n : null;
}

export function bulkCostToUnit(
  bulkCost: number | null | undefined,
  unitsPerBox: string | number | null | undefined,
): number | null {
  if (bulkCost == null || !Number.isFinite(Number(bulkCost)) || Number(bulkCost) <= 0 || Number(bulkCost) >= 1_000_000) {
    return null;
  }
  const units = parseUnitsPerBox(unitsPerBox);
  if (units == null) return Math.round(Number(bulkCost) * 100) / 100;
  return Math.round((Number(bulkCost) / units) * 100) / 100;
}

export function formatMoneyArs(n: number | null | undefined, decimals = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}

export type UnitPriceFields = {
  cost?: unknown;
  price?: unknown;
  unitsPerBox?: string | null;
  unitsPerBoxNum?: number | null;
  costBox?: number | null;
  priceBox?: number | null;
};

export function decorateProductUnitsClient(p: UnitPriceFields) {
  const unitsPerBoxNum = p.unitsPerBoxNum ?? parseUnitsPerBox(p.unitsPerBox);
  const costNum = p.cost != null ? Number(p.cost) : null;
  const priceNum = p.price != null ? Number(p.price) : null;
  const costBox =
    unitsPerBoxNum != null && costNum != null && Number.isFinite(costNum)
      ? Math.round(costNum * unitsPerBoxNum * 100) / 100
      : (p.costBox ?? null);
  const priceBox =
    unitsPerBoxNum != null && priceNum != null && Number.isFinite(priceNum)
      ? Math.round(priceNum * unitsPerBoxNum * 100) / 100
      : (p.priceBox ?? null);
  return { unitsPerBoxNum, costNum, priceNum, costBox, priceBox, isBulk: unitsPerBoxNum != null && unitsPerBoxNum >= 2 };
}
