'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Store, TestTube2, UtensilsCrossed, Link2, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { PlanGate } from '@/components/billing/PlanGate';
import { DELIVERY_PROVIDER_META } from '@/components/delivery/DeliveryBrandIcons';
import { DeliveryOrderBoard } from '@/components/delivery/DeliveryOrderBoard';
import { DeliveryConnectionPanel } from '@/components/delivery/DeliveryConnectionPanel';
import type { DeliveryIntegration, DeliveryOrder, DeliveryProvider } from '@/lib/delivery';

type Tab = 'overview' | 'orders' | 'menu' | 'mappings' | 'settings';

type MenuItem = {
  id: string;
  externalSku: string | null;
  name: string;
  category: string | null;
  price: string | number | null;
  available: boolean;
  product?: { id: string; name: string } | null;
};

type Mapping = {
  id: string;
  externalSku: string;
  externalName: string | null;
  productId: string | null;
  active: boolean;
  product?: { id: string; name: string; barcode: string | null } | null;
};

export function DeliveryProviderModule({
  provider,
  Icon,
}: {
  provider: DeliveryProvider;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const meta = DELIVERY_PROVIDER_META[provider];
  const [tab, setTab] = useState<Tab>('overview');
  const [integration, setIntegration] = useState<DeliveryIntegration | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? hasLoadedRef.current;
      if (silent) setRefreshing(true);
      else setInitialLoading(true);
      try {
        const [integ, orderList] = await Promise.all([
          api<DeliveryIntegration>(`/delivery/integrations/${provider}`),
          api<{ items: DeliveryOrder[] }>('/delivery/orders', { params: { provider, limit: '40' } }),
        ]);
        setIntegration(integ);
        setOrders(orderList.items);
        hasLoadedRef.current = true;
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [provider],
  );

  const loadMenu = useCallback(async () => {
    setMenu(await api<MenuItem[]>(`/delivery/integrations/${provider}/menu`));
  }, [provider]);

  const loadMappings = useCallback(async () => {
    setMappings(await api<Mapping[]>(`/delivery/integrations/${provider}/mappings`));
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'overview' && tab !== 'orders') return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load({ silent: true });
    }, 60000);
    return () => clearInterval(t);
  }, [load, tab]);

  useEffect(() => {
    if (tab === 'menu') void loadMenu();
    if (tab === 'mappings') void loadMappings();
  }, [tab, loadMenu, loadMappings]);

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setBusyAction(key);
    try {
      await fn();
      await load({ silent: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusyAction(null);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Resumen', icon: Store },
    { id: 'orders', label: 'Pedidos', icon: UtensilsCrossed },
    { id: 'menu', label: 'Menú', icon: Settings2 },
    { id: 'mappings', label: 'Mapeos', icon: Link2 },
    { id: 'settings', label: 'Conexión', icon: Settings2 },
  ];

  return (
    <PlanGate feature="deliveryIntegrations">
      <Container className="space-y-6">
        <PageHeader
          title={meta.label}
          subtitle={`Módulo dedicado de ${meta.label}. Pedidos, menú, mapeos y conexión API.`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href="/delivery" className="rounded-xl border border-hair bg-raised px-4 py-2.5 text-sm font-medium hover:bg-raised2">
                Central de pedidos
              </Link>
              <button
                type="button"
                onClick={() => void load({ silent: true })}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-hair bg-raised px-4 py-2.5 text-sm disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-hair-soft bg-surface p-4">
          <Icon className="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-fg-faint">Estado de la integración</p>
            <p className="text-lg font-semibold text-fg">
              {integration?.enabled
                ? integration.storeOpen
                  ? 'Activa · tienda abierta'
                  : 'Activa · tienda cerrada'
                : 'Inactiva'}
            </p>
          </div>
          <button
            type="button"
            disabled={!integration?.enabled || busyAction === 'store'}
            onClick={() =>
              void runAction('store', () =>
                api(`/delivery/integrations/${provider}/store-open`, {
                  method: 'POST',
                  body: JSON.stringify({ open: !integration?.storeOpen }),
                }),
              )
            }
            className="rounded-xl border border-hair px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {integration?.storeOpen ? 'Cerrar tienda' : 'Abrir tienda'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === t.id ? 'text-white' : 'border border-hair bg-raised text-fg-muted'}`}
              style={tab === t.id ? { background: meta.color } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        {initialLoading ? (
          <Loader label={meta.label} />
        ) : (
          <>
            {tab === 'overview' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border border-hair-soft bg-surface p-5 space-y-3">
                  <h2 className="font-semibold text-fg">Acciones rápidas</h2>
                  <button
                    type="button"
                    disabled={busyAction === 'simulate'}
                    onClick={() =>
                      void runAction('simulate', () =>
                        api(`/delivery/integrations/${provider}/simulate`, { method: 'POST', body: '{}' }),
                      )
                    }
                    className="flex w-full items-center gap-2 rounded-xl border border-hair bg-raised px-4 py-3 text-left text-sm hover:bg-raised2"
                  >
                    <TestTube2 className="h-4 w-4" />
                    Simular pedido entrante
                  </button>
                  <button
                    type="button"
                    disabled={busyAction === 'menu'}
                    onClick={() =>
                      void runAction('menu', () =>
                        api(`/delivery/integrations/${provider}/menu/sync-products`, { method: 'POST' }),
                      )
                    }
                    className="flex w-full items-center gap-2 rounded-xl border border-hair bg-raised px-4 py-3 text-left text-sm hover:bg-raised2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Sincronizar menú desde productos
                  </button>
                </section>
                <section className="rounded-2xl border border-hair-soft bg-surface p-5">
                  <h2 className="font-semibold text-fg">Últimos pedidos</h2>
                  <div className="mt-3">
                    <DeliveryOrderBoard orders={orders.slice(0, 6)} onRefresh={() => load({ silent: true })} />
                  </div>
                </section>
              </div>
            )}

            {tab === 'orders' && <DeliveryOrderBoard orders={orders} onRefresh={() => load({ silent: true })} />}

            {tab === 'menu' && (
              <section className="rounded-2xl border border-hair-soft bg-surface p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-fg">Menú en {meta.label}</h2>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void loadMenu()} className="rounded-lg border border-hair px-3 py-2 text-sm">
                      Recargar
                    </button>
                    <button
                      type="button"
                      disabled={busyAction === 'push'}
                      onClick={() =>
                        void runAction('push', () =>
                          api(`/delivery/integrations/${provider}/menu/push`, { method: 'POST' }),
                        )
                      }
                      className="btn-brand rounded-lg px-3 py-2 text-sm font-semibold"
                    >
                      Enviar a plataforma
                    </button>
                  </div>
                </div>
                {!menu.length ? (
                  <p className="py-8 text-center text-sm text-fg-faint">Sin ítems. Sincronizá desde Productos.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="text-left text-xs uppercase text-fg-faint">
                        <tr>
                          <th className="p-2">SKU</th>
                          <th className="p-2">Nombre</th>
                          <th className="p-2">Categoría</th>
                          <th className="p-2">Producto local</th>
                          <th className="p-2">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hair-soft">
                        {menu.map((item) => (
                          <tr key={item.id}>
                            <td className="p-2 font-mono text-xs">{item.externalSku || '—'}</td>
                            <td className="p-2">{item.name}</td>
                            <td className="p-2 text-fg-muted">{item.category || '—'}</td>
                            <td className="p-2 text-fg-muted">{item.product?.name || '—'}</td>
                            <td className="p-2">{item.available ? 'Disponible' : 'Pausado'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {tab === 'mappings' && (
              <section className="rounded-2xl border border-hair-soft bg-surface p-4">
                <h2 className="font-semibold text-fg">Mapeo SKU → producto local</h2>
                <p className="mt-1 text-sm text-fg-faint">
                  Vinculá los códigos de {meta.label} con tu inventario para bajar stock automáticamente.
                </p>
                {!mappings.length ? (
                  <p className="py-8 text-center text-sm text-fg-faint">Todavía no hay mapeos manuales. Se intenta matchear por código de barras automáticamente.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-hair-soft">
                    {mappings.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span className="font-mono">{m.externalSku}</span>
                        <span className="text-fg-muted">{m.product?.name || 'Sin producto'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {tab === 'settings' && (
              <DeliveryConnectionPanel
                key={`${provider}-${integration?.id ?? 'new'}`}
                provider={provider}
                integration={integration}
                onSaved={() => load({ silent: true })}
              />
            )}
          </>
        )}
      </Container>
    </PlanGate>
  );
}
