import { Logger } from '@nestjs/common';
import type { DeliveryProviderAdapter } from './delivery-provider.interface';
import type { DeliveryWebhookContext, NormalizedDeliveryOrder } from '../delivery.types';

const logger = new Logger('DeliveryProvider');

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown) {
  return typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : '';
}

export function verifySharedSecret(
  ctx: DeliveryWebhookContext,
  headers: Record<string, string | string[] | undefined>,
) {
  const headerSecret =
    (typeof headers['x-webhook-secret'] === 'string' && headers['x-webhook-secret']) ||
    (typeof headers['x-delivery-secret'] === 'string' && headers['x-delivery-secret']) ||
    (typeof headers['authorization'] === 'string' && headers['authorization'].replace(/^Bearer\s+/i, '')) ||
    '';
  if (!ctx.webhookSecret) return false;
  return headerSecret === ctx.webhookSecret;
}

const ACTION_PATHS: Record<string, string> = {
  accept: 'orders/accept',
  reject: 'orders/reject',
  preparing: 'orders/preparing',
  ready: 'orders/ready',
  dispatched: 'orders/dispatched',
  cancel: 'orders/cancel',
  store_open: 'store/open',
  store_close: 'store/close',
  push_menu: 'menu/push',
};

function authHeaders(creds: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (creds.apiKey) headers.Authorization = `Bearer ${String(creds.apiKey)}`;
  else if (creds.accessToken) headers.Authorization = `Bearer ${String(creds.accessToken)}`;
  else if (creds.clientId && creds.clientSecret) {
    const token = Buffer.from(`${String(creds.clientId)}:${String(creds.clientSecret)}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
  }
  return headers;
}

export async function callProviderApi(
  provider: string,
  action: string,
  ctx: DeliveryWebhookContext,
  payload?: Record<string, unknown>,
) {
  const creds = ctx.credentials ?? {};
  const hasCreds = Boolean(creds.clientId || creds.apiKey || creds.accessToken || creds.clientSecret);
  const apiBaseUrl = str(ctx.config?.apiBaseUrl).replace(/\/$/, '');

  if (!hasCreds || !apiBaseUrl) {
    logger.log(
      `[${provider}] ${action} (simulado) order=${payload?.externalOrderId ?? '—'} creds=${hasCreds} baseUrl=${apiBaseUrl ? 'sí' : 'no'}`,
    );
    return { ok: true, simulated: true };
  }

  const path = ACTION_PATHS[action] ?? action.replace(/_/g, '/');
  const url = `${apiBaseUrl}/${path}`;
  const body = { provider, integrationId: ctx.integrationId, ...payload };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(creds),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      logger.warn(`[${provider}] ${action} HTTP ${res.status}: ${text.slice(0, 300)}`);
      throw new Error(`API ${provider} respondió ${res.status}`);
    }
    logger.log(`[${provider}] ${action} OK → ${url}`);
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: true, raw: text };
    }
  } catch (err) {
    logger.error(`[${provider}] ${action} error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

export function parseGenericOrder(body: unknown, provider: string): NormalizedDeliveryOrder | null {
  const root = asRecord(body);
  const order = asRecord(root.order ?? root.data ?? root.payload ?? root);
  const externalOrderId = str(order.externalOrderId ?? order.order_id ?? order.orderId ?? order.id);
  if (!externalOrderId) return null;

  const itemsRaw = asArray<Record<string, unknown>>(order.items ?? order.products ?? order.lines);
  const items = itemsRaw.map((item) => {
    const qty = Math.max(1, Math.round(num(item.qty ?? item.quantity ?? item.amount, 1)));
    const unitPrice = num(item.unitPrice ?? item.unit_price ?? item.price, 0);
    const subtotal = num(item.subtotal ?? item.total, unitPrice * qty);
    return {
      externalItemId: str(item.id ?? item.item_id) || undefined,
      externalSku: str(item.sku ?? item.externalSku ?? item.barcode) || undefined,
      name: str(item.name ?? item.title) || 'Ítem',
      qty,
      unitPrice,
      subtotal,
      notes: str(item.notes ?? item.comment) || undefined,
    };
  });

  return {
    externalOrderId,
    customerName: str(order.customerName ?? order.customer_name ?? order.buyer_name) || undefined,
    customerPhone: str(order.customerPhone ?? order.customer_phone ?? order.phone) || undefined,
    deliveryAddress: str(order.deliveryAddress ?? order.address ?? order.delivery_address) || undefined,
    deliveryNotes: str(order.deliveryNotes ?? order.notes ?? order.comments) || undefined,
    paymentMethod: str(order.paymentMethod ?? order.payment_method) || provider,
    subtotal: num(order.subtotal, items.reduce((s, i) => s + i.subtotal, 0)),
    deliveryFee: num(order.deliveryFee ?? order.delivery_fee ?? order.shipping, 0),
    discount: num(order.discount, 0),
    total: num(order.total ?? order.total_amount, items.reduce((s, i) => s + i.subtotal, 0)),
    currency: str(order.currency) || 'ARS',
    placedAt: order.placedAt || order.placed_at ? new Date(String(order.placedAt ?? order.placed_at)) : new Date(),
    items,
    raw: body,
  };
}

export function createProviderStub(
  id: DeliveryProviderAdapter['id'],
  overrides?: Partial<DeliveryProviderAdapter>,
): DeliveryProviderAdapter {
  return {
    id,
    verifyWebhook: (ctx, _body, headers) => verifySharedSecret(ctx, headers),
    parseIncomingOrder: (body) => {
      const event = asRecord(body).event ?? asRecord(body).type;
      if (event && String(event).toLowerCase().includes('cancel')) return null;
      return parseGenericOrder(body, id);
    },
    parseStatusEvent: (body) => {
      const root = asRecord(body);
      const externalOrderId = str(
        root.externalOrderId ?? root.order_id ?? asRecord(root.order).id ?? asRecord(root.data).order_id,
      );
      const status = str(root.status ?? root.event ?? root.type);
      if (!externalOrderId || !status) return null;
      return { externalOrderId, status, reason: str(root.reason ?? root.cancel_reason) || undefined };
    },
    acceptOrder: async (ctx, externalOrderId, prepMinutes) => {
      await callProviderApi(id, 'accept', ctx, { externalOrderId, prepMinutes });
    },
    rejectOrder: async (ctx, externalOrderId, reason) => {
      await callProviderApi(id, 'reject', ctx, { externalOrderId, reason });
    },
    markPreparing: async (ctx, externalOrderId) => {
      await callProviderApi(id, 'preparing', ctx, { externalOrderId });
    },
    markReady: async (ctx, externalOrderId) => {
      await callProviderApi(id, 'ready', ctx, { externalOrderId });
    },
    markDispatched: async (ctx, externalOrderId) => {
      await callProviderApi(id, 'dispatched', ctx, { externalOrderId });
    },
    cancelOrder: async (ctx, externalOrderId, reason) => {
      await callProviderApi(id, 'cancel', ctx, { externalOrderId, reason });
    },
    setStoreOpen: async (ctx, open) => {
      await callProviderApi(id, open ? 'store_open' : 'store_close', ctx, { open });
    },
    pushMenu: async (ctx, items) => {
      await callProviderApi(id, 'push_menu', ctx, { count: items.length, items });
      return { ok: true, message: `${items.length} ítems enviados a la plataforma` };
    },
    ...overrides,
  };
}
