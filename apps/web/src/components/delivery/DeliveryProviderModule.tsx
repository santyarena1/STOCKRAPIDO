'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, RefreshCw, Store, TestTube2, UtensilsCrossed, Link2, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/env-urls';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { PlanGate } from '@/components/billing/PlanGate';
import { DELIVERY_PROVIDER_META } from '@/components/delivery/DeliveryBrandIcons';
import { DeliveryOrderBoard } from '@/components/delivery/DeliveryOrderBoard';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [form, setForm] = useState({
    enabled: false,
    storeExternalId: '',
    chainExternalId: '',
    countryCode: 'AR',
    clientId: '',
    clientSecret: '',
    apiKey: '',
    autoAccept: false,
    autoConfirmSale: true,
    prepMinutesDefault: 15,
  });

  const webhookUrl = useMemo(() => {
    if (!integration?.webhookToken) return '';
    return `${getApiBaseUrl()}/delivery/webhooks/${provider}/${integration.webhookToken}`;
  }, [integration?.webhookToken, provider]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [integ, orderList] = await Promise.all([
        api<DeliveryIntegration>(`/delivery/integrations/${provider}`),
        api<{ items: DeliveryOrder[] }>('/delivery/orders', { params: { provider, limit: '40' } }),
      ]);
      setIntegration(integ);
      setOrders(orderList.items);
      setForm((f) => ({
        ...f,
        enabled: integ.enabled,
        storeExternalId: integ.storeExternalId ?? '',
        chainExternalId: integ.chainExternalId ?? '',
        countryCode: integ.countryCode ?? 'AR',
        autoAccept: integ.autoAccept,
        autoConfirmSale: integ.autoConfirmSale,
        prepMinutesDefault: integ.prepMinutesDefault,
      }));
    } finally {
      setLoading(false);
    }
  }, [provider]);

  const loadMenu = useCallback(async () => {
    setMenu(await api<MenuItem[]>(`/delivery/integrations/${provider}/menu`));
  }, [provider]);

  const loadMappings = useCallback(async () => {
    setMappings(await api<Mapping[]>(`/delivery/integrations/${provider}/mappings`));
  }, [provider]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (tab === 'menu') void loadMenu();
    if (tab === 'mappings') void loadMappings();
  }, [tab, loadMenu, loadMappings]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const credentials: Record<string, string> = {};
      if (form.clientId.trim()) credentials.clientId = form.clientId.trim();
      if (form.clientSecret.trim()) credentials.clientSecret = form.clientSecret.trim();
      if (form.apiKey.trim()) credentials.apiKey = form.apiKey.trim();
      const updated = await api<DeliveryIntegration>(`/delivery/integrations/${provider}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: form.enabled,
          storeExternalId: form.storeExternalId,
          chainExternalId: form.chainExternalId,
          countryCode: form.countryCode,
          autoAccept: form.autoAccept,
          autoConfirmSale: form.autoConfirmSale,
          prepMinutesDefault: form.prepMinutesDefault,
          credentials: Object.keys(credentials).length ? credentials : undefined,
        }),
      });
      setIntegration(updated);
      alert('Configuración guardada');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setBusyAction(key);
    try {
      await fn();
      await load();
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
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-xl border border-hair bg-raised px-4 py-2.5 text-sm"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-hair-soft bg-surface p-4">
          <Icon className="h-12 w-12" />
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

        {loading ? (
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
                    <DeliveryOrderBoard orders={orders.slice(0, 6)} onRefresh={load} />
                  </div>
                </section>
              </div>
            )}

            {tab === 'orders' && <DeliveryOrderBoard orders={orders} onRefresh={load} />}

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
              <section className="space-y-4 rounded-2xl border border-hair-soft bg-surface p-5">
                <h2 className="font-semibold text-fg">Conexión API</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
                  Integración habilitada
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    Store ID
                    <input value={form.storeExternalId} onChange={(e) => setForm((f) => ({ ...f, storeExternalId: e.target.value }))} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" />
                  </label>
                  <label className="block text-sm">
                    Chain ID (PedidosYa)
                    <input value={form.chainExternalId} onChange={(e) => setForm((f) => ({ ...f, chainExternalId: e.target.value }))} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" />
                  </label>
                  <label className="block text-sm">
                    País
                    <input value={form.countryCode} onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" />
                  </label>
                  <label className="block text-sm">
                    Minutos de preparación
                    <input type="number" value={form.prepMinutesDefault} onChange={(e) => setForm((f) => ({ ...f, prepMinutesDefault: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-sm">
                    Client ID
                    <input value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" placeholder={integration?.hasCredentials ? '••••••' : ''} />
                  </label>
                  <label className="block text-sm">
                    Client Secret
                    <input type="password" value={form.clientSecret} onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" />
                  </label>
                  <label className="block text-sm">
                    API Key / Token
                    <input type="password" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2" />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.autoAccept} onChange={(e) => setForm((f) => ({ ...f, autoAccept: e.target.checked }))} />
                  Aceptar pedidos automáticamente
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.autoConfirmSale} onChange={(e) => setForm((f) => ({ ...f, autoConfirmSale: e.target.checked }))} />
                  Registrar venta al marcar listo
                </label>

                {webhookUrl && (
                  <div className="rounded-xl border border-hair bg-raised p-3">
                    <p className="text-xs font-semibold uppercase text-fg-faint">URL webhook (configurar en {meta.label})</p>
                    <div className="mt-2 flex gap-2">
                      <code className="flex-1 break-all text-xs text-fg">{webhookUrl}</code>
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(webhookUrl)}
                        className="shrink-0 rounded-lg border border-hair p-2"
                        aria-label="Copiar"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-fg-faint">
                      Enviá el header <code>X-Webhook-Secret</code> con el secreto de la integración al probar.
                    </p>
                  </div>
                )}

                <button type="button" disabled={saving} onClick={() => void saveSettings()} className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Guardando…' : 'Guardar configuración'}
                </button>
              </section>
            )}
          </>
        )}
      </Container>
    </PlanGate>
  );
}
