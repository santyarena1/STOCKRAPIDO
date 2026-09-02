export const DELIVERY_PROVIDERS = ['rappi', 'pedidosya'] as const;
export type DeliveryProviderId = (typeof DELIVERY_PROVIDERS)[number];

export const DELIVERY_ORDER_STATUSES = [
  'pending_accept',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'dispatched',
  'delivered',
  'cancelled',
  'rejected',
  'failed',
] as const;

export type DeliveryOrderStatus = (typeof DELIVERY_ORDER_STATUSES)[number];

export const ACTIVE_DELIVERY_STATUSES: DeliveryOrderStatus[] = [
  'pending_accept',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'dispatched',
];

export const PROVIDER_LABELS: Record<DeliveryProviderId, string> = {
  rappi: 'Rappi',
  pedidosya: 'PedidosYa',
};

export const PROVIDER_COLORS: Record<DeliveryProviderId, string> = {
  rappi: '#FF441F',
  pedidosya: '#FA0050',
};

export function isDeliveryProvider(value: string): value is DeliveryProviderId {
  return (DELIVERY_PROVIDERS as readonly string[]).includes(value);
}
