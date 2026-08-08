'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, getApiBaseUrl } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { usePersistedState } from '@/lib/use-persisted-state';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Connection = {
  id: string;
  provider: string;
  name: string;
  priceMarkup: string | number;
  autoSync: boolean;
  enabled?: boolean;
  lastSyncAt?: string | null;
  lastStatus?: string | null;
  _count?: { items: number };
};

type Synced = {
  id: string;
  name?: string;
  ean?: string;
  eanUnit?: string;
  eanBox?: string;
  supplierRef?: string;
  ivaAlicuota?: unknown;
  unitsPerDisplay?: string | null;
  displaysPerBox?: string | null;
  retornable?: boolean | null;
  basePrice?: unknown;
  brand?: string;
  category?: string;
  subcategory?: string;
  cost?: unknown;
  listPrice?: unknown;
  available?: boolean;
  stock?: unknown;
  unitsPerBox?: string | null;
  unitsPerBoxNum?: number | null;
  costBulk?: number | null;
  costUnit?: number | null;
  saleUnit?: number | null;
  weight?: string;
  format?: string;
  flavor?: string;
  presentation?: string;
  sku?: string;
  externalId?: string;
  imageUrl?: string;
  link?: string;
  linkedProductId?: string | null;
  variants?: Array<{
    id: string;
    uom: string;
    multiplier: number;
    skuId?: string | null;
    refId?: string | null;
    ean?: string | null;
    listPrice?: unknown;
    sellingPrice?: unknown;
    priceWithTax?: unknown;
    cost?: unknown;
    stock?: number | null;
    taxAlicuota?: unknown;
    sellerId?: string | null;
    erpStatus?: string | null;
  }>;
};

type SupplierAccount = {
  id: string;
  clienteId?: string | null;
  razonSocial?: string | null;
  balance?: unknown;
  creditLimit?: unknown;
  availableCredit?: unknown;
  loyaltyPoints?: number | null;
  currency?: string | null;
  updatedAt: string;
  invoices: Array<{ id: string; number?: string | null; date?: string | null; dueDate?: string | null; total?: unknown; saldoPendiente?: unknown; status?: string | null; pdfUrl?: string | null }>;
  movements: Array<{ id: string; date?: string | null; type?: string | null; reference?: string | null; amount?: unknown; runningBalance?: unknown }>;
  credits: Array<{ id: string; tipo?: string | null; montoDisponible?: unknown; montoUsado?: unknown; vencimiento?: string | null; condiciones?: string | null }>;
};
type SupplierOrder = { id: string; source: 'harvested' | 'draft'; externalOrderId?: string | null; status?: string | null; total?: unknown; deliveryDate?: string | null; tracking?: string | null; placedAt?: string | null; createdAt: string; items: Array<{ id: string; syncedProductId?: string | null; name?: string | null; uom?: string | null; qty: number; unitPrice?: unknown; total?: unknown }> };
type DraftLine = { syncedProductId: string; name: string; uom: string; qty: number; unitPrice: number; variants: Array<{ uom: string; sellingPrice?: unknown; cost?: unknown }> };
type PriceHistoryPoint = { capturedAt: string; cost?: unknown; listPrice?: unknown; sellingPrice?: unknown };
type PriceChange = { syncedProductId: string; name: string; from: number; to: number; changePct: number; direction: 'up' | 'down' };

const PROVIDERS: Record<
  string,
  { label: string; description: string; accent: string; runnerNote: string }
> = {
  mondelez: {
    label: 'Mondelez',
    description: 'Catálogo VTEX + precio B2B real vía runner local',
    accent: 'border-amber-500/40 bg-amber-900/10',
    runnerNote:
      'El precio real lo trae el runner Python con tu login de Mi Tienda Mondelez. El catálogo público (botón de arriba) no incluye costos.',
  },
  juntosplus: {
    label: 'Juntos+',
    description: 'Catálogo Coca-Cola FEMSA vía runner local',
    accent: 'border-crit/40 bg-[var(--crit-soft)]',
    runnerNote:
      'Juntos+ requiere login interactivo con OTP. Ejecutá el runner local, iniciá sesión y entrá al catálogo para traer productos y precios B2B.',
  },
  tokin: {
    label: 'Tokin (Arcor)',
    description: 'Catálogo Tokin con variantes UN/DI/BU vía runner local',
    accent: 'border-warn/40 bg-[var(--warn-soft)]',
    runnerNote:
      'Tokin se obtiene navegando el catálogo con el runner local, que captura productos, códigos y variantes UN/DI/BU.',
  },
};

const DEFAULT_CONNECTIONS = [
  { provider: 'mondelez', name: 'Mondelez', priceMarkup: 40 },
  { provider: 'juntosplus', name: 'Juntos+', priceMarkup: 40 },
  { provider: 'tokin', name: 'Tokin (Arcor)', priceMarkup: 40 },
];

const RUNNER_FILES: Record<string, string> = {
  mondelez: 'mondelez_sync_runner.py',
  juntosplus: 'juntosplus_sync_runner.py',
  tokin: 'tokin_sync_runner.py',
};

function formatOptionalMoney(value: unknown) {
  const amount = Number(value);
  return value != null && Number.isFinite(amount) ? formatMoneyArs(amount) : '—';
}

