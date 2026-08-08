'use client';

import { useCallback, useEffect, useState } from 'react';
import { Grid2X2, List, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';
import { usePersistedState } from '@/lib/use-persisted-state';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { ProviderTabs, SyncProviderProvider, useSyncProvider } from '@/components/sync/SyncProviderContext';

type Order = {
  id: string; externalOrderId?: string | null; status?: string | null; total?: unknown;
  deliveryDate?: string | null; tracking?: string | null; placedAt?: string | null; createdAt: string;
  items: Array<{ id: string; name?: string | null; uom?: string | null; qty: number; unitPrice?: unknown; total?: unknown }>;
};
type Variant = { uom: string; sellingPrice?: unknown; cost?: unknown };
type Product = { id: string; name?: string; ean?: string; eanUnit?: string; sku?: string; costUnit?: number | null; variants?: Variant[] };
type DraftLine = { syncedProductId: string; name: string; uom: string; qty: number; unitPrice: number; variants: Variant[] };

const money = (value: unknown) => value != null && Number.isFinite(Number(value)) ? formatMoneyArs(Number(value)) : '—';
const uomLabel = (uom: string) => uom === 'DI' ? 'Display' : uom === 'BU' ? 'Bulto' : uom === 'UN' ? 'Unidad' : uom;

function statusClass(status?: string | null) {
  const normalized = status?.toLowerCase() ?? '';
  if (normalized.includes('entreg') || normalized.includes('complet')) return 'border-ok/30 bg-[var(--ok-soft)] text-ok';
  if (normalized.includes('cancel')) return 'border-crit/30 bg-[var(--crit-soft)] text-crit';
  if (normalized.includes('pend')) return 'border-warn/30 bg-[var(--warn-soft)] text-warn';
  return 'border-hair bg-raised2 text-fg-muted';
}

function OrdersScreen() {
  const { connection } = useSyncProvider();
  const [history, setHistory] = useState<Order[]>([]);
  const [drafts, setDrafts] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = usePersistedState<'cards' | 'list'>('sr-syncorders-view', 'cards');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!connection) return;
    setLoading(true);
    try {
      const [harvested, draftRows, synced] = await Promise.all([
        api<Order[]>(`/sync/connections/${connection.id}/orders`, { params: { source: 'harvested' } }),
        api<Order[]>(`/sync/connections/${connection.id}/orders`, { params: { source: 'draft' } }),
        api<Product[]>(`/sync/connections/${connection.id}/products`),
      ]);
      setHistory(harvested); setDrafts(draftRows); setProducts(synced);
    } catch {
      setHistory([]); setDrafts([]); setProducts([]);
    } finally { setLoading(false); }
  }, [connection]);
  useEffect(() => { void load(); setLines([]); setSearch(''); }, [load]);

  const addProduct = (product: Product) => {
    if (lines.some((line) => line.syncedProductId === product.id)) return;
    const variants = product.variants ?? [];
    const first = variants.find((variant) => variant.uom === 'UN') ?? variants[0];
    setLines((current) => [...current, {
      syncedProductId: product.id,
      name: product.name ?? 'Producto',
      uom: first?.uom ?? 'UN',
      qty: 1,
      unitPrice: Number(first?.sellingPrice ?? product.costUnit ?? 0),
      variants,
    }]);
    setSearch('');
  };
  const updateLine = (index: number, patch: Partial<DraftLine>) => setLines((current) => current.map((line, row) => row === index ? { ...line, ...patch } : line));
  const saveDraft = async () => {
    if (!connection || !lines.length) return;
    setSaving(true);
    try {
      await api(`/sync/connections/${connection.id}/orders/draft`, {
        method: 'POST',
        body: JSON.stringify({ deliveryDate: deliveryDate || undefined, items: lines.map(({ syncedProductId, uom, qty, unitPrice }) => ({ syncedProductId, uom, qty, unitPrice })) }),
      });
      setLines([]); setDeliveryDate(''); await load();
    } catch (error) { alert((error as Error).message); }
    finally { setSaving(false); }
  };
  const deleteDraft = async (id: string) => {
    if (!connection || !confirm('¿Borrar este borrador de pedido?')) return;
    try { await api(`/sync/connections/${connection.id}/orders/${id}`, { method: 'DELETE' }); await load(); }
    catch (error) { alert((error as Error).message); }
  };
  const choices = search.trim() ? products.filter((product) => `${product.name ?? ''} ${product.eanUnit ?? product.ean ?? ''} ${product.sku ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 10) : [];
  const draftTotal = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const orderDetail = (order: Order) => expanded === order.id && <div className="mt-4 space-y-2 border-t border-hair-soft pt-4">{order.items.length ? order.items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span className="text-fg-muted"><strong className="font-mono text-fg">{item.qty}×</strong> {item.name ?? 'Producto'} <span className="font-mono text-xs text-fg-faint">({uomLabel(item.uom ?? 'UN')})</span></span><span className="font-mono tabular-nums text-fg">{money(item.total)}</span></div>) : <p className="text-sm text-fg-faint">Sin detalle de ítems.</p>}</div>;

  return <Container className="max-w-7xl space-y-8">
    <PageHeader title="Pedidos" subtitle="Armá un pedido con los productos y presentaciones del proveedor." />
    <ProviderTabs />

    <section className="rounded-2xl border border-[color:var(--brand-accent)] bg-surface p-4 shadow-sm sm:p-6">
      <div><h2 className="text-xl font-bold text-fg">Armar pedido</h2><p className="mt-1 text-sm text-fg-muted">Buscá un producto y agregalo a la lista.</p></div>
      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-fg-faint" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Escribí el nombre del producto…" className="h-16 w-full rounded-2xl border-2 border-hair bg-raised pl-14 pr-4 text-lg text-fg outline-none placeholder:text-fg-faint focus:border-[color:var(--brand-accent)]" />
      </div>
      {search.trim() && <div className="mt-2 max-h-72 overflow-y-auto rounded-2xl border border-hair-soft bg-raised p-2 shadow-xl">{choices.length ? choices.map((product) => <button key={product.id} type="button" onClick={() => addProduct(product)} className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-raised2"><span className="min-w-0"><strong className="block truncate text-fg">{product.name}</strong><span className="font-mono text-xs text-fg-faint">{product.eanUnit ?? product.ean ?? product.sku ?? 'Sin código'}</span></span><span className="shrink-0 rounded-lg bg-brand-highlight-soft px-3 py-1.5 text-sm font-semibold text-brand">Agregar</span></button>) : <p className="p-4 text-center text-sm text-fg-faint">No encontramos productos con ese nombre.</p>}</div>}

      <div className="mt-6 space-y-3">
        {lines.length ? lines.map((line, index) => {
          const uoms = line.variants.length ? [...new Set(line.variants.map((variant) => variant.uom))] : ['UN'];
          return <article key={line.syncedProductId} className="rounded-2xl border border-hair-soft bg-raised p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-fg">{line.name}</h3><p className="mt-1 font-mono text-sm text-brand">Subtotal {money(line.qty * line.unitPrice)}</p></div><button type="button" onClick={() => setLines((current) => current.filter((_, row) => row !== index))} aria-label={`Quitar ${line.name}`} className="rounded-lg p-2 text-crit hover:bg-[var(--crit-soft)]"><Trash2 className="h-5 w-5" /></button></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(150px,1fr)_auto_minmax(150px,1fr)] sm:items-end">
              <label className="text-xs font-medium text-fg-muted">Presentación<select value={line.uom} onChange={(event) => { const variant = line.variants.find((item) => item.uom === event.target.value); updateLine(index, { uom: event.target.value, unitPrice: Number(variant?.sellingPrice ?? line.unitPrice) }); }} className="mt-1.5 h-12 w-full rounded-xl border border-hair bg-surface px-3 text-base text-fg">{uoms.map((uom) => <option key={uom} value={uom}>{uomLabel(uom)}</option>)}</select></label>
              <div><span className="mb-1.5 block text-center text-xs font-medium text-fg-muted">Cantidad</span><div className="flex h-12 items-center rounded-xl border border-hair bg-surface"><button type="button" onClick={() => updateLine(index, { qty: Math.max(1, line.qty - 1) })} className="flex h-full w-12 items-center justify-center rounded-l-xl text-fg hover:bg-raised2" aria-label="Restar cantidad"><Minus className="h-5 w-5" /></button><strong className="min-w-12 text-center font-mono text-xl tabular-nums text-fg">{line.qty}</strong><button type="button" onClick={() => updateLine(index, { qty: line.qty + 1 })} className="flex h-full w-12 items-center justify-center rounded-r-xl text-fg hover:bg-raised2" aria-label="Sumar cantidad"><Plus className="h-5 w-5" /></button></div></div>
              <label className="text-xs font-medium text-fg-muted">Precio unitario<input type="number" min={0} step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: Math.max(0, Number(event.target.value) || 0) })} className="mt-1.5 h-12 w-full rounded-xl border border-hair bg-surface px-3 font-mono text-base tabular-nums text-fg" /></label>
            </div>
          </article>;
        }) : <div className="rounded-2xl border border-dashed border-hair bg-raised p-8 text-center"><p className="text-base font-medium text-fg-muted">Agregá productos para armar un pedido</p></div>}
      </div>

      <div className="mt-6 flex flex-col gap-4 border-t border-hair-soft pt-5 sm:flex-row sm:items-end sm:justify-between"><label className="text-xs font-medium text-fg-muted">Fecha de entrega deseada (opcional)<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className="mt-1.5 block h-12 rounded-xl border border-hair bg-raised px-3 font-mono text-fg" /></label><div className="text-left sm:text-right"><span className="text-sm font-medium text-fg-muted">Total del pedido</span><p className="font-mono text-4xl font-bold tabular-nums text-brand">{money(draftTotal)}</p></div></div>
      <button type="button" onClick={saveDraft} disabled={saving || lines.length === 0} className="btn-brand mt-5 min-h-14 w-full rounded-2xl px-6 py-3 text-lg font-bold disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar borrador'}</button>
      <p className="mt-3 text-center text-xs text-fg-faint">El envío al proveedor se habilita más adelante.</p>
    </section>

    <section className="space-y-3"><div><h2 className="text-xl font-bold text-fg">Borradores guardados</h2><p className="text-sm text-fg-muted">Pedidos preparados que todavía no fueron enviados.</p></div>{loading ? <Loader /> : drafts.length ? <div className="grid gap-3 sm:grid-cols-2">{drafts.map((order) => <article key={order.id} className="rounded-2xl border border-hair-soft bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-fg">Borrador · {order.items.length} productos</p><p className="mt-1 font-mono text-xs text-fg-faint">Creado {new Date(order.createdAt).toLocaleString('es-AR')}</p></div><button type="button" onClick={() => deleteDraft(order.id)} className="rounded-xl border border-crit/30 px-3 py-2 text-sm font-medium text-crit hover:bg-[var(--crit-soft)]">Eliminar</button></div><p className="mt-4 font-mono text-2xl font-bold tabular-nums text-brand">{money(order.total)}</p>{order.deliveryDate && <p className="mt-1 text-sm text-fg-muted">Entrega deseada: <span className="font-mono">{new Date(order.deliveryDate).toLocaleDateString('es-AR')}</span></p>}</article>)}</div> : <p className="rounded-2xl border border-hair-soft bg-surface p-6 text-sm text-fg-faint">No hay borradores guardados.</p>}</section>

    <section className="space-y-4 border-t border-hair-soft pt-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold text-fg">Historial de pedidos</h2><p className="text-sm text-fg-muted">Pedidos anteriores traídos desde el proveedor.</p></div><div className="inline-flex self-start rounded-xl border border-hair bg-surface p-1 sm:self-auto"><button type="button" onClick={() => setView('cards')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === 'cards' ? 'bg-raised2 font-semibold text-fg' : 'text-fg-faint'}`}><Grid2X2 className="h-4 w-4" />Tarjetas</button><button type="button" onClick={() => setView('list')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === 'list' ? 'bg-raised2 font-semibold text-fg' : 'text-fg-faint'}`}><List className="h-4 w-4" />Lista</button></div></div>
      {loading ? <Loader /> : history.length ? view === 'cards' ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{history.map((order) => <article key={order.id} className="rounded-2xl border border-hair-soft bg-surface p-5"><div className="flex items-start justify-between gap-3"><div><span className="text-xs uppercase text-fg-faint">Pedido</span><h3 className="font-mono text-lg font-semibold text-fg">{order.externalOrderId ?? 'Sin número'}</h3></div><span className={`rounded-md border px-2 py-1 text-xs ${statusClass(order.status)}`}>{order.status ?? 'Sin estado'}</span></div><p className="mt-5 font-mono text-3xl font-bold tabular-nums text-brand">{money(order.total)}</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><p className="text-fg-faint">Fecha <span className="block font-mono text-fg-muted">{new Date(order.placedAt ?? order.createdAt).toLocaleDateString('es-AR')}</span></p><p className="text-fg-faint">Tracking <span className="block break-all font-mono text-fg-muted">{order.tracking ?? '—'}</span></p></div><button type="button" onClick={() => setExpanded((current) => current === order.id ? null : order.id)} className="mt-5 min-h-11 w-full rounded-xl border border-hair bg-raised px-3 py-2 text-sm font-semibold text-fg-muted hover:bg-raised2">{expanded === order.id ? 'Ocultar productos' : `Ver productos (${order.items.length})`}</button>{orderDetail(order)}</article>)}</div> : <div className="overflow-x-auto rounded-xl border border-hair-soft bg-surface"><table className="w-full min-w-[760px] text-sm"><thead className="bg-raised text-left text-xs uppercase text-fg-faint"><tr><th className="p-3">Fecha</th><th className="p-3">Número</th><th className="p-3">Estado</th><th className="p-3 text-right">Total</th><th className="p-3">Tracking</th><th className="p-3">Productos</th></tr></thead><tbody className="divide-y divide-hair-soft">{history.map((order) => <tr key={order.id}><td className="p-3 font-mono text-fg-muted">{new Date(order.placedAt ?? order.createdAt).toLocaleDateString('es-AR')}</td><td className="p-3 font-mono text-fg">{order.externalOrderId ?? '—'}</td><td className="p-3"><span className={`rounded-md border px-2 py-1 text-xs ${statusClass(order.status)}`}>{order.status ?? '—'}</span></td><td className="p-3 text-right font-mono font-semibold text-brand">{money(order.total)}</td><td className="p-3 font-mono text-xs text-fg-muted">{order.tracking ?? '—'}</td><td className="p-3"><button type="button" onClick={() => setExpanded((current) => current === order.id ? null : order.id)} className="text-brand">{expanded === order.id ? 'Ocultar' : `Ver (${order.items.length})`}</button>{orderDetail(order)}</td></tr>)}</tbody></table></div> : <p className="rounded-2xl border border-hair-soft bg-surface p-8 text-center text-fg-faint">Sin pedidos — corré el runner para traer el historial.</p>}
    </section>
  </Container>;
}

export default function PedidosProveedorPage() { return <SyncProviderProvider><OrdersScreen /></SyncProviderProvider>; }
