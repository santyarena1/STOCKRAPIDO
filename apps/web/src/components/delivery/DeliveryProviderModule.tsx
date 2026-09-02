'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Megaphone, RefreshCw, Store, TestTube2, UtensilsCrossed, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { PlanGate } from '@/components/billing/PlanGate';
import { DELIVERY_PROVIDER_META } from '@/components/delivery/DeliveryBrandIcons';
import { DeliveryOrderBoard } from '@/components/delivery/DeliveryOrderBoard';
import { DeliveryConnectionPanel } from '@/components/delivery/DeliveryConnectionPanel';
import { DeliveryPublishPanel } from '@/components/delivery/DeliveryPublishPanel';
import type { DeliveryIntegration, DeliveryOrder, DeliveryProvider } from '@/lib/delivery';

type Tab = 'overview' | 'orders' | 'publish' | 'settings';

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
    { id: 'publish', label: 'Publicar', icon: Megaphone },
    { id: 'settings', label: 'Conexión', icon: Settings2 },
  ];

  return (
    <PlanGate feature="deliveryIntegrations">
      <Container className="space-y-6">
        <PageHeader
          title={meta.label}
          subtitle={`Módulo dedicado de ${meta.label}: pedidos, publicación de catálogo y conexión API.`}
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
                    onClick={() => setTab('publish')}
                    className="flex w-full items-center gap-2 rounded-xl border border-hair bg-raised px-4 py-3 text-left text-sm hover:bg-raised2"
                  >
                    <Megaphone className="h-4 w-4" />
                    Ir a publicar catálogo
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

            {tab === 'publish' && (
              <DeliveryPublishPanel
                provider={provider}
                markupPercent={integration?.priceMarkupPercent ?? 0}
                commissionPercent={integration?.platformCommissionPercent ?? 28}
              />
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