export default function SincronizacionesPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeId, setActiveId] = usePersistedState<string | null>('sr-filters:sincronizaciones:connection', null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [items, setItems] = useState<Synced[]>([]);
  const [q, setQ] = usePersistedState('sr-filters:sincronizaciones:q', '');
  const [onlyWithCost, setOnlyWithCost] = usePersistedState('sr-filters:sincronizaciones:only-with-cost', false);
  const [showInternal, setShowInternal] = usePersistedState('sr-filters:sincronizaciones:show-internal', false);
  const [detail, setDetail] = useState<Synced | null>(null);
  const [account, setAccount] = useState<SupplierAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [historyOrders, setHistoryOrders] = useState<SupplierOrder[]>([]);
  const [draftOrders, setDraftOrders] = useState<SupplierOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [draftDeliveryDate, setDraftDeliveryDate] = useState('');
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [priceChangesLoading, setPriceChangesLoading] = useState(false);
  const [priceDays, setPriceDays] = useState(30);
  const [priceThreshold, setPriceThreshold] = useState(10);

  const conn = connections.find((c) => c.id === activeId) ?? connections[0] ?? null;
  const providerMeta = PROVIDERS[conn?.provider ?? ''] ?? {
    label: conn?.name ?? 'Proveedor',
    description: 'Sincronización de catálogo',
    accent: 'border-hair bg-raised',
    runnerNote: '',
  };
  const apiBase = useMemo(() => {
    try {
      return getApiBaseUrl();
    } catch {
      return '';
    }
  }, []);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      let conns = await api<Connection[]>('/sync/connections');
      for (const definition of DEFAULT_CONNECTIONS) {
        if (!conns.some((item) => item.provider === definition.provider)) {
          const created = await api<Connection>('/sync/connections', {
            method: 'POST',
            body: JSON.stringify(definition),
          });
          conns = [...conns, created];
        }
      }
      setConnections(conns);
      setActiveId((prev) => prev && conns.some((c) => c.id === prev) ? prev : conns[0]?.id ?? null);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    if (!conn) return;
    try {
      const data = await api<Synced[]>(`/sync/connections/${conn.id}/products`, {
        params: { q: q || undefined, onlyWithCost: onlyWithCost ? 'true' : undefined },
      });
      setItems(data);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }, [conn, q, onlyWithCost]);

  const loadAccount = useCallback(async () => {
    if (!conn) { setAccount(null); return; }
    setAccountLoading(true);
    try {
      setAccount(await api<SupplierAccount | null>(`/sync/connections/${conn.id}/account`));
    } catch {
      setAccount(null);
    } finally {
      setAccountLoading(false);
    }
  }, [conn]);

  const loadOrders = useCallback(async () => {
    if (!conn) { setHistoryOrders([]); setDraftOrders([]); return; }
    setOrdersLoading(true);
    try {
      const [history, drafts] = await Promise.all([
        api<SupplierOrder[]>(`/sync/connections/${conn.id}/orders`, { params: { source: 'harvested' } }),
        api<SupplierOrder[]>(`/sync/connections/${conn.id}/orders`, { params: { source: 'draft' } }),
      ]);
      setHistoryOrders(history); setDraftOrders(drafts);
    } catch { setHistoryOrders([]); setDraftOrders([]); }
    finally { setOrdersLoading(false); }
  }, [conn]);

  const loadPriceChanges = useCallback(async () => {
    if (!conn) { setPriceChanges([]); return; }
    setPriceChangesLoading(true);
    try { setPriceChanges(await api<PriceChange[]>(`/sync/connections/${conn.id}/price-changes`, { params: { days: String(priceDays), threshold: String(priceThreshold) } })); }
    catch { setPriceChanges([]); }
    finally { setPriceChangesLoading(false); }
  }, [conn, priceDays, priceThreshold]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);
  useEffect(() => { loadOrders(); setDraftLines([]); }, [loadOrders]);
  useEffect(() => { loadPriceChanges(); }, [loadPriceChanges]);
  useEffect(() => {
    if (!conn || !detail) { setPriceHistory([]); return; }
    setPriceHistoryLoading(true);
    api<PriceHistoryPoint[]>(`/sync/connections/${conn.id}/products/${detail.id}/price-history`)
      .then(setPriceHistory).catch(() => setPriceHistory([])).finally(() => setPriceHistoryLoading(false));
  }, [conn, detail]);

  const withCost = items.filter((i) => i.costUnit != null).length;
  const linked = items.filter((i) => i.linkedProductId).length;
  const mk = Number(conn?.priceMarkup) || 0;

  const run = async (kind: 'run' | 'import') => {
    if (!conn) return;
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === 'run') {
        const r = await api<{ itemsUpserted: number }>(`/sync/connections/${conn.id}/run`, { method: 'POST' });
        setMsg({ type: 'ok', text: `Catálogo sincronizado: ${r.itemsUpserted} productos (sin precio B2B).` });
      } else {
        const r = await api<{ created: number; updated: number; skipped: number }>(
          `/sync/connections/${conn.id}/import`,
          { method: 'POST', body: JSON.stringify({ onlyWithCost: true }) },
        );
        setMsg({
          type: 'ok',
          text: `Importados: ${r.created} nuevos, ${r.updated} actualizados, ${r.skipped} omitidos (precios unitarios).`,
        });
      }
      await loadConnections();
      await loadItems();
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const addDraftProduct = (product: Synced) => {
    if (draftLines.some((line) => line.syncedProductId === product.id)) return;
    const variants = (product.variants ?? []).map((variant) => ({ uom: variant.uom, sellingPrice: variant.sellingPrice, cost: variant.cost }));
    const first = variants[0];
    setDraftLines((current) => [...current, { syncedProductId: product.id, name: product.name ?? 'Producto', uom: first?.uom ?? 'UN', qty: 1, unitPrice: Number(first?.sellingPrice ?? product.costUnit ?? 0), variants }]);
  };
  const saveDraft = async () => {
    if (!conn || !draftLines.length) return;
    setBusy('draft'); setMsg(null);
    try {
      await api(`/sync/connections/${conn.id}/orders/draft`, { method: 'POST', body: JSON.stringify({ deliveryDate: draftDeliveryDate || undefined, items: draftLines.map(({ syncedProductId, uom, qty, unitPrice }) => ({ syncedProductId, uom, qty, unitPrice })) }) });
      setDraftLines([]); setDraftDeliveryDate(''); setMsg({ type: 'ok', text: 'Borrador de pedido guardado.' }); await loadOrders();
    } catch (error) { setMsg({ type: 'err', text: (error as Error).message }); }
    finally { setBusy(null); }
  };
  const deleteDraft = async (orderId: string) => {
    if (!conn || !confirm('¿Borrar este borrador de pedido?')) return;
    try { await api(`/sync/connections/${conn.id}/orders/${orderId}`, { method: 'DELETE' }); await loadOrders(); }
    catch (error) { alert((error as Error).message); }
  };
  const orderProducts = items.filter((product) => !orderSearch.trim() || `${product.name ?? ''} ${product.eanUnit ?? product.ean ?? ''} ${product.sku ?? ''}`.toLowerCase().includes(orderSearch.toLowerCase())).slice(0, 8);
  const priceChartData = priceHistory.filter((point) => point.cost != null && Number.isFinite(Number(point.cost))).map((point) => ({ date: new Date(point.capturedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), cost: Number(point.cost) }));
  const totalPriceChange = priceChartData.length > 1 && priceChartData[0].cost !== 0 ? ((priceChartData[priceChartData.length - 1].cost - priceChartData[0].cost) / priceChartData[0].cost) * 100 : null;
  const lastPriceChange = priceChartData.length > 1 && priceChartData[priceChartData.length - 2].cost !== 0 ? ((priceChartData[priceChartData.length - 1].cost - priceChartData[priceChartData.length - 2].cost) / priceChartData[priceChartData.length - 2].cost) * 100 : null;

  if (loading) {
    return <Loader full label="Sincronizaciones" />;
  }

  return (
    <Container className="max-w-[1600px] space-y-6">
      <PageHeader
        title="Sincronizaciones"
        subtitle="Catálogo de proveedores → productos con precios unitarios en POS y listado. Los valores por bulto quedan como referencia interna."
        actions={<Link href="/config/proveedores" className="rounded-lg border border-hair px-4 py-2 text-sm font-medium text-fg-muted hover:bg-raised hover:text-fg">Configurar credenciales, mapeo y frecuencia →</Link>}
      />

      {msg && (
        <div
          className={`rounded-lg border text-sm px-4 py-3 ${
            msg.type === 'ok'
              ? 'border-ok/30 bg-[var(--ok-soft)] text-ok'
              : 'border-crit/30 bg-[var(--crit-soft)] text-crit'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Selector de proveedor (extensible) */}
      <div className="flex flex-wrap gap-2">
        {connections.map((c) => {
          const meta = PROVIDERS[c.provider] ?? { label: c.name, accent: 'border-hair' };
          const active = c.id === conn?.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                active
                  ? `${meta.accent ?? 'border-[color:var(--brand-accent)]'} bg-brand-highlight-soft text-fg`
                  : 'border-hair text-fg-muted hover:bg-raised hover:text-fg'
              }`}
            >
              {meta.label ?? c.name}
              <span className="ml-2 text-xs opacity-70">{c._count?.items ?? 0} ítems</span>
            </button>
          );
        })}
      </div>

      {conn && (
        <>
          <div className={`rounded-xl border p-4 md:p-5 ${providerMeta.accent}`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-fg">{providerMeta.label}</h2>
                <p className="text-sm text-fg-muted">{providerMeta.description}</p>
                {conn.lastSyncAt && (
                  <p className="mt-1 font-mono text-xs tabular-nums text-fg-faint">
                    Última sync: {new Date(conn.lastSyncAt).toLocaleString('es-AR')}
                    {conn.lastStatus ? ` · ${conn.lastStatus}` : ''}
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-md border px-2.5 py-1 text-xs ${conn.autoSync ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-hair bg-raised text-fg-faint'}`}>Auto-sync {conn.autoSync ? 'activo' : 'inactivo'}</span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-hair-soft bg-surface p-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised2 font-mono text-sm text-fg-muted">1</span>
                <div><h3 className="font-semibold text-fg">Sincronizar catálogo</h3><p className="text-sm text-fg-faint">{conn._count?.items ?? items.length} ítems en catálogo</p></div>
              </div>
              <button type="button" onClick={() => run('run')} disabled={!!busy || !conn || conn.provider !== 'mondelez'} className="w-full rounded-lg border border-hair bg-raised px-4 py-2 text-sm font-medium text-fg hover:bg-raised2 disabled:opacity-50">
                {conn.provider !== 'mondelez' ? 'Usá el runner local' : busy === 'run' ? 'Sincronizando…' : 'Sync catálogo (servidor)'}
              </button>
              {conn.provider !== 'mondelez' && <p className="mt-2 text-xs text-fg-faint">Este proveedor no ofrece un catálogo público para sincronizar desde el servidor.</p>}
            </div>
            <div className="rounded-xl border border-hair-soft bg-surface p-5">
              <div className="mb-4 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised2 font-mono text-sm text-fg-muted">2</span><div><h3 className="font-semibold text-fg">Traer precio B2B</h3><p className="text-sm text-fg-faint">Precio disponible en <span className="font-mono tabular-nums text-ok">{withCost}</span> de <span className="font-mono tabular-nums">{conn._count?.items ?? items.length}</span></p></div></div>
              <p className="text-sm text-fg-muted">El runner local actualiza los costos reales del proveedor.</p>
            </div>
            <div className="rounded-xl border border-hair-soft bg-surface p-5">
              <div className="mb-4 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised2 font-mono text-sm text-fg-muted">3</span><div><h3 className="font-semibold text-fg">Importar a productos</h3><p className="text-sm text-fg-faint"><span className="font-mono tabular-nums text-brand">{linked}</span> vinculados · markup <span className="font-mono tabular-nums">{mk}%</span></p></div></div>
              <button type="button" onClick={() => run('import')} disabled={!!busy || !conn} className="btn-brand w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                {busy === 'import' ? 'Importando…' : 'Importar a productos'}
              </button>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-hair-soft border-l-4 bg-surface p-4 text-sm text-fg-muted">
            <p className="font-medium text-fg">Precio real B2B (runner local)</p>
            <p>{providerMeta.runnerNote}</p>
            <p className="text-xs text-fg-faint">
              En <code className="text-fg-muted">sync-runner/.env</code> configurá{' '}
              <code className="text-fg-muted">SR_API={apiBase || 'https://stockrapido-api.vercel.app'}</code> (proyecto API en Vercel — ver DEPLOY.md).
              Ejecutá <code className="text-fg-muted">python {RUNNER_FILES[conn.provider] ?? `${conn.provider}_sync_runner.py`}</code> en tu PC o agendalo con Task Scheduler.
            </p>
          </div>

          <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-fg">Cuenta corriente</h2><p className="text-sm text-fg-muted">Facturas, saldo y financiación informados por el proveedor.</p></div>{account && <span className="font-mono text-xs tabular-nums text-fg-faint">Actualizado {new Date(account.updatedAt).toLocaleString('es-AR')}</span>}</div>
            {accountLoading ? <Loader size="sm" label="Cuenta corriente" /> : account ? <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="col-span-2 rounded-xl border border-[color:var(--brand-accent)] bg-brand-highlight-soft p-4 lg:col-span-1"><span className="text-xs uppercase tracking-wide text-fg-faint">Saldo</span><p className="mt-1 font-mono text-2xl font-bold tabular-nums text-brand">{formatOptionalMoney(account.balance)}</p></div>
                <div className="rounded-xl border border-hair-soft bg-raised p-4"><span className="text-xs uppercase tracking-wide text-fg-faint">Límite</span><p className="mt-1 font-mono text-lg font-semibold tabular-nums text-fg">{formatOptionalMoney(account.creditLimit)}</p></div>
                <div className="rounded-xl border border-hair-soft bg-raised p-4"><span className="text-xs uppercase tracking-wide text-fg-faint">Crédito disponible</span><p className="mt-1 font-mono text-lg font-semibold tabular-nums text-ok">{formatOptionalMoney(account.availableCredit)}</p></div>
                <div className="rounded-xl border border-hair-soft bg-raised p-4"><span className="text-xs uppercase tracking-wide text-fg-faint">Cliente</span><p className="mt-1 text-sm font-medium text-fg">{account.razonSocial ?? '—'}</p><p className="font-mono text-xs text-fg-faint">{account.clienteId ?? account.currency ?? 'ARS'}</p></div>
                {account.loyaltyPoints != null && <div className="rounded-xl border border-warn/40 bg-[var(--warn-soft)] p-4"><span className="text-xs uppercase tracking-wide text-fg-faint">Puntos / fidelidad</span><p className="mt-1 font-mono text-2xl font-bold tabular-nums text-warn">{account.loyaltyPoints.toLocaleString('es-AR')}</p></div>}
              </div>
              <div><h3 className="mb-2 font-semibold text-fg">Facturas</h3>{account.invoices.length ? <div className="overflow-x-auto rounded-xl border border-hair-soft"><table className="w-full min-w-[720px] text-sm"><thead className="bg-raised text-left text-xs uppercase tracking-wide text-fg-faint"><tr><th className="p-3">Número</th><th className="p-3">Fecha</th><th className="p-3">Vencimiento</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Saldo pendiente</th><th className="p-3">Estado</th><th className="p-3">PDF</th></tr></thead><tbody className="divide-y divide-hair-soft">{account.invoices.map((invoice) => <tr key={invoice.id}><td className="p-3 font-mono text-fg">{invoice.number ?? '—'}</td><td className="p-3 font-mono text-fg-muted">{invoice.date ? new Date(invoice.date).toLocaleDateString('es-AR') : '—'}</td><td className="p-3 font-mono text-fg-muted">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('es-AR') : '—'}</td><td className="p-3 text-right font-mono tabular-nums text-fg">{formatOptionalMoney(invoice.total)}</td><td className="p-3 text-right font-mono tabular-nums text-warn">{formatOptionalMoney(invoice.saldoPendiente)}</td><td className="p-3"><span className="rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-muted">{invoice.status ?? '—'}</span></td><td className="p-3">{invoice.pdfUrl ? <a href={invoice.pdfUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">Ver PDF</a> : '—'}</td></tr>)}</tbody></table></div> : <p className="rounded-lg border border-hair-soft bg-raised p-4 text-sm text-fg-faint">Sin facturas informadas.</p>}</div>
              <div><h3 className="mb-2 font-semibold text-fg">Crédito y financiación</h3>{account.credits.length ? <div className="grid gap-3 sm:grid-cols-2">{account.credits.map((credit) => <div key={credit.id} className="rounded-xl border border-hair-soft bg-raised p-4"><div className="flex items-center justify-between gap-2"><span className="rounded-md border border-[color:var(--brand-accent)] bg-brand-highlight-soft px-2 py-1 text-xs font-medium text-brand">{credit.tipo ?? 'Crédito'}</span>{credit.vencimiento && <span className="font-mono text-xs text-fg-faint">Vence {new Date(credit.vencimiento).toLocaleDateString('es-AR')}</span>}</div><div className="mt-3 grid grid-cols-2 gap-3"><div><span className="block text-xs text-fg-faint">Disponible</span><span className="font-mono font-semibold tabular-nums text-ok">{formatOptionalMoney(credit.montoDisponible)}</span></div><div><span className="block text-xs text-fg-faint">Usado</span><span className="font-mono tabular-nums text-fg">{formatOptionalMoney(credit.montoUsado)}</span></div></div>{credit.condiciones && <p className="mt-3 text-xs text-fg-muted">{credit.condiciones}</p>}</div>)}</div> : <p className="rounded-lg border border-hair-soft bg-raised p-4 text-sm text-fg-faint">Sin líneas de financiación informadas.</p>}</div>
            </> : <p className="rounded-lg border border-hair-soft bg-raised p-4 text-sm text-fg-muted">{conn.provider === 'juntosplus' ? 'Juntos+ no ofrece una cuenta corriente estándar.' : conn.provider === 'mondelez' ? 'La cuenta corriente de Mondelez todavía no está integrada.' : 'Sin datos de cuenta — corré el runner para cosechar facturas y financiación.'}</p>}
          </section>

          <section className="space-y-5 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
            <div><h2 className="text-lg font-semibold text-fg">Pedidos</h2><p className="text-sm text-fg-muted">Historial cosechado y borradores preparados dentro de StockRápido.</p></div>
            <div className="rounded-xl border border-warn/40 bg-[var(--warn-soft)] p-3 text-sm text-warn">El envío del pedido al proveedor se habilita más adelante.</div>
            {ordersLoading ? <Loader size="sm" label="Pedidos" /> : <>
              <div><h3 className="mb-2 font-semibold text-fg">Historial</h3>{historyOrders.length ? <div className="space-y-2">{historyOrders.map((order) => <div key={order.id} className="rounded-xl border border-hair-soft bg-raised p-3"><button type="button" onClick={() => setExpandedOrder((current) => current === order.id ? null : order.id)} className="grid w-full grid-cols-2 gap-2 text-left sm:grid-cols-5"><span><span className="block text-xs text-fg-faint">Fecha</span><span className="font-mono text-sm text-fg">{new Date(order.placedAt ?? order.createdAt).toLocaleDateString('es-AR')}</span></span><span><span className="block text-xs text-fg-faint">Número</span><span className="font-mono text-sm text-fg">{order.externalOrderId ?? '—'}</span></span><span><span className="block text-xs text-fg-faint">Estado</span><span className="inline-block rounded-md border border-hair bg-surface px-2 py-0.5 text-xs text-fg-muted">{order.status ?? '—'}</span></span><span><span className="block text-xs text-fg-faint">Total</span><span className="font-mono font-semibold tabular-nums text-brand">{formatOptionalMoney(order.total)}</span></span><span><span className="block text-xs text-fg-faint">Tracking</span><span className="font-mono text-xs text-fg-muted">{order.tracking ?? '—'}</span></span></button>{expandedOrder === order.id && <div className="mt-3 space-y-2 border-t border-hair-soft pt-3">{order.items.length ? order.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="text-fg-muted">{item.qty} × {item.name ?? 'Producto'} <span className="font-mono text-xs text-fg-faint">({item.uom ?? 'UN'})</span></span><span className="font-mono tabular-nums text-fg">{formatOptionalMoney(item.total)}</span></div>) : <p className="text-sm text-fg-faint">Sin detalle de ítems.</p>}</div>}</div>)}</div> : <p className="rounded-lg border border-hair-soft bg-raised p-4 text-sm text-fg-faint">Sin pedidos — corré el runner.</p>}</div>

              <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3"><h3 className="font-semibold text-fg">Armar pedido</h3><input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Buscar producto sincronizado…" className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-sm text-fg" /><div className="max-h-64 space-y-2 overflow-y-auto">{orderProducts.map((product) => <button key={product.id} type="button" onClick={() => addDraftProduct(product)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-hair-soft bg-raised p-3 text-left hover:border-[color:var(--brand-accent)]"><span className="min-w-0"><span className="block truncate text-sm font-medium text-fg">{product.name}</span><span className="font-mono text-xs text-fg-faint">{product.eanUnit ?? product.ean ?? product.sku ?? '—'}</span></span><span className="text-sm text-brand">Agregar</span></button>)}</div></div><div className="space-y-3"><h3 className="font-semibold text-fg">Borrador actual</h3>{draftLines.length ? <>{draftLines.map((line, index) => <div key={line.syncedProductId} className="rounded-lg border border-hair-soft bg-raised p-3"><div className="flex justify-between gap-2"><span className="text-sm font-medium text-fg">{line.name}</span><button type="button" onClick={() => setDraftLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs text-crit">Quitar</button></div><div className="mt-2 grid grid-cols-3 gap-2"><select value={line.uom} onChange={(event) => setDraftLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, uom: event.target.value, unitPrice: Number(line.variants.find((variant) => variant.uom === event.target.value)?.sellingPrice ?? item.unitPrice) } : item))} className="rounded-lg border border-hair bg-surface px-2 py-1.5 text-sm text-fg"><option value="UN">Unidad</option>{line.variants.filter((variant) => variant.uom !== 'UN').map((variant) => <option key={variant.uom} value={variant.uom}>{variant.uom === 'DI' ? 'Display' : variant.uom === 'BU' ? 'Bulto' : variant.uom}</option>)}</select><input type="number" min={1} value={line.qty} onChange={(event) => setDraftLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, qty: Math.max(1, Number(event.target.value)) } : item))} className="min-w-0 rounded-lg border border-hair bg-surface px-2 py-1.5 font-mono text-sm text-fg" /><input type="number" min={0} step="0.01" value={line.unitPrice} onChange={(event) => setDraftLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: Number(event.target.value) } : item))} className="min-w-0 rounded-lg border border-hair bg-surface px-2 py-1.5 font-mono text-sm text-fg" /></div></div>)}<input type="date" value={draftDeliveryDate} onChange={(event) => setDraftDeliveryDate(event.target.value)} className="rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-sm text-fg" /><div className="flex items-center justify-between"><span className="font-mono font-semibold text-fg">Total {formatMoneyArs(draftLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0))}</span><button type="button" onClick={saveDraft} disabled={busy === 'draft'} className="btn-brand rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy === 'draft' ? 'Guardando…' : 'Guardar borrador'}</button></div></> : <p className="rounded-lg border border-hair-soft bg-raised p-4 text-sm text-fg-faint">Agregá productos desde el buscador.</p>}</div></div>

              <div><h3 className="mb-2 font-semibold text-fg">Borradores guardados</h3>{draftOrders.length ? <div className="space-y-2">{draftOrders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hair-soft bg-raised p-3"><div><p className="text-sm text-fg">{order.items.length} ítems · <span className="font-mono font-semibold text-brand">{formatOptionalMoney(order.total)}</span></p><p className="font-mono text-xs text-fg-faint">Creado {new Date(order.createdAt).toLocaleString('es-AR')}{order.deliveryDate ? ` · entrega ${new Date(order.deliveryDate).toLocaleDateString('es-AR')}` : ''}</p></div><button type="button" onClick={() => deleteDraft(order.id)} className="rounded-lg border border-crit/40 px-3 py-1.5 text-sm text-crit hover:bg-[var(--crit-soft)]">Eliminar</button></div>)}</div> : <p className="text-sm text-fg-faint">No hay borradores guardados.</p>}</div>
            </>}
          </section>

          <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-fg">Cambios de precio</h2>
                <p className="text-sm text-fg-muted">Detectá subas y bajas bruscas del costo sincronizado.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="text-xs text-fg-faint">
                  Período
                  <select value={priceDays} onChange={(event) => setPriceDays(Number(event.target.value))} className="mt-1 block rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-sm text-fg">
                    <option value={7}>7 días</option>
                    <option value={30}>30 días</option>
                    <option value={90}>90 días</option>
                  </select>
                </label>
                <label className="text-xs text-fg-faint">
                  Umbral (%)
                  <input type="number" min={0} step={1} value={priceThreshold} onChange={(event) => setPriceThreshold(Math.max(0, Number(event.target.value) || 0))} className="mt-1 block w-28 rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-sm text-fg" />
                </label>
              </div>
            </div>
            {priceChangesLoading ? <Loader size="sm" label="Cambios de precio" /> : priceChanges.length ? (
              <div className="overflow-x-auto rounded-xl border border-hair-soft">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-raised text-left text-xs uppercase tracking-wide text-fg-faint"><tr><th className="p-3">Producto</th><th className="p-3 text-right">Precio anterior</th><th className="p-3 text-right">Precio actual</th><th className="p-3 text-right">Cambio</th><th className="p-3">Dirección</th></tr></thead>
                  <tbody className="divide-y divide-hair-soft">{priceChanges.map((change) => <tr key={change.syncedProductId} className="hover:bg-raised/70"><td className="p-3 font-medium text-fg">{change.name}</td><td className="p-3 text-right font-mono tabular-nums text-fg-muted">{formatMoneyArs(change.from)}</td><td className="p-3 text-right font-mono tabular-nums text-fg">{formatMoneyArs(change.to)}</td><td className="p-3 text-right"><span className={`rounded-md border px-2 py-1 font-mono text-xs font-semibold tabular-nums ${change.direction === 'down' ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-crit/30 bg-[var(--crit-soft)] text-crit'}`}>{change.changePct > 0 ? '+' : ''}{change.changePct.toFixed(2)}%</span></td><td className={`p-3 text-sm ${change.direction === 'down' ? 'text-ok' : 'text-crit'}`}>{change.direction === 'down' ? 'Baja' : 'Suba'}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="rounded-lg border border-hair-soft bg-raised p-4 text-sm text-fg-faint">Sin cambios bruscos en el período.</p>}
          </section>

          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full sm:min-w-[200px] sm:flex-1">
              <label className="mb-1 block text-xs text-fg-faint">Buscar</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, EAN o marca…"
                className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-sm text-fg placeholder:text-fg-faint"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-fg-muted">
              <input type="checkbox" checked={onlyWithCost} onChange={(e) => setOnlyWithCost(e.target.checked)} />
              Solo con precio B2B ({withCost})
            </label>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-fg-faint">
              <input type="checkbox" checked={showInternal} onChange={(e) => setShowInternal(e.target.checked)} />
              Ver costos por bulto (interno)
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-hair-soft bg-surface">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-raised text-left text-xs uppercase tracking-wide text-fg-faint">
                  <tr>
                    <th className="p-3 w-12" />
                    <th className="p-3">Producto</th>
                    <th className="p-3">Marca</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3 text-right">Costo c/u</th>
                    <th className="p-3 text-right">Venta c/u (+{mk}%)</th>
                    {showInternal && <th className="p-3 text-right text-fg-faint">Costo bulto</th>}
                    <th className="p-3 text-center">U/bulto</th>
                    <th className="p-3">EAN</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hair-soft">
                  {items.map((p) => (
                    <tr key={p.id} className="hover:bg-raised/70">
                      <td className="p-2">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="w-9 h-9 object-contain rounded bg-white/5" />
                        ) : (
                          <div className="h-9 w-9 rounded bg-raised2" />
                        )}
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-fg">{p.name ?? '—'}</span>
                        {p.linkedProductId && (
                          <span className="ml-2 rounded-md border border-ok/30 bg-[var(--ok-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ok">importado</span>
                        )}
                      </td>
                      <td className="p-3 text-fg-muted">{p.brand ?? '—'}</td>
                      <td className="p-3 text-xs text-fg-faint">{p.category ?? '—'}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-fg-muted">
                        {p.costUnit != null ? formatMoneyArs(p.costUnit) : '—'}
                      </td>
                      <td className="p-3 text-right font-mono font-medium tabular-nums text-brand">
                        {p.saleUnit != null ? formatMoneyArs(p.saleUnit) : '—'}
                      </td>
                      {showInternal && (
                        <td className="p-3 text-right font-mono text-xs tabular-nums text-fg-faint">
                          {p.costBulk != null ? formatMoneyArs(p.costBulk) : '—'}
                        </td>
                      )}
                      <td className="p-3 text-center text-fg-muted text-xs">
                        {p.unitsPerBoxNum ?? p.unitsPerBox ?? '—'}
                      </td>
                      <td className="p-3 text-fg-faint text-xs font-mono">{p.eanUnit ?? p.ean ?? '—'}</td>
                      <td className="p-3">
                        {p.linkedProductId ? (
                          <span className="rounded-md border border-ok/30 bg-[var(--ok-soft)] px-2 py-1 text-xs text-ok">Importado</span>
                        ) : p.costUnit == null ? (
                          <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 text-xs text-warn">Falta precio</span>
                        ) : (
                          <span className="rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-muted">Sin importar</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setDetail(p)} className="whitespace-nowrap text-xs text-brand hover:underline">Ver detalle</button>
                          {p.link ? <a href={p.link} target="_blank" rel="noreferrer" className="text-brand text-xs hover:underline">↗</a> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={showInternal ? 11 : 10} className="p-8 text-center text-fg-faint">
                        Sin productos. Sincronizá el catálogo o ejecutá el runner con precios B2B.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 md:hidden">
              {items.map((product) => (
                <article key={product.id} className="rounded-xl border border-hair-soft bg-surface p-3">
                  <div className="flex items-start gap-3">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded bg-white/5 object-contain" /> : <div className="h-10 w-10 shrink-0 rounded bg-raised2" />}<div className="min-w-0 flex-1"><p className="font-medium text-fg">{product.name ?? '—'}</p><p className="text-xs text-fg-faint">{product.brand ?? 'Sin marca'} · {product.category ?? 'Sin categoría'}</p></div>{product.linkedProductId ? <span className="rounded-md border border-ok/30 bg-[var(--ok-soft)] px-2 py-1 text-xs text-ok">Importado</span> : product.costUnit == null ? <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 text-xs text-warn">Falta precio</span> : <span className="rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-muted">Sin importar</span>}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-hair-soft pt-3 text-sm"><div><span className="block text-xs text-fg-faint">Costo c/u</span><span className="font-mono tabular-nums text-fg-muted">{product.costUnit != null ? formatMoneyArs(product.costUnit) : '—'}</span></div><div><span className="block text-xs text-fg-faint">Venta c/u (+{mk}%)</span><span className="font-mono font-medium tabular-nums text-brand">{product.saleUnit != null ? formatMoneyArs(product.saleUnit) : '—'}</span></div>{showInternal && <div><span className="block text-xs text-fg-faint">Costo bulto</span><span className="font-mono text-fg-muted">{product.costBulk != null ? formatMoneyArs(product.costBulk) : '—'}</span></div>}<div><span className="block text-xs text-fg-faint">U/bulto</span><span className="font-mono text-fg-muted">{product.unitsPerBoxNum ?? product.unitsPerBox ?? '—'}</span></div><div><span className="block text-xs text-fg-faint">EAN</span><span className="break-all font-mono text-fg-muted">{product.eanUnit ?? product.ean ?? '—'}</span></div></div>
                  <div className="mt-3 flex justify-end gap-3 border-t border-hair-soft pt-3"><button type="button" onClick={() => setDetail(product)} className="text-sm text-brand">Ver detalle</button>{product.link && <a href={product.link} target="_blank" rel="noreferrer" className="text-sm text-brand">Abrir producto ↗</a>}</div>
                </article>
              ))}
              {items.length === 0 && <p className="p-6 text-center text-sm text-fg-faint">Sin productos. Sincronizá el catálogo o ejecutá el runner con precios B2B.</p>}
            </div>
          </div>
        </>
      )}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-hair bg-surface p-4 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-semibold text-fg">{detail.name ?? 'Producto sincronizado'}</h2><p className="text-sm text-fg-muted">Códigos, empaque y variantes del proveedor</p></div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Cerrar" className="rounded-lg border border-hair px-3 py-1.5 text-fg-muted hover:bg-raised">Cerrar</button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['EAN unidad', detail.eanUnit ?? detail.ean], ['EAN bulto', detail.eanBox],
                ['Referencia proveedor', detail.supplierRef], ['SKU', detail.sku],
                ['ID externo', detail.externalId], ['IVA', detail.ivaAlicuota != null ? `${Number(detail.ivaAlicuota)}%` : null],
                ['Unidades por display', detail.unitsPerDisplay], ['Displays por bulto', detail.displaysPerBox],
                ['Unidades por bulto', detail.unitsPerBox], ['Retornable', detail.retornable == null ? null : detail.retornable ? 'Sí' : 'No'],
              ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-hair-soft bg-raised p-3"><span className="block text-[11px] uppercase tracking-wide text-fg-faint">{label}</span><span className="mt-1 block break-all font-mono text-sm text-fg">{value ?? '—'}</span></div>)}
            </div>
            <div className="mt-6 rounded-xl border border-hair-soft bg-raised p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold text-fg">Evolución del costo</h3><p className="text-xs text-fg-faint">Se registra un punto únicamente cuando cambia el costo o el precio de lista.</p></div>
                {priceChartData.length > 1 && <div className="flex gap-2 text-xs"><span className={`rounded-md border px-2 py-1 font-mono tabular-nums ${totalPriceChange != null && totalPriceChange <= 0 ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-crit/30 bg-[var(--crit-soft)] text-crit'}`}>Total {totalPriceChange != null && totalPriceChange > 0 ? '+' : ''}{totalPriceChange?.toFixed(2)}%</span>{lastPriceChange != null && <span className={`rounded-md border px-2 py-1 font-mono tabular-nums ${lastPriceChange <= 0 ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-crit/30 bg-[var(--crit-soft)] text-crit'}`}>Última {lastPriceChange > 0 ? '+' : ''}{lastPriceChange.toFixed(2)}%</span>}</div>}
              </div>
              {priceHistoryLoading ? <Loader size="sm" label="Historial de precios" /> : priceChartData.length <= 1 ? <p className="mt-4 text-sm text-fg-faint">Sin cambios registrados aún.</p> : <div className="mt-4 h-44 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={priceChartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}><CartesianGrid stroke="var(--hair-soft)" strokeDasharray="3 3" /><XAxis dataKey="date" stroke="var(--tx-3)" tick={{ fontSize: 10 }} /><YAxis stroke="var(--tx-3)" tick={{ fontSize: 10 }} width={58} tickFormatter={(value) => `$${Number(value).toLocaleString('es-AR')}`} /><Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--hair)', borderRadius: 8, color: 'var(--tx)' }} formatter={(value) => [formatMoneyArs(Number(value)), 'Costo']} /><Line type="monotone" dataKey="cost" name="Costo" stroke="var(--brand-accent)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div>}
            </div>
            <div className="mt-6">
              <h3 className="font-semibold text-fg">Variantes por unidad de medida</h3>
              {detail.variants?.length ? <div className="mt-3 space-y-3">{detail.variants.map((variant) => (
                <div key={variant.id} className="rounded-xl border border-hair-soft bg-raised p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-md border border-[color:var(--brand-accent)] bg-brand-highlight-soft px-2 py-1 font-mono text-sm font-semibold text-brand">{variant.uom}</span><span className="font-mono text-xs text-fg-faint">× {variant.multiplier} UN</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><span className="block text-xs text-fg-faint">Costo</span><span className="font-mono tabular-nums text-fg">{formatOptionalMoney(variant.cost)}</span></div><div><span className="block text-xs text-fg-faint">Venta</span><span className="font-mono tabular-nums text-brand">{formatOptionalMoney(variant.sellingPrice)}</span></div><div><span className="block text-xs text-fg-faint">Con impuestos</span><span className="font-mono tabular-nums text-fg">{formatOptionalMoney(variant.priceWithTax)}</span></div><div><span className="block text-xs text-fg-faint">Stock</span><span className="font-mono tabular-nums text-fg">{variant.stock ?? '—'}</span></div></div>
                  <p className="mt-3 break-all font-mono text-xs text-fg-faint">SKU {variant.skuId ?? '—'} · Ref {variant.refId ?? '—'} · EAN {variant.ean ?? '—'} · IVA {variant.taxAlicuota != null ? `${Number(variant.taxAlicuota)}%` : '—'}</p>
                </div>
              ))}</div> : <p className="mt-3 rounded-lg border border-hair-soft bg-raised p-4 text-sm text-fg-faint">Este producto todavía no tiene variantes sincronizadas.</p>}
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
