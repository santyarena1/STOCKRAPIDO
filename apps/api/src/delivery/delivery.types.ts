import type { DeliveryOrderStatus, DeliveryProviderId } from './delivery.constants';

export type NormalizedDeliveryItem = {
  externalItemId?: string;
  externalSku?: string;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
};

export type NormalizedDeliveryOrder = {
  externalOrderId: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  paymentMethod?: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  currency?: string;
  scheduledFor?: Date;
  placedAt?: Date;
  items: NormalizedDeliveryItem[];
  raw: unknown;
};

export type DeliveryWebhookContext = {
  integrationId: string;
  businessId: string;
  provider: DeliveryProviderId;
  webhookSecret: string;
  credentials?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type DeliveryStatusUpdate = {
  orderId: string;
  status: DeliveryOrderStatus;
  reason?: string;
  prepMinutes?: number;
};
