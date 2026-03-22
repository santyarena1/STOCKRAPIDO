/** Convierte valores estilo JWT (`15m`, `7d`, `365d`, `10y`) a milisegundos. */
export function parseJwtDurationToMs(expiresIn: string): number {
  const m = /^(\d+)\s*([ydhms])$/i.exec(expiresIn.trim());
  if (!m) return 365 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  const day = 86400000;
  const mult: Record<string, number> = { y: 365 * day, d: day, h: 3600000, m: 60000, s: 1000 };
  return n * (mult[u] ?? day);
}

export function jwtDurationToSeconds(expiresIn: string): number {
  return Math.floor(parseJwtDurationToMs(expiresIn) / 1000);
}
