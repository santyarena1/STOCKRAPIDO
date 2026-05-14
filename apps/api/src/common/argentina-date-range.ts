/**
 * El front envía fechas como YYYY-MM-DD (día calendario local).
 * `new Date('2025-05-08')` en Node es medianoche UTC → rangos incorrectos para Argentina.
 * Acá interpretamos cada YYYY-MM-DD como día completo en Argentina (UTC−3, sin DST).
 */

const AR = '-03:00';

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseArgentinaDayStart(ymd: string): Date | null {
  const m = YMD.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000${AR}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseArgentinaDayEnd(ymd: string): Date | null {
  const m = YMD.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59.999${AR}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Convierte query `from` / `to` en límites reales para filtrar `createdAt`. */
export function saleDateRangeFromQuery(from?: string, to?: string): { from?: Date; to?: Date } {
  const out: { from?: Date; to?: Date } = {};
  if (from?.trim()) {
    const d = parseArgentinaDayStart(from.trim());
    if (d) out.from = d;
  }
  if (to?.trim()) {
    const d = parseArgentinaDayEnd(to.trim());
    if (d) out.to = d;
  }
  return out;
}
