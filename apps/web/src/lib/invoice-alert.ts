import { api } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';

export type InvoiceAlertPeriod = 'calendar_month' | 'rolling_30' | 'all_time';

export type InvoiceAlertStatus = {
  enabled: boolean;
  alertEnabled?: boolean;
  limit: number | null;
  percent: number;
  period: InvoiceAlertPeriod;
  periodFrom: string | null;
  periodTo: string | null;
  invoiceCount: number;
  voidedCount: number;
  activeCount: number;
  invoicedGross: number;
  creditNotes: number;
  invoicedNet: number;
  nextAmount: number;
  projected: number;
  percentUsed: number;
  projectedPercent: number;
  remaining: number | null;
  shouldAlert: boolean;
  message: string | null;
};

export const INVOICE_ALERT_PERIOD_LABELS: Record<InvoiceAlertPeriod, string> = {
  calendar_month: 'Mes calendario',
  rolling_30: 'Últimos 30 días',
  all_time: 'Acumulado total',
};

export async function fetchInvoiceAlert(nextAmount = 0): Promise<InvoiceAlertStatus> {
  return api<InvoiceAlertStatus>('/fiscal/invoice-alert', {
    params: { nextAmount: String(nextAmount || 0) },
  });
}

/** Devuelve true si el usuario confirma seguir (o no hay aviso). false = canceló. */
export async function confirmInvoiceAlertIfNeeded(nextAmount: number): Promise<boolean> {
  try {
    const alert = await fetchInvoiceAlert(nextAmount);
    if (!alert.shouldAlert) return true;
    const msg =
      alert.message ||
      `Estás cerca del tope facturado (${formatMoneyArs(alert.invoicedNet)} de ${formatMoneyArs(alert.limit ?? 0)}). ¿Facturar igual?`;
    return window.confirm(`${msg}\n\n¿Facturar igual?`);
  } catch {
    // Si falla el chequeo, no bloqueamos la facturación.
    return true;
  }
}
