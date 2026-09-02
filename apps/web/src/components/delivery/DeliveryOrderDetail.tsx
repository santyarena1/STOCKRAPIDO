'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';
import { Loader } from '@/components/ui/Loader';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, type DeliveryOrder } from '@/lib/delivery';

export function DeliveryOrderDetail({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setOrder(await api<DeliveryOrder>(`/delivery/orders/${orderId}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [orderId]);

  const act = async (path: string, body?: object) => {
    setBusy(true);
    try {
      await api(`/delivery/orders/${orderId}/${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) });
      await load();
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-hair bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Pedido delivery</p>
            <h2 className="text-xl font-semibold text-fg">{order?.customerName || 'Cargando…'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5 text-fg-muted" />
          </button>
        </div>

        {loading || !order ? (
          <div className="py-10">
            <Loader size="sm" />
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-md border px-2 py-1 text-xs font-bold ${ORDER_STATUS_COLORS[order.status] ?? ''}`}>
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </span>
              <span className="rounded-md border border-hair bg-raised px-2 py-1 font-mono text-xs">#{order.externalOrderId}</span>
            </div>

            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-fg-faint">Teléfono</dt>
                <dd>{order.customerPhone || '—'}</dd>
              </div>
              <div>
                <dt className="text-fg-faint">Total</dt>
                <dd className="font-mono font-bold text-brand">{formatMoneyArs(Number(order.total))}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-fg-faint">Dirección</dt>
                <dd>{order.deliveryAddress || '—'}</dd>
              </div>
              {order.deliveryNotes && (
                <div className="sm:col-span-2">
                  <dt className="text-fg-faint">Notas</dt>
                  <dd>{order.deliveryNotes}</dd>
                </div>
              )}
            </dl>

            <ul className="mt-4 divide-y divide-hair-soft rounded-xl border border-hair-soft">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-fg-faint">
                      ×{item.qty}
                      {item.externalSku ? ` · ${item.externalSku}` : ''}
                      {!item.mapped && <span className="text-warn"> · sin mapear</span>}
                    </p>
                  </div>
                  <span className="font-mono">{formatMoneyArs(Number(item.subtotal))}</span>
                </li>
              ))}
            </ul>

            {order.sale?.id && (
              <Link href={`/ventas`} className="mt-3 inline-block text-sm text-brand hover:underline">
                Ver venta registrada
              </Link>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {order.status === 'pending_accept' && (
                <>
                  <button type="button" disabled={busy} onClick={() => void act('accept', { prepMinutes: 15 })} className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold">
                    Aceptar
                  </button>
                  <button type="button" disabled={busy} onClick={() => void act('reject', { reason: 'Sin stock' })} className="rounded-lg border border-hair px-4 py-2 text-sm">
                    Rechazar
                  </button>
                </>
              )}
              {order.status === 'accepted' && (
                <button type="button" disabled={busy} onClick={() => void act('preparing')} className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold">
                  En preparación
                </button>
              )}
              {order.status === 'preparing' && (
                <button type="button" disabled={busy} onClick={() => void act('ready')} className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold">
                  Listo para retiro
                </button>
              )}
              {order.status === 'ready_for_pickup' && (
                <button type="button" disabled={busy} onClick={() => void act('dispatch')} className="rounded-lg border border-hair px-4 py-2 text-sm">
                  Despachado
                </button>
              )}
              {order.status === 'dispatched' && (
                <button type="button" disabled={busy} onClick={() => void act('deliver')} className="rounded-lg border border-hair px-4 py-2 text-sm">
                  Marcar entregado
                </button>
              )}
              {!order.sale?.id && order.status !== 'cancelled' && order.status !== 'rejected' && (
                <button type="button" disabled={busy} onClick={() => void act('convert-sale')} className="rounded-lg border border-hair px-4 py-2 text-sm">
                  Registrar venta + stock
                </button>
              )}
              {!['cancelled', 'rejected', 'delivered'].includes(order.status) && (
                <button type="button" disabled={busy} onClick={() => void act('cancel', { reason: 'Cancelado en local' })} className="rounded-lg border border-crit/30 px-4 py-2 text-sm text-crit">
                  Cancelar
                </button>
              )}
            </div>

            {order.events && order.events.length > 0 && (
              <div className="mt-6 border-t border-hair-soft pt-4">
                <h3 className="text-sm font-semibold text-fg">Historial</h3>
                <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                  {order.events.map((ev) => (
                    <li key={ev.id}>
                      {new Date(ev.createdAt).toLocaleString('es-AR')} — {ev.message || ev.type}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
