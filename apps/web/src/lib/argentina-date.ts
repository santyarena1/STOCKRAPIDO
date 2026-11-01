/** Día de calendario AR (America/Argentina/Buenos_Aires) como YYYY-MM-DD. */
export function todayYmdArgentina(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Parsea YYYY-MM-DD a Date local a medianoche (sin UTC). */
export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Fecha local YYYY-MM-DD (inputs type="date"). */
export function localYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Lunes de la semana calendario que contiene `ref` (lun → dom). */
export function startOfWeekMonday(ref: Date): Date {
  const x = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

export type AnalyticsDatePresetId =
  | 'hoy'
  | 'ayer'
  | 'ultimos_7'
  | 'esta_semana'
  | 'mes_actual'
  | 'mes_anterior'
  | 'personalizado';

export const ANALYTICS_DATE_PRESETS: {
  id: AnalyticsDatePresetId;
  label: string;
  title?: string;
}[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'ultimos_7', label: 'Últimos 7 días', title: 'Incluye hoy (7 días corridos)' },
  { id: 'esta_semana', label: 'Esta semana', title: 'Lunes de esta semana hasta hoy' },
  { id: 'mes_actual', label: 'Este mes', title: 'Desde el 1 del mes hasta hoy' },
  { id: 'mes_anterior', label: 'Mes anterior', title: 'Mes calendario completo anterior' },
  { id: 'personalizado', label: 'Fechas', title: 'Elegí desde / hasta' },
];

export function rangeForAnalyticsPreset(
  id: Exclude<AnalyticsDatePresetId, 'personalizado'>,
): { from: string; to: string } {
  const today = parseYmdLocal(todayYmdArgentina());
  switch (id) {
    case 'hoy':
      return { from: localYMD(today), to: localYMD(today) };
    case 'ayer': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const ymd = localYMD(y);
      return { from: ymd, to: ymd };
    }
    case 'ultimos_7': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: localYMD(start), to: localYMD(today) };
    }
    case 'esta_semana': {
      const monday = startOfWeekMonday(today);
      return { from: localYMD(monday), to: localYMD(today) };
    }
    case 'mes_actual': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: localYMD(first), to: localYMD(today) };
    }
    case 'mes_anterior': {
      const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastPrev = new Date(firstThis);
      lastPrev.setDate(0);
      const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
      return { from: localYMD(firstPrev), to: localYMD(lastPrev) };
    }
    default:
      return { from: localYMD(today), to: localYMD(today) };
  }
}

export function labelForDateRange(from: string, to: string): string {
  if (!from || !to) return 'Período';
  if (from === to) {
    const today = todayYmdArgentina();
    if (from === today) return 'Hoy';
    const y = parseYmdLocal(today);
    y.setDate(y.getDate() - 1);
    if (from === localYMD(y)) return 'Ayer';
    return from.split('-').reverse().join('/');
  }
  const a = from.split('-').reverse().join('/');
  const b = to.split('-').reverse().join('/');
  return `${a} – ${b}`;
}
