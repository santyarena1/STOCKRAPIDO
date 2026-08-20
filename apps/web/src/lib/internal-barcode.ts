/** Generación local de EAN-13 interno (mismo algoritmo que la API). */

export function ean13CheckDigit(twelve: string): string {
  const digits = twelve.replace(/\D/g, '').slice(0, 12).padStart(12, '0').split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function buildEan13(twelve: string): string {
  const body = twelve.replace(/\D/g, '').slice(0, 12).padStart(12, '0');
  return body + ean13CheckDigit(body);
}

export function tenantPrefix(businessId: string): string {
  let hash = 0;
  for (let i = 0; i < businessId.length; i += 1) {
    hash = (hash * 33 + businessId.charCodeAt(i)) >>> 0;
  }
  return String(hash % 100000).padStart(5, '0');
}

/** Genera un EAN interno 20xxxxx. La unicidad se confirma al guardar el producto. */
export function generateLocalInternalBarcode(businessId: string, avoid = new Set<string>()): string {
  const prefix = `20${tenantPrefix(businessId || 'local')}`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const serial = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    const barcode = buildEan13(`${prefix}${serial}`);
    if (!avoid.has(barcode)) return barcode;
  }
  throw new Error('No pudimos generar un código libre. Probá de nuevo.');
}
