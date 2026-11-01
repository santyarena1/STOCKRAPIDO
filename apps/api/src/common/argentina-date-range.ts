/**
 * El front envía fechas como YYYY-MM-DD (día calendario local).
 * `new Date('2025-05-08')` en Node es medianoche UTC → rangos incorrectos para Argentina.
 * Acá interpretamos cada YYYY-MM-DD como día completo en Argentina (UTC−3, sin DST).
 *
 * La API corre en Vercel (UTC). Usar setHours(0,0,0,0) o getDate() del servidor
 * hace que a partir de las 21:00 ART ya cuente como día siguiente.
 * Acá “día” = día de calendario en Argentina (00:00–24:00), no un día laboral especial.
 */

const AR = '-03:00';
const AR_TZ = 'America/Argentina/Buenos_Aires';
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

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

/** YYYY-MM-DD del instante en zona Argentina. */
export function argentinaTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Medianoche del día de calendario en Argentina que contiene `now` (00:00 ART). */
export function argentinaDayStart(now: Date = new Date()): Date {
  return parseArgentinaDayStart(argentinaTodayYmd(now))!;
}

/** Fin del día de calendario en Argentina que contiene `now` (23:59:59.999 ART). */
export function argentinaDayEnd(now: Date = new Date()): Date {
  return parseArgentinaDayEnd(argentinaTodayYmd(now))!;
}

/**
 * Partes de calendario en Argentina.
 * `month` es 0-indexado (como Date#getMonth) para no romper callers existentes.
 */
export function argentinaYmdParts(date: Date = new Date()): { year: number; month: number; day: number } {
  const ymd = argentinaTodayYmd(date);
  const [y, m, d] = ymd.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

/** Día del mes (1–31) en Argentina para un instante UTC. */
export function argentinaDayOfMonth(date: Date): number {
  return argentinaYmdParts(date).day;
}

/** Primer día del mes de calendario en Argentina que contiene `now` (00:00 ART del día 1). */
export function argentinaMonthStart(now: Date = new Date()): Date {
  const { year, month } = argentinaYmdParts(now);
  const mm = String(month + 1).padStart(2, '0');
  return parseArgentinaDayStart(`${year}-${mm}-01`)!;
}

/**
 * Rango [inicio, fin] del mes de calendario argentino `year`/`month` (month 0-indexado).
 * Si no se pasan, usa el mes actual en Argentina.
 */
export function argentinaMonthBounds(year?: number, month?: number, now: Date = new Date()) {
  const parts = argentinaYmdParts(now);
  const y = year ?? parts.year;
  const m = month ?? parts.month;
  const mm = String(m + 1).padStart(2, '0');
  const from = parseArgentinaDayStart(`${y}-${mm}-01`)!;
  // Día 0 del mes siguiente = último día de este mes (calendario).
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const to = parseArgentinaDayEnd(`${y}-${mm}-${String(lastDay).padStart(2, '0')}`)!;
  const daysInMonth = lastDay;
  return { from, to, year: y, month: m, daysInMonth };
}

/** Instantáneo “ahora” corrido −3h para leer Y/M/D vía getUTC* (mismo truco que reports). */
export function argentinaShifted(date: Date): Date {
  return new Date(date.getTime() - AR_OFFSET_MS);
}
