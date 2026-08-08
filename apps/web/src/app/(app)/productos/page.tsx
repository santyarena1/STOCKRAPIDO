'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api, getApiBaseUrl } from '@/lib/api';
import { UnitPriceDisplay } from '@/components/UnitPriceDisplay';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { usePersistedState } from '@/lib/use-persisted-state';
import { Grid2X2, List, Search } from 'lucide-react';

type Product = {
  id: string; name: string; barcode?: string | null; price: string | number; cost?: string | number | null;
  stock: number; minStock: number; stockControl?: boolean; isActive?: boolean; brand?: string | null;
  categoryId?: string | null; category?: { id?: string; name: string } | null; expiresAt?: string | null;
  imageUrl?: string | null; unitsPerBox?: string | null; unitsPerBoxNum?: number | null;
  costBox?: number | null; priceBox?: number | null; weight?: string | null; format?: string | null;
  supplierSku?: string | null; sourceProvider?: string | null; sourceConnectionId?: string | null; updatedAt?: string;
  incomplete?: boolean; points?: number | null;
};
type IncompleteDraft = { categoryId: string; brand: string; cost: string; stockControl: boolean };
type Facets = {
  providers: { value: string; label: string; count: number }[];
  brands: { value: string; count: number }[];
  categories: { id: string; name: string; count: number }[];
  types: { value: string; count: number }[];
};
type StockSummary = {
  productCount: number; productsWithStock: number; productsNoStock: number; totalUnits: number;
  valueAtCostProduct: number; valueAtCostBatches: number; valueAtSale: number; potentialMargin: number;
  lowStockCount: number; expiringDaysWindow: number; expiringProductsCount: number; expiringUnitsInWindow: number;
  productsWithoutCostWithStock: number;
  expiringByProduct: { name: string; expiresAt: string; qtyExpiring: number }[];
  expiringBatches: { id: string; productId: string; productName: string; qty: number; expiresAt: string; unitCost: number }[];
};
type Filters = { q: string; categoryId: string; brand: string; provider: string; type: string; status: 'active' | 'inactive' | 'all'; hasStock: boolean; stockControl: boolean };
type SortKey = 'name' | 'price' | 'cost' | 'stock' | 'updatedAt' | 'brand' | 'category';
type ColumnKey = 'image' | 'name' | 'origin' | 'sku' | 'category' | 'brand' | 'type' | 'cost' | 'price' | 'margin' | 'stock' | 'minStock' | 'expiresAt' | 'stockControl' | 'actions';
type ColumnSetting = { key: ColumnKey; label: string; visible: boolean };
type SavedView = { id: string; name: string; filters: Filters; columns: ColumnSetting[]; mode: 'catalog' | 'stock'; sort: SortKey; dir: 'asc' | 'desc' };

const EMPTY_FILTERS: Filters = { q: '', categoryId: '', brand: '', provider: '', type: '', status: 'active', hasStock: false, stockControl: false };
const DEFAULT_COLUMNS: ColumnSetting[] = [
  { key: 'image', label: 'Imagen', visible: true }, { key: 'name', label: 'Nombre', visible: true },
  { key: 'origin', label: 'Origen', visible: true }, { key: 'sku', label: 'SKU', visible: true },
  { key: 'category', label: 'Categoría', visible: true }, { key: 'brand', label: 'Marca', visible: true },
  { key: 'type', label: 'Tipo', visible: true }, { key: 'cost', label: 'Costo c/u', visible: true },
  { key: 'price', label: 'Precio c/u', visible: true }, { key: 'margin', label: 'Margen', visible: true },
  { key: 'stock', label: 'Stock', visible: true }, { key: 'minStock', label: 'Mínimo', visible: true },
  { key: 'expiresAt', label: 'Vencimiento', visible: true }, { key: 'stockControl', label: 'Control', visible: true },
  { key: 'actions', label: 'Acciones', visible: true },
];
const STOCK_COLUMNS = new Set<ColumnKey>(['stock', 'minStock', 'expiresAt', 'stockControl']);
const SORTABLE: Partial<Record<ColumnKey, SortKey>> = { name: 'name', price: 'price', cost: 'cost', stock: 'stock', brand: 'brand', category: 'category' };

