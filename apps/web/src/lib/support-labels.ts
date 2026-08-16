export const TICKET_CATEGORIES: Record<string, string> = {
  pago: 'Pago / facturación',
  bug: 'Problema técnico',
  cuenta: 'Cuenta y usuarios',
  otro: 'Otro',
};

export const TICKET_STATUSES: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En curso',
  waiting: 'Esperando tu respuesta',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

export const PLAN_STATUS_LABELS: Record<string, string> = {
  trial: 'Prueba',
  active: 'Activo',
  pending_payment: 'Pago pendiente',
  past_due: 'Pago vencido',
  canceled: 'Cancelado',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  failed: 'Falló',
  void: 'Anulado',
};

export function moneyArs(amount: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatWhen(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}
