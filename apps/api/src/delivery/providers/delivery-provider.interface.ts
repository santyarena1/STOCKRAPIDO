import type { DeliveryProviderId } from '../delivery.constants';
import type { DeliveryWebhookContext, NormalizedDeliveryOrder } from '../delivery.types';

export interface DeliveryProviderAdapter {
  readonly id: DeliveryProviderId;
  verifyWebhook(
    ctx: DeliveryWebhookContext,
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): boolean;
  parseIncomingOrder(body: unknown): NormalizedDeliveryOrder | null;
  parseStatusEvent(body: unknown): { externalOrderId: string; status: string; reason?: string } | null;
  acceptOrder(ctx: DeliveryWebhookContext, externalOrderId: string, prepMinutes?: number): Promise<void>;
  rejectOrder(ctx: DeliveryWebhookContext, externalOrderId: string, reason?: string): Promise<void>;
  markPreparing(ctx: DeliveryWebhookContext, externalOrderId: string): Promise<void>;
  markReady(ctx: DeliveryWebhookContext, externalOrderId: string): Promise<void>;
  markDispatched(ctx: DeliveryWebhookContext, externalOrderId: string): Promise<void>;
  cancelOrder(ctx: DeliveryWebhookContext, externalOrderId: string, reason?: string): Promise<void>;
  setStoreOpen(ctx: DeliveryWebhookContext, open: boolean): Promise<void>;
  pushMenu(ctx: DeliveryWebhookContext, items: unknown[]): Promise<{ ok: boolean; message?: string }>;
}
