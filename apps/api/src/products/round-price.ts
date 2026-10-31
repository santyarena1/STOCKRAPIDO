/**
 * Redondea un precio hacia arriba al múltiplo de `step`.
 * Ej. step=500: 1100 → 1500, 900 → 1000, 1000 → 1000.
 */
export function roundPriceUpToStep(price: number, step = 500): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error('El paso de redondeo debe ser mayor a 0.');
  }
  return Math.ceil(price / step) * step;
}
