'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Grid2X2, List, Search, X } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';
import { usePersistedState } from '@/lib/use-persisted-state';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { ProviderTabs, SyncProviderProvider, useSyncProvider } from '@/components/sync/SyncProviderContext';
import { flattenRaw, rawValuesAtPath } from '@/lib/flatten-raw';

type Variant = { id: string; uom: string; multiplier: number; skuId?: string | null; refId?: string | null; ean?: string | null; cost?: unknown; listPrice?: unknown; sellingPrice?: unknown; priceWithTax?: unknown; stock?: number | null; taxAlicuota?: unknown };
type Synced = { id: string; name?: string; ean?: string; eanUnit?: string; eanBox?: string; supplierRef?: string; sku?: string; externalId?: string; ivaAlicuota?: unknown; unitsPerDisplay?: string | null; displaysPerBox?: string | null; unitsPerBox?: string | null; unitsPerBoxNum?: number | null; retornable?: boolean | null; brand?: string; category?: string; costUnit?: number | null; costBulk?: number | null; saleUnit?: number | null; imageUrl?: string; link?: string; linkedProductId?: string | null; points?: number | null; variants?: Variant[]; raw?: unknown };
type History = { capturedAt: string; cost?: unknown; listPrice?: unknown; sellingPrice?: unknown };
type Change = { syncedProductId: string; name: string; from: number; to: number; changePct: number; direction: 'up' | 'down' };
type RawColumnMeta = { path: string; type: 'number' | 'string' | 'boolean' | 'mixed'; mapped?: boolean };

const money = (value: unknown) => value != null && Number.isFinite(Number(value)) ? formatMoneyArs(Number(value)) : '—';

