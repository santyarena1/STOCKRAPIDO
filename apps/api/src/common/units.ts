/**
 * Parsea unitsPerBox (string libre tipo "24", "Display 24", "Pack x 12") a int.
 * Devuelve null si no aplica (vacío, no parseable, o resultado < 2).
 * Convención: si unitsPerBox >= 2 el producto se considera "por bulto" y los
 * precios mostrados al cliente son por unidad (cost/price en DB ya son unitarios).
 */
export function parseUnitsPerBox(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value >= 2 ? Math.floor(value) : null;
  const digits = String(value).replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = parseInt(digits.slice(0, 6), 10);
  return Number.isFinite(n) && n >= 2 ? n : null;
}

/**
 * Decora un producto con campos calculados de "bulto":
 *  - unitsPerBoxNum: int parseado o null
 *  - costBox: cost × unitsPerBoxNum (referencia interna)
 *  - priceBox: price × unitsPerBoxNum (referencia interna)
 * cost/price siempre son por unidad en DB.
 */
export function decorateProductUnits<T extends { cost?: unknown; price?: unknown; unitsPerBox?: string | null }>(
  p: T,
): T & { unitsPerBoxNum: number | null; costBox: number | null; priceBox: number | null } {
  const unitsPerBoxNum = parseUnitsPerBox(p.unitsPerBox);
  const costNum = p.cost != null ? Number(p.cost) : null;
  const priceNum = p.price != null ? Number(p.price) : null;
  const costBox = unitsPerBoxNum != null && costNum != null && Number.isFinite(costNum) ? Math.round(costNum * unitsPerBoxNum * 100) / 100 : null;
  const priceBox = unitsPerBoxNum != null && priceNum != null && Number.isFinite(priceNum) ? Math.round(priceNum * unitsPerBoxNum * 100) / 100 : null;
  return { ...p, unitsPerBoxNum, costBox, priceBox };
}
