'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';
import { DELIVERY_PROVIDER_META, PedidosYaIcon, RappiIcon } from '@/components/delivery/DeliveryBrandIcons';
import { DeliveryOrderDetail } from '@/components/delivery/DeliveryOrderDetail';
import type { DeliveryOrder } from '@/lib/delivery';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/delivery';

export function DeliveryOrderBoard({
  orders,
  onRefresh,
  showProvider = false,
}: {
  orders: DeliveryOrder[];
  onRefresh: () => void | Promise<void>;
  showProvider?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!orders.length) {
    return <p className="py-10 text-center text-sm text-fg-faint">No hay pedidos para estos filtros.</p>;
  }

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => {
          const meta = DELIVERY_PROVIDER_META[order.provider];
          const Icon = order.provider === 'rappi' ? RappiIcon : PedidosYaIcon;
          return (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedId(order.id)}
              className="rounded-xl border border-hair-soft bg-raised p-4 text-left transition hover:border-[color:var(--brand-accent)] hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {showProvider && <Icon className="h-6 w-6 shrink-0" />}
                  <div>
                    <p className="font-semibold text-fg">{order.customerName || 'Cliente delivery'}</p>
                    <p className="font-mono text-[11px] text-fg-faint">#{order.externalOrderId}</p>
                  </div>
                </div>
                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${ORDER_STATUS_COLORS[order.status] ?? ''}`}>
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-fg-muted">{order.deliveryAddress || 'Sin dirección'}</p>
              <div className="mt-3 flex items-center justify-between border-t border-hair-soft pt-3">
                <span className="text-xs text-fg-faint">{order.items.length} ítem(s)</span>
                <span className="font-mono font-bold text-brand">{formatMoneyArs(Number(order.total))}</span>
              </div>
              {!showProvider && (
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
                  {meta.label}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {selectedId && (
        <DeliveryOrderDetail
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void onRefresh()}
        />
      )}
    </>
  );
}