function formatMoneyArs(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [facets, setFacets] = useState<Facets>({ providers: [], brands: [], categories: [], types: [] });
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [filters, setFilters] = usePersistedState<Filters>('sr-filters:productos:catalog', EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [mode, setMode] = useState<'catalog' | 'stock'>('catalog');
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [showCardFilters, setShowCardFilters] = useState(false);
  const [cardsLowStock, setCardsLowStock] = useState(false);
  const [columns, setColumns] = useState<ColumnSetting[]>(DEFAULT_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [sort, setSort] = useState<SortKey>('name');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkInternal, setShowBulkInternal] = useState(false);
  const [hideCategories, setHideCategories] = useState(true);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>([]);
  const [showHiddenCategories, setShowHiddenCategories] = useState(false);
  const [savingHiddenCategories, setSavingHiddenCategories] = useState(false);
  const [incompleteProducts, setIncompleteProducts] = useState<Product[]>([]);
  const [incompleteDrafts, setIncompleteDrafts] = useState<Record<string, IncompleteDraft>>({});
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [savingIncompleteId, setSavingIncompleteId] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Array<{ barcode: string; count: number; products: Product[] }>>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateKeep, setDuplicateKeep] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; errors: Array<{ row: number; message: string }> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('sr-prod-mode');
      if (savedMode === 'stock' || savedMode === 'catalog') setMode(savedMode);
      const savedView = localStorage.getItem('sr-prod-view');
      if (savedView === 'cards' || savedView === 'list') setView(savedView);
      const savedColumns = JSON.parse(localStorage.getItem('sr-prod-columns') || 'null');
      if (Array.isArray(savedColumns)) setColumns(savedColumns);
      const savedViews = JSON.parse(localStorage.getItem('sr-prod-views') || '[]');
      if (Array.isArray(savedViews)) setViews(savedViews);
      setHideCategories(localStorage.getItem('sr-prod-hide-cats-on') !== 'false');
      const savedHiddenCategories = JSON.parse(localStorage.getItem('sr-prod-hidden-cats') || '[]');
      if (Array.isArray(savedHiddenCategories)) setHiddenCategoryIds(savedHiddenCategories.filter((id): id is string => typeof id === 'string'));
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-mode', mode); }, [hydrated, mode]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-view', view); }, [hydrated, view]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-columns', JSON.stringify(columns)); }, [hydrated, columns]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-views', JSON.stringify(views)); }, [hydrated, views]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-hide-cats-on', String(hideCategories)); }, [hydrated, hideCategories]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-hidden-cats', JSON.stringify(hiddenCategoryIds)); }, [hydrated, hiddenCategoryIds]);
  useEffect(() => { if (hydrated && searchInput !== filters.q) setSearchInput(filters.q); }, [hydrated, filters.q]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((current) => ({ ...current, q: searchInput.trim() })), 300); return () => window.clearTimeout(timer); }, [searchInput]);

  const fetchProducts = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const result = await api<{ items: Product[]; total: number; page: number; pageSize: number; totalPages: number }>('/products/catalog', {
        params: {
          q: filters.q || undefined, categoryId: filters.categoryId || undefined, brand: filters.brand || undefined,
          provider: filters.provider || undefined, type: filters.type || undefined, status: filters.status,
          excludeCategoryIds: hideCategories && hiddenCategoryIds.length ? hiddenCategoryIds.join(',') : undefined,
          hasStock: filters.hasStock ? 'true' : undefined, stockControl: filters.stockControl ? 'true' : undefined,
          sort, dir, page: String(page), pageSize: String(pageSize),
        },
      });
      setProducts(result.items); setTotal(result.total); setTotalPages(result.totalPages);
    } catch (error) { alert(error instanceof Error ? error.message : 'Error al cargar productos'); }
    finally { setLoading(false); }
  }, [hydrated, filters, hideCategories, hiddenCategoryIds, sort, dir, page, pageSize]);

  const loadIncompleteProducts = useCallback(async () => {
    try {
      const data = await api<Product[]>('/products/incomplete');
      setIncompleteProducts(data);
      setIncompleteDrafts((current) => Object.fromEntries(data.map((product) => [product.id, current[product.id] ?? {
        categoryId: product.categoryId ?? '', brand: product.brand ?? '', cost: product.cost == null ? '' : String(product.cost), stockControl: product.stockControl ?? false,
      }])));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al cargar productos incompletos');
    }
  }, []);

  useEffect(() => { if (!hydrated) return; Promise.allSettled([api<Facets>('/products/facets'), api<StockSummary>('/reports/stock-summary'), api<{ posConfig?: { hiddenCategoryIds?: string[] } }>('/business/me')]).then(([facetResult, summaryResult, businessResult]) => { if (facetResult.status === 'fulfilled') setFacets(facetResult.value); if (summaryResult.status === 'fulfilled') setStockSummary(summaryResult.value); if (businessResult.status === 'fulfilled') { const ids = businessResult.value.posConfig?.hiddenCategoryIds; setHiddenCategoryIds(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []); } }); }, [hydrated]);
  useEffect(() => { if (hydrated) void loadIncompleteProducts(); }, [hydrated, loadIncompleteProducts]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [filters, sort, dir, pageSize]);

  const filtered = products;
  const cardProducts = cardsLowStock ? products.filter((product) => product.stock <= product.minStock) : products;
  const now = new Date();
  const visibleColumns = columns.filter((column) => column.visible && (mode === 'stock' || !STOCK_COLUMNS.has(column.key)));
  const daysUntilExpiry = (value?: string | null) => value ? Math.ceil((new Date(value).getTime() - now.getTime()) / 86400000) : null;

  const handleExportStock = (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (exporting) return;
    setExportMsg('Preparando descarga…'); setExporting(true); setImportResult(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const url = `${getApiBaseUrl()}/products/export-stock`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => res.text().then((raw) => ({ ok: res.ok, raw })))
      .then(({ ok, raw }) => {
        let parsed: { message?: string; filename?: string; content?: string };
        try { parsed = JSON.parse(raw) as { message?: string; filename?: string; content?: string }; }
        catch { throw new Error('La respuesta no es JSON válido'); }
        if (!ok) throw new Error(parsed?.message || 'Error al exportar');
        if (!parsed?.content || typeof parsed.filename !== 'string') throw new Error(parsed?.message || 'La API no devolvió el archivo');
        const base64 = String(parsed.content).replace(/\s/g, ''); const binary = atob(base64); const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = parsed.filename; link.style.position = 'fixed'; link.style.left = '-9999px'; link.style.top = '0'; document.body.appendChild(link); link.click();
        setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(link.href); }, 2000); setExportMsg(null);
      }).catch((err) => { setExportMsg(null); alert(err instanceof Error ? err.message : 'Error al exportar'); }).finally(() => setExporting(false));
  };

  const handleExportTxt = () => {
    if (filtered.length === 0) { alert('No hay productos para exportar con los filtros actuales.'); return; }
    const plain = (s: string) => String(s).replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim();
    const csvCell = (raw: string | number) => { const s = String(raw); if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`; return s; };
    const SEP = ';';
    const header = ['id', 'nombre', 'codigo_barras', 'stock', 'stock_minimo', 'categoria', 'precio_venta', 'costo', 'marca', 'vencimiento', 'control_stock'];
    const lines = filtered.map((p) => {
      const price = typeof p.price === 'number' ? p.price : parseFloat(String(p.price ?? '0')) || 0;
      const costRaw = p.cost; const costNum = costRaw != null && costRaw !== '' ? (typeof costRaw === 'number' ? costRaw : parseFloat(String(costRaw))) || 0 : null;
      const ven = p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : '';
      return [csvCell(p.id ?? ''), csvCell(plain(p.name ?? '')), csvCell(plain(p.barcode ?? '')), csvCell(String(p.stock ?? 0)), csvCell(String(p.minStock ?? 0)), csvCell(plain(p.category?.name ?? '')), csvCell(price.toFixed(2)), csvCell(costNum == null ? '' : costNum.toFixed(2)), csvCell(plain(p.brand ?? '')), csvCell(ven), csvCell(p.stockControl === false ? 'No' : 'Sí')].join(SEP);
    });
    const content = `\uFEFF${header.join(SEP)}\n${lines.join('\n')}`; const blob = new Blob([content], { type: 'text/csv;charset=utf-8' }); const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `stock-${new Date().toISOString().slice(0, 10)}.csv`; link.style.position = 'fixed'; link.style.left = '-9999px'; document.body.appendChild(link); link.click();
    setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(link.href); }, 500);
  };

  const handleImportStock = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      setImporting(true); setImportResult(null); const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null; const form = new FormData(); form.append('file', file);
      const res = await fetch(`${getApiBaseUrl()}/products/import-stock`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error((data as { message?: string }).message || res.statusText);
      setImportResult(data as { updated: number; errors: Array<{ row: number; message: string }> }); fetchProducts();
    } catch (err) { alert(err instanceof Error ? err.message : 'Error al importar'); }
    finally { setImporting(false); e.target.value = ''; }
  };

  const changeFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const saveHiddenCategories = async () => {
    setSavingHiddenCategories(true);
    try {
      await api('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({ posConfig: { hiddenCategoryIds } }),
      });
      localStorage.setItem('sr-prod-hidden-cats', JSON.stringify(hiddenCategoryIds));
      setShowHiddenCategories(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudieron guardar las categorías ocultas.');
    } finally {
      setSavingHiddenCategories(false);
    }
  };
  const changeSort = (next: SortKey) => { if (sort === next) setDir((current) => current === 'asc' ? 'desc' : 'asc'); else { setSort(next); setDir('asc'); } };
  const moveColumn = (index: number, direction: -1 | 1) => setColumns((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });

  const saveView = () => {
    const name = prompt('Nombre de la vista:')?.trim(); if (!name) return;
    setViews((current) => [...current, { id: `${Date.now()}`, name, filters, columns, mode, sort, dir }]);
  };
  const applyView = (id: string) => { const view = views.find((item) => item.id === id); if (!view) return; setFilters(view.filters); setSearchInput(view.filters.q); setColumns(view.columns); setMode(view.mode); setSort(view.sort); setDir(view.dir); };

  const runBulk = async (action: 'setPrice' | 'applyMarkup' | 'setCategory' | 'setStockControl' | 'setActive' | 'delete', value?: unknown) => {
    if (selected.size === 0) return;
    try {
      const result = await api<{ updated: number; skipped: { id: string; reason: string }[] }>('/products/bulk', { method: 'POST', body: JSON.stringify({ ids: [...selected], action, value }) });
      setBulkMessage(`${result.updated} actualizados${result.skipped.length ? ` · ${result.skipped.length} omitidos: ${result.skipped.slice(0, 3).map((item) => item.reason).join('; ')}` : ''}`);
      setSelected(new Set()); await fetchProducts();
    } catch (error) { alert(error instanceof Error ? error.message : 'Error en acción masiva'); }
  };
  const promptBulkNumber = (action: 'setPrice' | 'applyMarkup', label: string) => { const raw = prompt(label); if (raw == null) return; const value = Number(raw); if (!Number.isFinite(value)) return alert('Ingresá un número válido.'); runBulk(action, value); };

  const openDuplicates = async () => {
    try { const groups = await api<Array<{ barcode: string; count: number; products: Product[] }>>('/products/duplicates'); setDuplicates(groups); setDuplicateKeep(Object.fromEntries(groups.map((group) => [group.barcode, group.products[0]?.id ?? '']))); setShowDuplicates(true); }
    catch (error) { alert(error instanceof Error ? error.message : 'Error al buscar duplicados'); }
  };
  const mergeDuplicate = async (group: { barcode: string; products: Product[] }) => {
    const keepId = duplicateKeep[group.barcode]; if (!keepId) return;
    try { await api('/products/duplicates/merge', { method: 'POST', body: JSON.stringify({ keepId, mergeIds: group.products.filter((product) => product.id !== keepId).map((product) => product.id) }) }); await openDuplicates(); await fetchProducts(); }
    catch (error) { alert(error instanceof Error ? error.message : 'Error al fusionar duplicados'); }
  };

  const saveIncompleteProduct = async (product: Product) => {
    const draft = incompleteDrafts[product.id];
    if (!draft) return;
    const cost = draft.cost.trim() === '' ? null : Number(draft.cost.replace(',', '.'));
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return alert('Ingresá un costo válido.');
    setSavingIncompleteId(product.id);
    try {
      await api(`/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ categoryId: draft.categoryId || null, brand: draft.brand.trim() || null, cost, stockControl: draft.stockControl, incomplete: false }),
      });
      setIncompleteProducts((current) => current.filter((item) => item.id !== product.id));
      setIncompleteDrafts((current) => { const next = { ...current }; delete next[product.id]; return next; });
      await fetchProducts();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al completar el producto');
    } finally {
      setSavingIncompleteId(null);
    }
  };

  const renderCell = (product: Product, key: ColumnKey): ReactNode => {
    const cost = product.cost == null ? null : Number(product.cost); const price = Number(product.price); const margin = cost == null ? null : price - cost;
    if (key === 'image') return product.imageUrl ? <img src={product.imageUrl} alt="" className="h-10 w-10 rounded-lg bg-raised2 object-contain" /> : <div className="h-10 w-10 rounded-lg bg-raised2" />;
    if (key === 'name') return <div><div className="flex items-center gap-2"><Link href={`/productos/${product.id}`} className="font-semibold text-fg hover:text-brand hover:underline">{product.name}</Link>{product.incomplete && <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warn">Incompleto</span>}</div><span className="block font-mono text-xs tabular-nums text-fg-faint">{[product.barcode, product.unitsPerBox ? `x${product.unitsPerBox}` : null].filter(Boolean).join(' · ')}</span></div>;
    if (key === 'origin') return product.sourceProvider ? <span className="rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-muted">{product.sourceProvider}</span> : <span className="text-fg-faint">—</span>;
    if (key === 'sku') return <span className="font-mono text-xs text-fg-muted">{product.supplierSku || '—'}</span>;
    if (key === 'category') return <span className="text-fg-muted">{product.category?.name || '—'}</span>;
    if (key === 'brand') return <span className="text-fg-muted">{product.brand || '—'}</span>;
    if (key === 'type') return <span className="text-fg-muted">{product.format || '—'}</span>;
    if (key === 'cost') return cost == null ? <span className="text-fg-faint">—</span> : <UnitPriceDisplay cost={product.cost} unitsPerBox={product.unitsPerBox} unitsPerBoxNum={product.unitsPerBoxNum} costBox={product.costBox} showCost showPrice={false} showBulkInternal={showBulkInternal} />;
    if (key === 'price') return <UnitPriceDisplay price={product.price} unitsPerBox={product.unitsPerBox} unitsPerBoxNum={product.unitsPerBoxNum} priceBox={product.priceBox} showBulkInternal={showBulkInternal} />;
    if (key === 'margin') return <span className={`font-mono tabular-nums ${margin != null && margin >= 0 ? 'text-ok' : 'text-crit'}`}>{margin == null ? '—' : formatMoneyArs(margin)}</span>;
    if (key === 'stock') return <span className={`rounded-md border px-2 py-1 font-mono text-xs tabular-nums ${product.stock <= product.minStock ? 'border-warn/30 bg-[var(--warn-soft)] text-warn' : 'border-hair bg-raised2 text-fg'}`}>{product.stock}</span>;
    if (key === 'minStock') return <span className="font-mono tabular-nums text-fg-faint">{product.minStock}</span>;
    if (key === 'expiresAt') { const days = daysUntilExpiry(product.expiresAt); if (days == null) return <span className="text-fg-faint">—</span>; if (days < 0) return <span className="rounded-md border border-crit/30 bg-[var(--crit-soft)] px-2 py-1 text-crit">Vencido</span>; if (days <= 30) return <span className="rounded-md border border-crit/30 bg-[var(--crit-soft)] px-2 py-1 font-mono text-crit">{days} días</span>; return <span className="font-mono text-fg-muted">{new Date(product.expiresAt!).toLocaleDateString('es-AR')}</span>; }
    if (key === 'stockControl') return <span className={`rounded-md border px-2 py-1 text-xs ${product.stockControl ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-hair bg-raised2 text-fg-faint'}`}>{product.stockControl ? 'Sí' : 'No'}</span>;
    return <Link href={`/productos/${product.id}`} className="text-brand hover:underline">Editar</Link>;
  };

  return <Container className="space-y-6">
    <PageHeader title="Productos" subtitle={view === 'cards' ? 'Tocá un producto para editarlo' : 'Gestioná catálogo, precios, costos y niveles de stock.'} actions={<div className="flex flex-wrap items-center gap-2">
      {view === 'list' && <>
        <a href="#" role="button" onClick={(event) => handleExportStock(event)} className="inline-block cursor-pointer select-none rounded-lg border border-hair bg-raised px-4 py-2 font-medium text-fg no-underline hover:bg-raised2" style={{ pointerEvents: exporting ? 'none' : undefined, opacity: exporting ? 0.6 : 1 }}>{exporting ? 'Exportando…' : 'Exportar stock (Excel)'}</a>
        <button type="button" onClick={handleExportTxt} className="rounded-lg border border-hair bg-raised px-4 py-2 font-medium text-fg hover:bg-raised2">Exportar lista (CSV)</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="rounded-lg border border-hair bg-raised px-4 py-2 font-medium text-fg hover:bg-raised2 disabled:opacity-50">{importing ? 'Importando…' : 'Importar stock (Excel)'}</button>
        <button type="button" disabled={incompleteProducts.length === 0} onClick={() => { setShowIncomplete(true); void loadIncompleteProducts(); }} className="rounded-lg border border-warn/30 bg-[var(--warn-soft)] px-4 py-2 font-medium text-warn hover:bg-raised2 disabled:cursor-not-allowed disabled:opacity-50">Completar productos <span className="font-mono tabular-nums">({incompleteProducts.length})</span></button>
      </>}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportStock} />
      <Link href="/productos/nuevo" data-tour="productos-nuevo" className={`btn-brand font-semibold ${view === 'cards' ? 'rounded-xl px-6 py-3 text-base' : 'rounded-lg px-4 py-2'}`}>{view === 'cards' ? '+ Nuevo producto' : 'Nuevo producto'}</Link>
    </div>} />
    {exportMsg && <p className="text-sm text-warn">{exportMsg}</p>}
    {importResult && <div className="rounded-lg border border-hair bg-raised p-3 text-sm text-fg">Importación: <strong className="font-mono">{importResult.updated}</strong> producto(s) actualizado(s). {importResult.errors.length > 0 && <span className="text-warn">Errores en {importResult.errors.length} fila(s): {importResult.errors.slice(0, 5).map((error) => `Fila ${error.row}: ${error.message}`).join('; ')}</span>}</div>}

    {view === 'cards' ? <>
      <section data-tour="productos-filters" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-fg-faint" />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar un producto…" className="h-16 w-full rounded-2xl border-2 border-hair bg-surface pl-14 pr-5 text-lg text-fg shadow-sm outline-none placeholder:text-fg-faint focus:border-[color:var(--brand-accent)]" />
          </div>
          <div className="inline-flex self-end rounded-xl border border-hair bg-surface p-1 shadow-sm sm:self-auto" aria-label="Vista de productos">
            <button type="button" onClick={() => setView('cards')} className="flex items-center gap-2 rounded-lg bg-raised2 px-4 py-2.5 text-sm font-semibold text-fg"><Grid2X2 className="h-4 w-4" />Tarjetas</button>
            <button type="button" onClick={() => setView('list')} className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-fg-muted hover:bg-raised"><List className="h-4 w-4" />Lista</button>
          </div>
        </div>
        <div data-tour="productos-stock-summary" className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { changeFilter('categoryId', ''); setCardsLowStock(false); }} className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${!filters.categoryId && !cardsLowStock ? 'border-[color:var(--brand-accent)] bg-brand-highlight-soft text-brand' : 'border-hair bg-surface text-fg-muted hover:bg-raised'}`}>Todas <span className="font-mono tabular-nums">({total})</span></button>
          {facets.categories.map((category) => <button key={category.id} type="button" onClick={() => { changeFilter('categoryId', category.id); setCardsLowStock(false); }} className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${filters.categoryId === category.id && !cardsLowStock ? 'border-[color:var(--brand-accent)] bg-brand-highlight-soft text-brand' : 'border-hair bg-surface text-fg-muted hover:bg-raised'}`}>{category.name} <span className="font-mono tabular-nums">({category.count})</span></button>)}
          <button type="button" onClick={() => { setCardsLowStock((current) => !current); changeFilter('categoryId', ''); }} className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${cardsLowStock ? 'border-warn bg-[var(--warn-soft)] text-warn' : 'border-warn/30 bg-surface text-warn hover:bg-[var(--warn-soft)]'}`}>⚠ Stock bajo <span className="font-mono tabular-nums">({stockSummary?.lowStockCount ?? 0})</span></button>
          <button type="button" onClick={() => setShowCardFilters((current) => !current)} className="rounded-full border border-hair bg-surface px-4 py-2 text-sm font-medium text-fg-muted hover:bg-raised">{showCardFilters ? 'Menos filtros' : 'Más filtros'}</button>
        </div>
        {showCardFilters && <div className="grid gap-3 rounded-2xl border border-hair-soft bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-fg-muted">Proveedor<select value={filters.provider} onChange={(event) => changeFilter('provider', event.target.value)} className="mt-1.5 w-full rounded-xl border border-hair bg-raised px-3 py-2.5 text-sm text-fg"><option value="">Todos</option>{facets.providers.map((item) => <option key={item.value} value={item.value}>{item.label} ({item.count})</option>)}</select></label>
          <label className="text-xs font-medium text-fg-muted">Marca<select value={filters.brand} onChange={(event) => changeFilter('brand', event.target.value)} className="mt-1.5 w-full rounded-xl border border-hair bg-raised px-3 py-2.5 text-sm text-fg"><option value="">Todas</option>{facets.brands.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select></label>
          <label className="text-xs font-medium text-fg-muted">Tipo<select value={filters.type} onChange={(event) => changeFilter('type', event.target.value)} className="mt-1.5 w-full rounded-xl border border-hair bg-raised px-3 py-2.5 text-sm text-fg"><option value="">Todos</option>{facets.types.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select></label>
          <label className="text-xs font-medium text-fg-muted">Estado<select value={filters.status} onChange={(event) => changeFilter('status', event.target.value as Filters['status'])} className="mt-1.5 w-full rounded-xl border border-hair bg-raised px-3 py-2.5 text-sm text-fg"><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select></label>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4"><label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={filters.hasStock} onChange={(event) => changeFilter('hasStock', event.target.checked)} />Con stock</label><label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={filters.stockControl} onChange={(event) => changeFilter('stockControl', event.target.checked)} />Control de stock</label><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setSearchInput(''); setCardsLowStock(false); }} className="text-sm font-medium text-brand hover:underline">Limpiar filtros</button></div>
        </div>}
      </section>

      <div data-tour="productos-table">
        {loading ? <Loader /> : cardProducts.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">{cardProducts.map((product) => { const expiryDays = daysUntilExpiry(product.expiresAt); const lowStock = product.stock <= product.minStock; return <Link key={product.id} href={`/productos/${product.id}`} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-hair-soft bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[color:var(--brand-accent)] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]">
          <div className="relative aspect-square overflow-hidden bg-raised p-5">
            <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">{lowStock && <span className="rounded-md border border-warn/40 bg-[var(--warn-soft)] px-2 py-1 text-xs font-semibold text-warn backdrop-blur">Stock bajo</span>}{expiryDays != null && expiryDays <= 30 && <span className="rounded-md border border-crit/40 bg-[var(--crit-soft)] px-2 py-1 text-xs font-semibold text-crit backdrop-blur">Vence pronto</span>}{product.incomplete && <span className="rounded-md border border-warn/40 bg-[var(--warn-soft)] px-2 py-1 text-xs font-semibold text-warn backdrop-blur">Incompleto</span>}</div>
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.03]" /> : <div className="flex h-full w-full items-center justify-center rounded-xl border border-hair-soft bg-surface text-5xl font-bold text-fg-faint">{product.name.trim().slice(0, 2).toUpperCase()}</div>}
          </div>
          <div className="flex flex-1 flex-col p-4">
            <h2 className="min-h-12 overflow-hidden text-base font-semibold leading-6 text-fg [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{product.name}</h2>
            <p className="mt-1 truncate text-sm text-fg-faint">{product.category?.name || 'Sin categoría'} · {product.brand || 'Sin marca'}</p>
            {product.points != null && <span className="mt-2 self-start rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 font-mono text-xs text-warn">★ {product.points} pts</span>}
            <div className="mt-4 flex items-end justify-between gap-3 border-t border-hair-soft pt-4"><span className="font-mono text-2xl font-bold tabular-nums text-brand">{formatMoneyArs(Number(product.price))}</span><span className="flex items-center gap-2 text-sm text-fg-muted"><span className={`h-2.5 w-2.5 rounded-full ${lowStock ? 'bg-warn' : 'bg-ok'}`} /><span className="font-mono tabular-nums">{product.stock}</span></span></div>
            <span className="mt-4 block w-full rounded-xl border border-hair bg-raised px-4 py-2.5 text-center text-sm font-semibold text-fg-muted transition-colors group-hover:border-[color:var(--brand-accent)] group-hover:bg-brand-highlight-soft group-hover:text-brand">Editar</span>
          </div>
        </Link>; })}</div> : <div className="rounded-2xl border border-hair-soft bg-surface p-10 text-center"><p className="text-lg font-medium text-fg">No encontramos productos</p><p className="mt-1 text-sm text-fg-muted">Probá con otra búsqueda o cambiá los filtros.</p></div>}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-hair-soft bg-surface p-4 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between"><p><span className="font-mono tabular-nums text-fg">{cardsLowStock ? cardProducts.length : total}</span> productos · Página <span className="font-mono">{page}</span> de <span className="font-mono">{totalPages || 1}</span></p><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="min-h-11 flex-1 rounded-xl border border-hair px-5 py-2 font-medium disabled:opacity-40 sm:flex-none">Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="min-h-11 flex-1 rounded-xl border border-hair px-5 py-2 font-medium disabled:opacity-40 sm:flex-none">Siguiente</button></div></div>
    </> : <>
    {stockSummary && <section data-tour="productos-stock-summary" className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-xl border border-hair-soft border-l-4 border-l-[color:var(--brand-accent)] bg-surface p-4"><p className="text-xs text-fg-muted">Productos</p><p className="font-mono text-3xl font-bold tabular-nums text-fg">{stockSummary.productCount}</p><p className="font-mono text-xs text-fg-faint">Con stock {stockSummary.productsWithStock} · Sin stock {stockSummary.productsNoStock}</p></div>
      <div className="rounded-xl border border-hair-soft bg-surface p-4"><p className="text-xs text-fg-muted">Valor de venta</p><p className="font-mono text-2xl font-bold tabular-nums text-brand">{formatMoneyArs(stockSummary.valueAtSale)}</p><p className="font-mono text-xs text-ok">Margen {formatMoneyArs(stockSummary.potentialMargin)}</p></div>
      <div className="rounded-xl border border-warn/30 border-l-4 border-l-warn bg-[var(--warn-soft)] p-4"><p className="text-xs text-warn">Stock bajo</p><p className="font-mono text-3xl font-bold text-warn">{stockSummary.lowStockCount}</p><p className="font-mono text-xs text-fg-muted">{stockSummary.totalUnits} unidades totales</p></div>
      <div className="rounded-xl border border-crit/30 border-l-4 border-l-crit bg-[var(--crit-soft)] p-4"><p className="text-xs text-crit">Por vencer ({stockSummary.expiringDaysWindow} días)</p><p className="font-mono text-3xl font-bold text-crit">{stockSummary.expiringUnitsInWindow}</p><p className="font-mono text-xs text-fg-muted">{stockSummary.expiringProductsCount} productos</p></div>
    </div><details className="rounded-xl border border-hair-soft bg-surface p-4"><summary className="cursor-pointer font-medium text-fg">Más estadísticas y vencimientos</summary><div className="mt-4 grid gap-3 sm:grid-cols-3"><p className="text-sm text-fg-muted">Costo productos <strong className="block font-mono text-fg">{formatMoneyArs(stockSummary.valueAtCostProduct)}</strong></p><p className="text-sm text-fg-muted">Costo lotes <strong className="block font-mono text-fg">{formatMoneyArs(stockSummary.valueAtCostBatches)}</strong></p><p className="text-sm text-fg-muted">Sin costo con stock <strong className="block font-mono text-warn">{stockSummary.productsWithoutCostWithStock}</strong></p></div>{(stockSummary.expiringBatches.length > 0 || stockSummary.expiringByProduct.length > 0) && <div className="mt-4 grid gap-4 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold text-fg">Lotes por vencer</h3>{stockSummary.expiringBatches.map((batch) => <div key={batch.id} className="flex justify-between border-t border-hair-soft py-2 text-sm"><Link href={`/productos/${batch.productId}`} className="text-brand">{batch.productName}</Link><span className="font-mono text-fg-muted">{batch.qty} · {new Date(batch.expiresAt).toLocaleDateString('es-AR')}</span></div>)}</div><div><h3 className="mb-2 text-sm font-semibold text-fg">Próximo vencimiento por producto</h3>{stockSummary.expiringByProduct.map((item, index) => <div key={`${item.name}-${index}`} className="flex justify-between border-t border-hair-soft py-2 text-sm"><span className="text-fg">{item.name}</span><span className="font-mono text-fg-muted">{item.qtyExpiring} · {new Date(`${item.expiresAt}T12:00:00`).toLocaleDateString('es-AR')}</span></div>)}</div></div>}</details></section>}

    <section data-tour="productos-filters" className="space-y-3 rounded-xl border border-hair-soft bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2"><div className="inline-flex rounded-lg border border-hair bg-raised p-1"><button type="button" onClick={() => setView('cards')} className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-fg-faint hover:bg-raised2"><Grid2X2 className="h-4 w-4" />Tarjetas</button><button type="button" onClick={() => setView('list')} className="flex items-center gap-2 rounded-md bg-raised2 px-3 py-1.5 text-sm text-fg"><List className="h-4 w-4" />Lista</button></div><div className="inline-flex rounded-lg border border-hair bg-raised p-1"><button type="button" onClick={() => setMode('catalog')} className={`rounded-md px-3 py-1.5 text-sm ${mode === 'catalog' ? 'bg-raised2 text-fg' : 'text-fg-faint'}`}>Catálogo</button><button type="button" onClick={() => setMode('stock')} className={`rounded-md px-3 py-1.5 text-sm ${mode === 'stock' ? 'bg-raised2 text-fg' : 'text-fg-faint'}`}>Stock</button></div>
        <select defaultValue="" onChange={(event) => { applyView(event.target.value); event.target.value = ''; }} className="rounded-lg border border-hair bg-raised px-3 py-2 text-sm text-fg"><option value="">Mis vistas</option>{views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select><button type="button" onClick={saveView} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised">Guardar vista</button>{views.length > 0 && <button type="button" onClick={() => { const id = prompt(`ID de vista a borrar:\n${views.map((view) => `${view.id}: ${view.name}`).join('\n')}`); if (id) setViews((current) => current.filter((view) => view.id !== id)); }} className="rounded-lg border border-hair px-3 py-2 text-sm text-crit">Borrar vista</button>}
        <button type="button" onClick={() => setShowColumns((current) => !current)} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised">Columnas</button><button type="button" onClick={openDuplicates} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised">Duplicados (EAN)</button>
      </div>
      {showColumns && <div className="grid gap-2 rounded-lg border border-hair bg-raised p-3 sm:grid-cols-2 lg:grid-cols-3">{columns.map((column, index) => <div key={column.key} className="flex items-center gap-2"><input type="checkbox" checked={column.visible} onChange={(event) => setColumns((current) => current.map((item) => item.key === column.key ? { ...item, visible: event.target.checked } : item))} /><span className="min-w-0 flex-1 text-sm text-fg-muted">{column.label}</span><button type="button" onClick={() => moveColumn(index, -1)} className="text-fg-faint">↑</button><button type="button" onClick={() => moveColumn(index, 1)} className="text-fg-faint">↓</button></div>)}</div>}
      <div className="flex flex-wrap gap-2 [&>select]:w-full sm:[&>select]:w-auto"><div className="relative w-full sm:min-w-[220px] sm:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar nombre, EAN, marca, SKU…" className="w-full rounded-lg border border-hair bg-raised py-2 pl-9 pr-3 text-fg placeholder:text-fg-faint" /></div>
        <select value={filters.provider} onChange={(event) => changeFilter('provider', event.target.value)} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg"><option value="">Todos los proveedores</option>{facets.providers.map((item) => <option key={item.value} value={item.value}>{item.label} ({item.count})</option>)}</select>
        <select value={filters.categoryId} onChange={(event) => changeFilter('categoryId', event.target.value)} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg"><option value="">Todas las categorías</option>{facets.categories.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.count})</option>)}</select>
        <select value={filters.brand} onChange={(event) => changeFilter('brand', event.target.value)} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg"><option value="">Todas las marcas</option>{facets.brands.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select>
        <select value={filters.type} onChange={(event) => changeFilter('type', event.target.value)} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg"><option value="">Todos los tipos</option>{facets.types.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select>
        <select value={filters.status} onChange={(event) => changeFilter('status', event.target.value as Filters['status'])} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg"><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select>
      </div><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={filters.hasStock} onChange={(event) => changeFilter('hasStock', event.target.checked)} />Con stock</label><label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={filters.stockControl} onChange={(event) => changeFilter('stockControl', event.target.checked)} />Control de stock</label><label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={showBulkInternal} onChange={(event) => setShowBulkInternal(event.target.checked)} />Ver bulto interno</label><span className="h-5 w-px bg-[var(--hair-soft)]" /><label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={hideCategories} onChange={(event) => setHideCategories(event.target.checked)} />Ocultar categorías</label><span className="rounded-md border border-hair bg-raised2 px-2 py-1 font-mono text-xs tabular-nums text-fg-faint">{hiddenCategoryIds.length} categorías ocultas</span><button type="button" onClick={() => setShowHiddenCategories(true)} className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted hover:bg-raised">Elegir categorías ocultas</button><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setSearchInput(''); }} className="text-sm text-brand hover:underline">Limpiar filtros</button></div>
    </section>

    {selected.size > 0 && <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--brand-accent)] bg-surface p-3 shadow-lg"><strong className="font-mono text-brand">{selected.size} seleccionados</strong><button onClick={() => promptBulkNumber('applyMarkup', 'Markup (%):')} className="rounded-lg border border-hair px-3 py-1.5 text-sm">Aplicar markup</button><button onClick={() => promptBulkNumber('setPrice', 'Precio fijo:')} className="rounded-lg border border-hair px-3 py-1.5 text-sm">Fijar precio</button><button onClick={() => { const id = prompt(`ID de categoría:\n${facets.categories.map((item) => `${item.id}: ${item.name}`).join('\n')}`); if (id) runBulk('setCategory', id); }} className="rounded-lg border border-hair px-3 py-1.5 text-sm">Asignar categoría</button><button onClick={() => runBulk('setActive', true)} className="rounded-lg border border-ok/30 px-3 py-1.5 text-sm text-ok">Activar</button><button onClick={() => runBulk('setActive', false)} className="rounded-lg border border-warn/30 px-3 py-1.5 text-sm text-warn">Desactivar</button><button onClick={() => runBulk('setStockControl', true)} className="rounded-lg border border-hair px-3 py-1.5 text-sm">Control on</button><button onClick={() => runBulk('setStockControl', false)} className="rounded-lg border border-hair px-3 py-1.5 text-sm">Control off</button><button onClick={() => confirm('¿Eliminar los productos seleccionados?') && runBulk('delete')} className="rounded-lg border border-crit/30 px-3 py-1.5 text-sm text-crit">Eliminar</button></div>}
    {bulkMessage && <div className="rounded-lg border border-ok/30 bg-[var(--ok-soft)] px-4 py-3 text-sm text-ok">{bulkMessage}</div>}

    <div data-tour="productos-table"><div className="hidden overflow-x-auto rounded-xl border border-hair-soft bg-surface md:block"><table className="w-full text-sm"><thead className="bg-raised text-xs uppercase tracking-wide text-fg-faint"><tr><th className="p-3"><input type="checkbox" checked={products.length > 0 && products.every((product) => selected.has(product.id))} onChange={(event) => setSelected(event.target.checked ? new Set(products.map((product) => product.id)) : new Set())} /></th>{visibleColumns.map((column) => <th key={column.key} className="whitespace-nowrap p-3 text-left">{SORTABLE[column.key] ? <button type="button" onClick={() => changeSort(SORTABLE[column.key]!)} className="hover:text-fg">{column.label}{sort === SORTABLE[column.key] ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button> : column.label}</th>)}</tr></thead><tbody className="divide-y divide-hair-soft">{products.map((product) => <tr key={product.id} className="hover:bg-raised/70"><td className="p-3"><input type="checkbox" checked={selected.has(product.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(product.id); else next.delete(product.id); return next; })} /></td>{visibleColumns.map((column) => <td key={column.key} className={`whitespace-nowrap p-3 ${['cost', 'price', 'margin', 'stock', 'minStock'].includes(column.key) ? 'text-right font-mono tabular-nums' : ''}`}>{renderCell(product, column.key)}</td>)}</tr>)}{!loading && products.length === 0 && <tr><td colSpan={visibleColumns.length + 1} className="p-10 text-center text-fg-faint">No hay productos para estos filtros.</td></tr>}</tbody></table></div><div className="space-y-3 md:hidden">{products.map((product) => { const expiryDays = daysUntilExpiry(product.expiresAt); return <article key={product.id} className="rounded-xl border border-hair-soft bg-surface p-3"><div className="flex items-start gap-3"><input type="checkbox" checked={selected.has(product.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(product.id); else next.delete(product.id); return next; })} className="mt-3 shrink-0" />{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-hair-soft bg-white object-contain" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-hair-soft bg-raised2 text-sm font-semibold text-fg-muted">{product.name.trim().slice(0, 2).toUpperCase()}</span>}<div className="min-w-0 flex-1"><Link href={`/productos/${product.id}`} className="block truncate text-[14.5px] font-semibold leading-tight text-fg">{product.name}</Link><p className="mt-1 truncate font-mono text-[10.5px] text-fg-faint">{product.barcode || 'Sin código'}{product.unitsPerBoxNum != null && product.unitsPerBoxNum >= 2 ? ` · bulto ×${product.unitsPerBoxNum}` : ''}</p></div><div className="shrink-0 text-right"><p className="font-mono text-base font-bold tabular-nums text-brand">{formatMoneyArs(Number(product.price))}</p><p className="font-mono text-[10.5px] tabular-nums text-fg-faint">{product.cost == null ? 'sin costo' : `costo ${formatMoneyArs(Number(product.cost))}`}</p></div></div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hair-soft pt-3"><div><span className="block text-[10.5px] font-medium uppercase tracking-wide text-fg-faint">Stock</span><span className={`mt-1 inline-flex rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums ${product.stock <= product.minStock ? 'border-warn/30 bg-[var(--warn-soft)] text-warn' : 'border-hair bg-raised2 text-fg'}`}>{product.stock}</span></div><div><span className="block text-[10.5px] font-medium uppercase tracking-wide text-fg-faint">Categoría</span><span className="mt-1 block truncate text-sm text-fg-muted">{product.category?.name || '—'}</span></div><div><span className="block text-[10.5px] font-medium uppercase tracking-wide text-fg-faint">Origen</span>{product.sourceProvider ? <span className="mt-1 inline-flex rounded-md border border-hair bg-raised2 px-2 py-0.5 text-xs text-fg-muted">{product.sourceProvider}</span> : <span className="mt-1 block text-sm text-fg-faint">—</span>}</div><div><span className="block text-[10.5px] font-medium uppercase tracking-wide text-fg-faint">{product.incomplete ? 'Estado' : 'Vencimiento'}</span>{product.incomplete ? <span className="mt-1 inline-flex rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-0.5 text-xs text-warn">Incompleto</span> : <span className={`mt-1 block font-mono text-xs tabular-nums ${expiryDays != null && expiryDays <= 30 ? 'text-crit' : 'text-fg-muted'}`}>{product.expiresAt ? new Date(product.expiresAt).toLocaleDateString('es-AR') : '—'}</span>}</div></div><div className="mt-3 flex justify-end border-t border-hair-soft pt-3"><Link href={`/productos/${product.id}`} className="text-sm font-medium text-brand">Editar</Link></div></article>; })}{!loading && products.length === 0 && <p className="rounded-xl border border-hair-soft bg-surface p-6 text-center text-fg-faint">No hay productos para estos filtros.</p>}</div>{loading && <Loader />}</div>

    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted"><p><span className="font-mono tabular-nums text-fg">{total}</span> productos · Página <span className="font-mono">{page}</span> de <span className="font-mono">{totalPages || 1}</span></p><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-hair px-3 py-2 disabled:opacity-40">Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-hair px-3 py-2 disabled:opacity-40">Siguiente</button><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg">{[25, 50, 100, 200].map((size) => <option key={size} value={size}>{size} por página</option>)}</select></div></div>
    </>}

    {showDuplicates && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDuplicates(false); }}><div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-hair bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold text-fg">Duplicados por EAN</h2><button type="button" onClick={() => setShowDuplicates(false)} className="text-fg-muted">Cerrar</button></div>{duplicates.length === 0 ? <p className="text-fg-muted">No hay códigos duplicados activos.</p> : <div className="space-y-4">{duplicates.map((group) => <section key={group.barcode} className="rounded-xl border border-hair bg-raised p-4"><div className="mb-3 flex justify-between"><strong className="font-mono text-fg">EAN {group.barcode}</strong><span className="font-mono text-warn">{group.count}</span></div><div className="space-y-2">{group.products.map((product) => <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-hair-soft bg-surface p-3"><input type="radio" name={`keep-${group.barcode}`} checked={duplicateKeep[group.barcode] === product.id} onChange={() => setDuplicateKeep((current) => ({ ...current, [group.barcode]: product.id }))} /><span className="min-w-0 flex-1"><strong className="block text-fg">{product.name}</strong><span className="font-mono text-xs text-fg-faint">{product.sourceProvider || 'Sin origen'} · stock {product.stock} · {formatMoneyArs(Number(product.price))}</span></span></label>)}</div><button type="button" onClick={() => mergeDuplicate(group)} className="btn-brand mt-3 rounded-lg px-4 py-2">Conservar seleccionado y fusionar</button></section>)}</div>}</div></div>}
    {showHiddenCategories && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHiddenCategories(false); }}><div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-hair bg-surface p-5 shadow-xl"><div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-fg">Categorías ocultas</h2><p className="mt-1 text-sm text-fg-muted">No se mostrarán en el catálogo mientras el toggle esté activado.</p></div><button type="button" onClick={() => setShowHiddenCategories(false)} className="text-sm text-fg-muted hover:text-fg">Cerrar</button></div><div className="space-y-2">{facets.categories.length === 0 ? <p className="rounded-lg border border-hair-soft bg-raised p-4 text-sm text-fg-faint">No hay categorías disponibles.</p> : facets.categories.map((category) => <label key={category.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-hair-soft bg-raised px-3 py-2.5 hover:bg-raised2"><input type="checkbox" checked={hiddenCategoryIds.includes(category.id)} onChange={(event) => setHiddenCategoryIds((current) => event.target.checked ? [...new Set([...current, category.id])] : current.filter((id) => id !== category.id))} /><span className="min-w-0 flex-1 text-sm text-fg">{category.name}</span><span className="font-mono text-xs tabular-nums text-fg-faint">{category.count}</span></label>)}</div><div className="mt-5 flex items-center justify-between gap-3 border-t border-hair-soft pt-4"><button type="button" onClick={() => setHiddenCategoryIds([])} className="text-sm text-crit hover:underline">Limpiar selección</button><button type="button" disabled={savingHiddenCategories} onClick={() => void saveHiddenCategories()} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{savingHiddenCategories ? 'Guardando…' : 'Guardar'}</button></div></div></div>}
    {showIncomplete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowIncomplete(false); }}><div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-hair bg-surface p-5 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-fg">Completar productos</h2><p className="mt-1 text-sm text-fg-muted">Completá los datos básicos y activá el control de stock cuando corresponda.</p></div><button type="button" onClick={() => setShowIncomplete(false)} className="text-sm text-fg-muted hover:text-fg">Cerrar</button></div>{incompleteProducts.length === 0 ? <div className="rounded-xl border border-ok/30 bg-[var(--ok-soft)] p-8 text-center text-ok">No hay productos incompletos.</div> : <div className="space-y-3">{incompleteProducts.map((product) => { const draft = incompleteDrafts[product.id] ?? { categoryId: '', brand: '', cost: '', stockControl: false }; const updateDraft = (patch: Partial<IncompleteDraft>) => setIncompleteDrafts((current) => ({ ...current, [product.id]: { ...draft, ...patch } })); return <section key={product.id} className="rounded-xl border border-hair-soft bg-raised p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><strong className="text-fg">{product.name}</strong><p className="font-mono text-xs text-fg-faint">{product.barcode || 'Sin SKU'} · {formatMoneyArs(Number(product.price))}</p></div><span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 text-xs text-warn">Incompleto</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-fg-muted">Categoría<select value={draft.categoryId} onChange={(event) => updateDraft({ categoryId: event.target.value })} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-fg"><option value="">Sin categoría</option>{facets.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="text-xs text-fg-muted">Marca<input value={draft.brand} onChange={(event) => updateDraft({ brand: event.target.value })} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-fg" /></label><label className="text-xs text-fg-muted">Costo<input value={draft.cost} inputMode="decimal" onChange={(event) => updateDraft({ cost: event.target.value })} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 font-mono text-sm tabular-nums text-fg" /></label><label className="flex items-center gap-2 self-end rounded-lg border border-hair bg-surface px-3 py-2.5 text-sm text-fg-muted"><input type="checkbox" checked={draft.stockControl} onChange={(event) => updateDraft({ stockControl: event.target.checked })} />Control de stock</label></div><div className="mt-3 flex justify-end"><button type="button" disabled={savingIncompleteId === product.id} onClick={() => void saveIncompleteProduct(product)} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{savingIncompleteId === product.id ? 'Guardando…' : 'Guardar'}</button></div></section>; })}</div>}</div></div>}
  </Container>;
}
