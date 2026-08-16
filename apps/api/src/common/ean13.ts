/** Código interno de góndola: EAN-13 que empieza en 20 (uso interno). */

export function ean13CheckDigit(twelve: string): string {
  const digits = twelve.replace(/\D/g, '').slice(0, 12).padStart(12, '0').split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function buildEan13(twelve: string): string {
  const body = twelve.replace(/\D/g, '').slice(0, 12).padStart(12, '0');
  return body + ean13CheckDigit(body);
}

export function isEan13(value: string): boolean {
  const code = value.replace(/\D/g, '');
  if (code.length !== 13) return false;
  return code === buildEan13(code.slice(0, 12));
}

export function tenantPrefix(businessId: string): string {
  let hash = 0;
  for (let i = 0; i < businessId.length; i += 1) {
    hash = (hash * 33 + businessId.charCodeAt(i)) >>> 0;
  }
  return String(hash % 100000).padStart(5, '0');
}
