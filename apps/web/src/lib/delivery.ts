export type DeliveryProvider = 'rappi' | 'pedidosya';

export type DeliveryIntegration = {
  id: string | null;
  provider: DeliveryProvider;
  name: string;
  enabled: boolean;
  storeExternalId: string | null;
  chainExternalId: string | null;
  countryCode: string;
  config: Record<string, unknown>;
  hasCredentials: boolean;
  webhookToken: string | null;
  storeOpen: boolean;
  autoAccept: boolean;
  autoConfirmSale: boolean;
  prepMinutesDefault: number;
  priceMarkupPercent?: number;
  platformCommissionPercent?: number;
  publishMode?: string;
  testMode?: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type DeliveryOrderItem = {
  id: string;
  name: string;
  qty: number;
  unitPrice: string | number;
  subtotal: string | number;
  externalSku: string | null;
  mapped: boolean;
  product?: { id: string; name: string; barcode: string | null } | null;
};

export type DeliveryOrder = {
  id: string;
  provider: DeliveryProvider;
  externalOrderId: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  total: string | number;
  placedAt: string | null;
  createdAt: string;
  mappingIssues?: unknown;
  items: DeliveryOrderItem[];
  integration?: { provider: string; name: string; storeOpen: boolean };
  sale?: { id: string } | null;
  events?: { id: string; type: string; message: string | null; createdAt: string }[];
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_accept: 'Pendiente',
  accepted: 'Aceptado',
  preparing: 'Preparando',
  ready_for_pickup: 'Listo',
  dispatched: 'Despachado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  rejected: 'Rechazado',
  failed: 'Fallido',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending_accept: 'border-warn/40 bg-[var(--warn-soft)] text-warn',
  accepted: 'border-brand/40 bg-brand-highlight-soft text-brand',
  preparing: 'border-[color:var(--brand-accent)]/40 bg-brand-highlight-soft text-brand',
  ready_for_pickup: 'border-ok/40 bg-[var(--ok-soft)] text-ok',
  dispatched: 'border-hair bg-raised2 text-fg-muted',
  delivered: 'border-ok/40 bg-[var(--ok-soft)] text-ok',
  cancelled: 'border-crit/40 bg-[var(--crit-soft)] text-crit',
  rejected: 'border-crit/40 bg-[var(--crit-soft)] text-crit',
  failed: 'border-crit/40 bg-[var(--crit-soft)] text-crit',
};
