'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Package, RefreshCw, Store, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { PlanGate } from '@/components/billing/PlanGate';
import { DELIVERY_PROVIDER_META, PedidosYaIcon, RappiIcon } from '@/components/delivery/DeliveryBrandIcons';
import { DeliveryOrderBoard } from '@/components/delivery/DeliveryOrderBoard';
import type { DeliveryOrder } from '@/lib/delivery';

type HubStats = {
  pending: number;
  active: number;
  today: number;
  integrations: { provider: string; enabled: boolean; storeOpen: boolean; lastError: string | null }[];
};

function ProviderStatCard({
  provider,
  integration,
  pending,
}: {
  provider: 'rappi' | 'pedidosya';
  integration?: HubStats['integrations'][number];
  pending: number;
}) {
  const meta = DELIVERY_PROVIDER_META[provider];
  const Icon = provider === 'rappi' ? RappiIcon : PedidosYaIcon;
  return (
    <Link
      href={meta.href}
      className="group rounded-2xl border border-hair-soft bg-surface p-5 transition hover:border-[color:var(--brand-accent)] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className="h-14 w-14" />
          <div>
            <h3 className="text-lg font-semibold text-fg">{meta.label}</h3>
            <p className="text-sm text-fg-faint">
              {integration?.enabled ? (integration.storeOpen ? 'Tienda abierta' : 'Tienda cerrada') : 'Sin configurar'}
            </p>
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-bold"
          style={{ background: meta.soft, color: meta.color }}
        >
          {pending} pend.
        </span>
      </div>
      {integration?.lastError && <p className="mt-3 text-xs text-crit">{integration.lastError}</p>}
      <p className="mt-4 text-sm font-semibold text-brand group-hover:underline">Abrir módulo →</p>
    </Link>
  );
}

export default function DeliveryHubPage() {
  const [stats, setStats] = useState<HubStats | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const hasLoadedRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? hasLoadedRef.current;
      if (silent) setRefreshing(true);
      else setInitialLoading(true);
      try {
        const [hub, list] = await Promise.all([
          api<HubStats>('/delivery/hub/stats'),
          api<{ items: DeliveryOrder[] }>('/delivery/orders', {
            params: {
              provider: provider || undefined,
              status: status || undefined,
              limit: '60',
            },
          }),
        ]);
        setStats(hub);
        setOrders(list.items);
        hasLoadedRef.current = true;
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [provider, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load({ silent: true });
    }, 60000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <PlanGate feature="deliveryIntegrations">
      <Container className="space-y-6">
        <PageHeader
          title="Central de pedidos"
          subtitle="Rappi y PedidosYa en un solo lugar. Cada plataforma también tiene su módulo dedicado."
          actions={
            <button
              type="button"
              onClick={() => void load({ silent: true })}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-hair bg-raised px-4 py-2.5 text-sm font-medium text-fg hover:bg-raised2 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
          }
        />

        {stats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-hair-soft bg-surface p-4">
              <div className="flex items-center gap-2 text-fg-faint">
                <Bell className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Pendientes</span>
              </div>
              <p className="mt-2 font-mono text-3xl font-bold text-warn">{stats.pending}</p>
            </div>
            <div className="rounded-2xl border border-hair-soft bg-surface p-4">
              <div className="flex items-center gap-2 text-fg-faint">
                <Zap className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Activos</span>
              </div>
              <p className="mt-2 font-mono text-3xl font-bold text-brand">{stats.active}</p>
            </div>
            <div className="rounded-2xl border border-hair-soft bg-surface p-4">
              <div className="flex items-center gap-2 text-fg-faint">
                <Package className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Hoy</span>
              </div>
              <p className="mt-2 font-mono text-3xl font-bold text-fg">{stats.today}</p>
            </div>
            <div className="rounded-2xl border border-hair-soft bg-surface p-4">
              <div className="flex items-center gap-2 text-fg-faint">
                <Store className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Plataformas</span>
              </div>
              <p className="mt-2 text-sm text-fg-muted">
                {stats.integrations.filter((i) => i.enabled).length} conectadas
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <ProviderStatCard
            provider="rappi"
            integration={stats?.integrations.find((i) => i.provider === 'rappi')}
            pending={orders.filter((o) => o.provider === 'rappi' && o.status === 'pending_accept').length}
          />
          <ProviderStatCard
            provider="pedidosya"
            integration={stats?.integrations.find((i) => i.provider === 'pedidosya')}
            pending={orders.filter((o) => o.provider === 'pedidosya' && o.status === 'pending_accept').length}
          />
        </div>

        <section className="space-y-4 rounded-2xl border border-hair-soft bg-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <h2 className="text-lg font-semibold text-fg">Bandeja unificada</h2>
              <p className="text-sm text-fg-faint">Todos los pedidos de delivery, filtrables por plataforma y estado.</p>
            </div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-lg border border-hair bg-raised px-3 py-2 text-sm"
            >
              <option value="">Todas las plataformas</option>
              <option value="rappi">Rappi</option>
              <option value="pedidosya">PedidosYa</option>
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-hair bg-raised px-3 py-2 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="pending_accept">Pendientes</option>
              <option value="accepted">Aceptados</option>
              <option value="preparing">Preparando</option>
              <option value="ready_for_pickup">Listos</option>
              <option value="dispatched">Despachados</option>
              <option value="delivered">Entregados</option>
            </select>
          </div>

          {initialLoading ? (
            <Loader label="Pedidos delivery" />
          ) : (
            <DeliveryOrderBoard orders={orders} onRefresh={() => load({ silent: true })} showProvider />
          )}
        </section>
      </Container>
    </PlanGate>
  );
}