function RawDataSection({ raw }: { raw: unknown }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const values = useMemo(() => flattenRaw(raw), [raw]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    return term ? values.filter((item) => item.path.toLocaleLowerCase('es').includes(term)) : values;
  }, [values, query]);
  const copy = async (path: string, value: unknown) => {
    await navigator.clipboard.writeText(String(value));
    setCopied(path);
    window.setTimeout(() => setCopied((current) => current === path ? null : current), 1200);
  };
  return <section className="mt-5 overflow-hidden rounded-xl border border-hair-soft bg-raised"><button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><div><h3 className="font-semibold text-fg">Todos los datos del proveedor</h3><p className="text-xs text-fg-muted">{values.length} valores disponibles en el JSON original</p></div><ChevronDown className={`h-5 w-5 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} /></button>{open && <div className="border-t border-hair-soft p-4"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre de campo…" className="w-full rounded-xl border border-hair bg-surface py-2.5 pl-9 pr-3 text-sm text-fg focus-brand" /></label><div className="mt-3 space-y-2">{filtered.map((item, index) => <div key={`${item.path}-${index}`} className="grid gap-2 rounded-lg border border-hair-soft bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center"><span className="break-all font-mono text-xs text-fg-muted">{item.path}</span><span className="break-all whitespace-pre-wrap font-mono text-xs text-fg">{String(item.value)}</span><button type="button" onClick={() => void copy(item.path, item.value)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-hair bg-raised2 px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg">{copied === item.path ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}Copiar</button></div>)}{!filtered.length && <p className="py-6 text-center text-sm text-fg-faint">No hay campos que coincidan.</p>}</div></div>}</section>;
}

function CatalogScreen() {
  const { connection } = useSyncProvider();
  const [items, setItems] = useState<Synced[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = usePersistedState('sr-filters:sync-catalog:q', '');
  const [onlyWithCost, setOnlyWithCost] = usePersistedState('sr-filters:sync-catalog:cost', false);
  const [showInternal, setShowInternal] = usePersistedState('sr-filters:sync-catalog:internal', false);
  const [view, setView] = usePersistedState<'cards' | 'list'>('sr-syncprod-view', 'cards');
  const [detail, setDetail] = useState<Synced | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [threshold, setThreshold] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [rawColumns, setRawColumns] = useState<RawColumnMeta[]>([]);
  const [rawFilters, setRawFilters] = useState<Record<string, { text?: string; min?: string; max?: string }>>({});
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async () => { if (!connection) return setItems([]); setLoading(true); try { setItems(await api<Synced[]>(`/sync/connections/${connection.id}/products`, { params: { q: q || undefined, onlyWithCost: onlyWithCost ? 'true' : undefined } })); } finally { setLoading(false); } }, [connection, q, onlyWithCost]);
  const loadChanges = useCallback(async () => { if (!connection) return setChanges([]); setChangesLoading(true); try { setChanges(await api<Change[]>(`/sync/connections/${connection.id}/price-changes`, { params: { days: String(days), threshold: String(threshold) } })); } catch { setChanges([]); } finally { setChangesLoading(false); } }, [connection, days, threshold]);
  useEffect(() => { void loadItems(); }, [loadItems]);
  useEffect(() => {
    if (!connection) return setRawColumns([]);
    api<{ columns: RawColumnMeta[] }>(`/sync/connections/${connection.id}/raw-columns`)
      .then((result) => setRawColumns(result.columns.filter((column) => !column.mapped)))
      .catch(() => setRawColumns([]));
    setRawFilters({});
  }, [connection]);
  useEffect(() => { setSelected(new Set()); setBulkMenuOpen(false); }, [connection]);
  useEffect(() => { void loadChanges(); }, [loadChanges]);
  useEffect(() => { if (!connection || !detail) return setHistory([]); setHistoryLoading(true); api<History[]>(`/sync/connections/${connection.id}/products/${detail.id}/price-history`).then(setHistory).catch(() => setHistory([])).finally(() => setHistoryLoading(false)); }, [connection, detail]);
  const markup = Number(connection?.priceMarkup ?? 0);
  const chart = useMemo(() => history.filter((point) => point.cost != null).map((point) => ({ date: new Date(point.capturedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), cost: Number(point.cost) })), [history]);
  const totalChange = chart.length > 1 && chart[0].cost ? ((chart.at(-1)!.cost - chart[0].cost) / chart[0].cost) * 100 : null;
  const tableColumns = connection?.viewConfig?.tableColumns ?? [];
  const filterColumns = connection?.viewConfig?.filterColumns ?? [];
  const columnMeta = useMemo(() => new Map(rawColumns.map((column) => [column.path, column])), [rawColumns]);
  const listItems = useMemo(() => items.filter((product) => filterColumns.every((path) => {
    const filter = rawFilters[path];
    if (!filter) return true;
    const values = rawValuesAtPath(product.raw, path);
    if (columnMeta.get(path)?.type === 'number') {
      const numeric = values.map(Number).filter(Number.isFinite);
      if (filter.min !== undefined && filter.min !== '' && !numeric.some((value) => value >= Number(filter.min))) return false;
      if (filter.max !== undefined && filter.max !== '' && !numeric.some((value) => value <= Number(filter.max))) return false;
      return true;
    }
    const term = filter.text?.trim().toLocaleLowerCase('es');
    return !term || values.some((value) => String(value).toLocaleLowerCase('es').includes(term));
  })), [items, filterColumns, rawFilters, columnMeta]);
  useEffect(() => {
    if (!bulkMenuOpen) return;
    const outside = (event: MouseEvent) => { if (!bulkMenuRef.current?.contains(event.target as Node)) setBulkMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setBulkMenuOpen(false); };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [bulkMenuOpen]);

  const importSelected = async () => {
    if (!connection || !selected.size) return;
    setBulkBusy(true); setBulkMenuOpen(false); setBulkMessage(null); setBulkError(null);
    try {
      const result = await api<{ created: number; updated: number; skipped: number }>(`/sync/connections/${connection.id}/import`, { method: 'POST', body: JSON.stringify({ ids: [...selected] }) });
      setBulkMessage(`Importados: ${result.created} nuevos, ${result.updated} actualizados, ${result.skipped} omitidos.`);
      setSelected(new Set()); await loadItems();
    } catch (error) { setBulkError((error as Error).message); }
    finally { setBulkBusy(false); }
  };
  const exportSelected = () => {
    const rows = items.filter((item) => selected.has(item.id));
    const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['nombre', 'marca', 'categoria', 'EAN', 'costo_unitario', 'venta_unitaria', 'UOM'];
    const csv = `\uFEFF${header.map(cell).join(';')}\n${rows.map((item) => [item.name, item.brand, item.category, item.eanUnit ?? item.ean, item.costUnit, item.saleUnit, item.variants?.map((variant) => variant.uom).join('|')].map(cell).join(';')).join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'catalogo-proveedor-seleccionado.csv'; document.body.appendChild(link); link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 500); setBulkMenuOpen(false);
  };

  return <Container className="max-w-[1600px] space-y-6">
    <PageHeader title="Catálogo del proveedor" subtitle="Consultá costos, códigos, variantes y cambios de precio antes de importar." />
    <ProviderTabs />
    <section className="rounded-xl border border-hair-soft bg-surface p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-faint" /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar nombre, EAN, marca o SKU…" className="w-full rounded-xl border border-hair bg-raised py-3 pl-10 pr-3 text-fg" /></div><label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={onlyWithCost} onChange={(event) => setOnlyWithCost(event.target.checked)} />Solo con precio B2B</label><label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={showInternal} onChange={(event) => setShowInternal(event.target.checked)} />Ver costo bulto</label><div className="inline-flex rounded-xl border border-hair bg-raised p-1"><button type="button" onClick={() => setView('cards')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === 'cards' ? 'bg-raised2 text-fg' : 'text-fg-faint'}`}><Grid2X2 className="h-4 w-4" />Tarjetas</button><button type="button" onClick={() => setView('list')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === 'list' ? 'bg-raised2 text-fg' : 'text-fg-faint'}`}><List className="h-4 w-4" />Lista</button></div></div></section>

    {view === 'list' && filterColumns.length > 0 && <section className="rounded-xl border border-hair-soft bg-surface p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-fg">Filtros del proveedor</h2><p className="text-xs text-fg-muted">Configurados desde Columnas de proveedores.</p></div><button type="button" onClick={() => setRawFilters({})} className="rounded-lg border border-hair bg-raised px-3 py-2 text-xs text-fg-muted">Limpiar</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filterColumns.map((path) => { const numeric = columnMeta.get(path)?.type === 'number'; const filter = rawFilters[path] ?? {}; return <div key={path} className="rounded-xl border border-hair-soft bg-raised p-3"><label className="mb-2 block break-all font-mono text-[11px] text-fg-muted">{path}</label>{numeric ? <div className="grid grid-cols-2 gap-2"><input type="number" value={filter.min ?? ''} onChange={(event) => setRawFilters((current) => ({ ...current, [path]: { ...current[path], min: event.target.value } }))} placeholder="Mínimo" className="min-w-0 rounded-lg border border-hair bg-surface px-2 py-2 font-mono text-sm text-fg" /><input type="number" value={filter.max ?? ''} onChange={(event) => setRawFilters((current) => ({ ...current, [path]: { ...current[path], max: event.target.value } }))} placeholder="Máximo" className="min-w-0 rounded-lg border border-hair bg-surface px-2 py-2 font-mono text-sm text-fg" /></div> : <input value={filter.text ?? ''} onChange={(event) => setRawFilters((current) => ({ ...current, [path]: { ...current[path], text: event.target.value } }))} placeholder="Contiene…" className="w-full rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-fg" />}</div>; })}</div><p className="mt-3 font-mono text-xs text-fg-faint">{listItems.length} de {items.length} productos</p></section>}

    {view === 'list' && selected.size > 0 && <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--brand-accent)] bg-surface p-3 shadow-lg"><div className="flex items-center gap-3"><strong className="font-mono text-brand">{selected.size} seleccionados</strong><button type="button" onClick={() => setSelected(new Set())} className="text-sm text-fg-muted hover:text-fg">Limpiar</button></div><div ref={bulkMenuRef} className="relative"><button type="button" disabled={bulkBusy} onClick={() => setBulkMenuOpen((current) => !current)} className="btn-brand flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Acciones rápidas <ChevronDown className={`h-4 w-4 ${bulkMenuOpen ? 'rotate-180' : ''}`} /></button>{bulkMenuOpen && <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-hair bg-surface p-2 shadow-2xl"><p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Productos sincronizados</p><button type="button" onClick={() => void importSelected()} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-fg hover:bg-raised">Importar seleccionados a Productos</button><button type="button" onClick={exportSelected} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-fg hover:bg-raised">Exportar seleccionados</button></div>}</div></div>}
    {bulkMessage && <div className="rounded-xl border border-ok/30 bg-[var(--ok-soft)] px-4 py-3 text-sm text-ok">{bulkMessage}</div>}
    {bulkError && <div role="alert" className="rounded-xl border border-crit/30 bg-[var(--crit-soft)] px-4 py-3 text-sm text-crit">{bulkError}</div>}

    {loading ? <Loader /> : view === 'cards' ? <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">{items.map((product) => <button key={product.id} type="button" onClick={() => setDetail(product)} className="group overflow-hidden rounded-2xl border border-hair-soft bg-surface text-left transition hover:-translate-y-0.5 hover:border-[color:var(--brand-accent)] hover:shadow-lg"><div className="relative aspect-square bg-raised p-5">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-5xl font-bold text-fg-faint">{product.name?.slice(0, 2).toUpperCase() || '—'}</div>}{product.variants?.length ? <span className="absolute left-3 top-3 rounded-md border border-hair bg-surface/90 px-2 py-1 font-mono text-xs text-fg-muted">{[...new Set(product.variants.map((variant) => variant.uom))].join(' · ')}</span> : null}{product.points != null && <span className="absolute right-3 top-3 rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 font-mono text-xs text-warn">★ {product.points} pts</span>}</div><div className="p-4"><h2 className="min-h-12 font-semibold text-fg">{product.name ?? 'Producto'}</h2><p className="truncate text-sm text-fg-faint">{product.brand || 'Sin marca'} · {product.category || 'Sin categoría'}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t border-hair-soft pt-4"><div><span className="text-xs text-fg-faint">Costo c/u</span><p className="font-mono font-semibold tabular-nums text-fg">{money(product.costUnit)}</p></div><div className="text-right"><span className="text-xs text-fg-faint">Venta (+{markup}%)</span><p className="font-mono font-bold tabular-nums text-brand">{money(product.saleUnit)}</p></div></div></div></button>)}</div> : <div className="overflow-x-auto rounded-xl border border-hair-soft bg-surface"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-raised text-left text-xs uppercase text-fg-faint"><tr><th className="w-10 p-3"><input type="checkbox" checked={listItems.length > 0 && listItems.every((item) => selected.has(item.id))} onChange={(event) => setSelected(event.target.checked ? new Set(listItems.map((item) => item.id)) : new Set())} /></th><th className="w-14 p-3" /><th className="p-3">Producto</th><th className="p-3">Marca</th><th className="p-3">Categoría</th><th className="p-3 text-right">Costo c/u</th><th className="p-3 text-right">Venta c/u (+{markup}%)</th>{showInternal && <th className="p-3 text-right">Costo bulto</th>}<th className="p-3 text-center">U/bulto</th><th className="p-3">UOM</th><th className="p-3">EAN</th>{tableColumns.map((path) => <th key={path} className="min-w-40 p-3 font-mono normal-case">{path}</th>)}<th className="p-3">Estado</th><th className="p-3" /></tr></thead><tbody className="divide-y divide-hair-soft">{listItems.map((product) => <tr key={product.id} className="hover:bg-raised/60"><td className="p-3"><input type="checkbox" checked={selected.has(product.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(product.id); else next.delete(product.id); return next; })} /></td><td className="p-2">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-10 w-10 rounded-lg bg-white object-contain" /> : <div className="h-10 w-10 rounded-lg bg-raised2" />}</td><td className="p-3 font-medium text-fg">{product.name ?? '—'}</td><td className="p-3 text-fg-muted">{product.brand ?? '—'}</td><td className="p-3 text-fg-muted">{product.category ?? '—'}</td><td className="p-3 text-right font-mono">{money(product.costUnit)}</td><td className="p-3 text-right font-mono font-semibold text-brand">{money(product.saleUnit)}</td>{showInternal && <td className="p-3 text-right font-mono text-fg-faint">{money(product.costBulk)}</td>}<td className="p-3 text-center font-mono text-fg-muted">{product.unitsPerBoxNum ?? product.unitsPerBox ?? '—'}</td><td className="p-3 font-mono text-xs text-fg-muted">{product.variants?.map((variant) => variant.uom).join(' · ') || '—'}</td><td className="p-3 font-mono text-xs text-fg-faint">{product.eanUnit ?? product.ean ?? '—'}</td>{tableColumns.map((path) => { const values = rawValuesAtPath(product.raw, path); return <td key={path} className="max-w-64 p-3 font-mono text-xs text-fg-muted"><span className="line-clamp-3 break-all" title={values.map(String).join(' · ')}>{values.length ? values.map(String).join(' · ') : '—'}</span></td>; })}<td className="p-3">{product.linkedProductId ? <span className="rounded-md border border-ok/30 bg-[var(--ok-soft)] px-2 py-1 text-xs text-ok">Importado</span> : product.costUnit == null ? <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 text-xs text-warn">Falta precio</span> : <span className="rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-muted">Sin importar</span>}</td><td className="p-3"><div className="flex gap-2"><button type="button" onClick={() => setDetail(product)} className="whitespace-nowrap text-brand hover:underline">Ver detalle</button>{product.link && <a href={product.link} target="_blank" rel="noreferrer" className="text-brand">↗</a>}</div></td></tr>)}</tbody></table></div>}
    {!loading && items.length === 0 && <p className="rounded-xl border border-hair-soft bg-surface p-8 text-center text-fg-faint">Sin productos sincronizados.</p>}

    <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-fg">Cambios de precio</h2><p className="text-sm text-fg-muted">Subas y bajas bruscas del costo.</p></div><div className="flex gap-3"><label className="text-xs text-fg-faint">Días<select value={days} onChange={(event) => setDays(Number(event.target.value))} className="mt-1 block rounded-lg border border-hair bg-raised px-3 py-2 text-fg"><option value={7}>7</option><option value={30}>30</option><option value={90}>90</option></select></label><label className="text-xs text-fg-faint">Umbral %<input type="number" min={0} value={threshold} onChange={(event) => setThreshold(Math.max(0, Number(event.target.value) || 0))} className="mt-1 block w-24 rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-fg" /></label></div></div>{changesLoading ? <Loader /> : changes.length ? <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-sm"><thead className="text-left text-xs uppercase text-fg-faint"><tr><th className="p-3">Producto</th><th className="p-3 text-right">Anterior</th><th className="p-3 text-right">Actual</th><th className="p-3 text-right">Cambio</th></tr></thead><tbody className="divide-y divide-hair-soft">{changes.map((change) => <tr key={change.syncedProductId}><td className="p-3 text-fg">{change.name}</td><td className="p-3 text-right font-mono">{money(change.from)}</td><td className="p-3 text-right font-mono">{money(change.to)}</td><td className={`p-3 text-right font-mono font-semibold ${change.direction === 'down' ? 'text-ok' : 'text-crit'}`}>{change.changePct > 0 ? '+' : ''}{change.changePct.toFixed(2)}%</td></tr>)}</tbody></table></div> : <p className="text-sm text-fg-faint">Sin cambios bruscos en el período.</p>}</section>

    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-hair bg-surface p-5"><div className="flex justify-between gap-3"><div><h2 className="text-xl font-semibold text-fg">{detail.name}</h2><p className="text-sm text-fg-muted">Códigos, empaque, variantes e historial</p></div><button type="button" onClick={() => setDetail(null)} aria-label="Cerrar"><X className="h-5 w-5 text-fg-muted" /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{[['EAN unidad', detail.eanUnit ?? detail.ean], ['EAN bulto', detail.eanBox], ['Ref. proveedor', detail.supplierRef], ['SKU', detail.sku], ['ID externo', detail.externalId], ['IVA', detail.ivaAlicuota != null ? `${Number(detail.ivaAlicuota)}%` : null], ['Unidades/display', detail.unitsPerDisplay], ['Displays/bulto', detail.displaysPerBox], ['Unidades/bulto', detail.unitsPerBox], ['Retornable', detail.retornable == null ? null : detail.retornable ? 'Sí' : 'No']].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-hair-soft bg-raised p-3"><span className="text-[10px] uppercase text-fg-faint">{label}</span><p className="break-all font-mono text-sm text-fg">{value ?? '—'}</p></div>)}</div><section className="mt-5 rounded-xl border border-hair-soft bg-raised p-4"><div className="flex justify-between gap-3"><h3 className="font-semibold text-fg">Evolución del costo</h3>{totalChange != null && <span className={`font-mono text-sm ${totalChange <= 0 ? 'text-ok' : 'text-crit'}`}>{totalChange > 0 ? '+' : ''}{totalChange.toFixed(2)}%</span>}</div>{historyLoading ? <Loader /> : chart.length <= 1 ? <p className="mt-3 text-sm text-fg-faint">Sin cambios registrados aún.</p> : <div className="mt-3 h-44"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid stroke="var(--hair-soft)" strokeDasharray="3 3" /><XAxis dataKey="date" stroke="var(--tx-3)" tick={{ fontSize: 10 }} /><YAxis stroke="var(--tx-3)" tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--hair)' }} formatter={(value) => money(value)} /><Line dataKey="cost" stroke="var(--brand-accent)" strokeWidth={2} /></LineChart></ResponsiveContainer></div>}</section><section className="mt-5"><h3 className="font-semibold text-fg">Variantes UN / DI / BU</h3><div className="mt-3 space-y-3">{detail.variants?.length ? detail.variants.map((variant) => <div key={variant.id} className="rounded-xl border border-hair-soft bg-raised p-3"><div className="flex justify-between"><span className="rounded-md bg-brand-highlight-soft px-2 py-1 font-mono font-semibold text-brand">{variant.uom}</span><span className="font-mono text-xs text-fg-faint">× {variant.multiplier} UN</span></div><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><p className="text-xs text-fg-faint">Costo <strong className="block font-mono text-fg">{money(variant.cost)}</strong></p><p className="text-xs text-fg-faint">Venta <strong className="block font-mono text-brand">{money(variant.sellingPrice)}</strong></p><p className="text-xs text-fg-faint">Stock <strong className="block font-mono text-fg">{variant.stock ?? '—'}</strong></p><p className="text-xs text-fg-faint">EAN <strong className="block break-all font-mono text-fg">{variant.ean ?? '—'}</strong></p></div></div>) : <p className="text-sm text-fg-faint">Sin variantes sincronizadas.</p>}</div></section><RawDataSection raw={detail.raw} /></div></div>}
  </Container>;
}

export default function CatalogoProveedorPage() { return <SyncProviderProvider><CatalogScreen /></SyncProviderProvider>; }
