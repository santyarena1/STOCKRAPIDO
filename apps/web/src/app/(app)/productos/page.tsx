'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type SetStateAction } from 'react';
import Link from 'next/link';
import { api, getApiBaseUrl } from '@/lib/api';
import { UnitPriceDisplay } from '@/components/UnitPriceDisplay';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { PublicCatalogPanel } from '@/components/productos/PublicCatalogPanel';
import { Loader } from '@/components/ui/Loader';
import { LabelPrintDialog, type LabelItem } from '@/components/LabelPrintDialog';
import { usePersistedState } from '@/lib/use-persisted-state';
import { autoAssignSerperPhotos, formatSerperAutoResult, type PhotoProduct } from '@/lib/serper-client';
import { ArrowDownAZ, ArrowUpAZ, ChevronDown, Grid2X2, ImageIcon, List, Printer, Search, SlidersHorizontal } from 'lucide-react';

type Product = {
  id: string; name: string; barcode?: string | null; price: string | number; cost?: string | number | null;
  stock: number; minStock: number; stockControl?: boolean; isActive?: boolean; brand?: string | null;
  categoryId?: string | null; category?: { id?: string; name: string } | null; expiresAt?: string | null;
  imageUrl?: string | null; unitsPerBox?: string | null; unitsPerBoxNum?: number | null;
  costBox?: number | null; priceBox?: number | null; weight?: string | null; format?: string | null;
  flavor?: string | null; presentation?: string | null; subcategory?: string | null; eanBox?: string | null;
  supplierSku?: string | null; supplierRef?: string | null; externalId?: string | null; iva?: string | number | null;
  sourceProvider?: string | null; sourceConnectionId?: string | null; updatedAt?: string;
  incomplete?: boolean; points?: number | null; silent?: boolean;
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
type Filters = { q: string; categoryId: string; brand: string; provider: string; type: string; status: 'active' | 'inactive' | 'all'; hasStock: boolean; stockControl: boolean; lowStock: boolean };
type SortKey = 'name' | 'price' | 'cost' | 'stock' | 'updatedAt' | 'brand' | 'category';
type ColumnKey = 'image' | 'name' | 'origin' | 'sku' | 'category' | 'brand' | 'type' | 'cost' | 'price' | 'margin' | 'stock' | 'minStock' | 'expiresAt' | 'stockControl' | 'actions';
type ColumnSetting = { key: ColumnKey; label: string; visible: boolean };
type SavedView = { id: string; name: string; filters: Filters; columns: ColumnSetting[]; mode: 'catalog' | 'stock'; sort: SortKey; dir: 'asc' | 'desc' };
type BulkAction = 'setPrice' | 'applyMarkup' | 'adjustPrice' | 'setCategory' | 'setBrand' | 'setIva' | 'setStock' | 'adjustStock' | 'setStockControl' | 'setActive' | 'setSilent' | 'stopSync' | 'delete';
type BulkDialog = { action: BulkAction; title: string; label: string; kind: 'number' | 'text' | 'category'; value: string };

const EMPTY_FILTERS: Filters = { q: '', categoryId: '', brand: '', provider: '', type: '', status: 'active', hasStock: false, stockControl: false, lowStock: false };
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

const COLUMNS_STORAGE_KEY = 'sr-prod-columns:v2';

/** Une lo guardado con el default (orden + visibles) sin perder columnas nuevas. */
function mergeColumns(stored: unknown): ColumnSetting[] {
  if (!Array.isArray(stored)) return DEFAULT_COLUMNS.map((column) => ({ ...column }));
  const defByKey = new Map(DEFAULT_COLUMNS.map((column) => [column.key, column]));
  const result: ColumnSetting[] = [];
  const seen = new Set<ColumnKey>();
  for (const raw of stored) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as { key?: unknown; visible?: unknown };
    if (typeof item.key !== 'string') continue;
    const def = defByKey.get(item.key as ColumnKey);
    if (!def || seen.has(def.key)) continue;
    result.push({
      key: def.key,
      label: def.label,
      visible: typeof item.visible === 'boolean' ? item.visible : def.visible,
    });
    seen.add(def.key);
  }
  for (const def of DEFAULT_COLUMNS) {
    if (!seen.has(def.key)) result.push({ ...def });
  }
  return result;
}
const STOCK_COLUMNS = new Set<ColumnKey>(['stock', 'minStock', 'expiresAt', 'stockControl']);
const SORTABLE: Partial<Record<ColumnKey, SortKey>> = { name: 'name', price: 'price', cost: 'cost', stock: 'stock', brand: 'brand', category: 'category' };
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'price', label: 'Precio' },
  { key: 'stock', label: 'Stock' },
  { key: 'brand', label: 'Marca' },
  { key: 'category', label: 'Categoría' },
  { key: 'cost', label: 'Costo' },
  { key: 'updatedAt', label: 'Actualizado' },
];
const FILTER_SELECT = 'mt-1.5 h-11 w-full rounded-xl border border-hair bg-raised px-3 text-sm text-fg';

function formatMoneyArs(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function alpha<T>(items: T[], name: (item: T) => string) {
  return [...items].sort((a, b) => name(a).localeCompare(name(b), 'es', { sensitivity: 'base' }));
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="min-w-[10rem] flex-1 text-xs font-medium text-fg-muted">
      {label}
      {children}
    </label>
  );
}

function toLabelItem(product: Product): LabelItem {
  return {
    id: product.id,
    name: product.name,
    barcode: product.barcode?.trim() || '',
    sku: product.supplierSku?.trim() || '',
    category: product.category?.name?.trim() || '',
    price: Number(product.price),
  };
}

function toPhotoProduct(product: Product): PhotoProduct {
  return { id: product.id, name: product.name, brand: product.brand, imageUrl: product.imageUrl };
}

function productHasPhoto(product: { imageUrl?: string | null }) {
  return Boolean(product.imageUrl?.trim());
}

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [facets, setFacets] = useState<Facets>({ providers: [], brands: [], categories: [], types: [] });
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [filters, setFilters] = usePersistedState<Filters>('sr-filters:productos:catalog', EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [sectionTab, setSectionTab] = useState<'inventory' | 'community'>('inventory');
  const [mode, setMode] = useState<'catalog' | 'stock'>('catalog');
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [columns, setColumns] = useState<ColumnSetting[]>(() => DEFAULT_COLUMNS.map((column) => ({ ...column })));
  const [columnsReady, setColumnsReady] = useState(false);
  const [columnsSavedFlash, setColumnsSavedFlash] = useState(false);
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
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkDialog, setBulkDialog] = useState<BulkDialog | null>(null);
  const [duplicates, setDuplicates] = useState<Array<{ barcode: string; count: number; products: Product[] }>>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateKeep, setDuplicateKeep] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; errors: Array<{ row: number; message: string }> } | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [labelItems, setLabelItems] = useState<LabelItem[] | null>(null);
  const [labelsBusy, setLabelsBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bulkMenuOpen) return;
    const closeOnOutside = (event: MouseEvent) => { if (!bulkMenuRef.current?.contains(event.target as Node)) setBulkMenuOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setBulkMenuOpen(false); };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [bulkMenuOpen]);

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('sr-prod-mode');
      if (savedMode === 'stock' || savedMode === 'catalog') setMode(savedMode);
      const savedView = localStorage.getItem('sr-prod-view');
      if (savedView === 'cards' || savedView === 'list') setView(savedView);
      const savedSort = localStorage.getItem('sr-prod-sort');
      if (savedSort && SORT_OPTIONS.some((option) => option.key === savedSort)) setSort(savedSort as SortKey);
      const savedDir = localStorage.getItem('sr-prod-dir');
      if (savedDir === 'asc' || savedDir === 'desc') setDir(savedDir);
      // v2 + fallback v1 (antes se podía pisar con el default al hidratar)
      const rawV2 = localStorage.getItem(COLUMNS_STORAGE_KEY);
      const rawV1 = localStorage.getItem('sr-prod-columns');
      const parsed = JSON.parse(rawV2 || rawV1 || 'null');
      setColumns(mergeColumns(parsed));
      const savedViews = JSON.parse(localStorage.getItem('sr-prod-views') || '[]');
      if (Array.isArray(savedViews)) setViews(savedViews);
      setHideCategories(localStorage.getItem('sr-prod-hide-cats-on') !== 'false');
      const savedHiddenCategories = JSON.parse(localStorage.getItem('sr-prod-hidden-cats') || '[]');
      if (Array.isArray(savedHiddenCategories)) setHiddenCategoryIds(savedHiddenCategories.filter((id): id is string => typeof id === 'string'));
    } catch {
      setColumns(DEFAULT_COLUMNS.map((column) => ({ ...column })));
    }
    setColumnsReady(true);
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-mode', mode); }, [hydrated, mode]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-view', view); }, [hydrated, view]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-sort', sort); }, [hydrated, sort]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-dir', dir); }, [hydrated, dir]);
  useEffect(() => {
    // No guardar hasta haber leído lo anterior (evita pisar con el default al montar).
    if (!hydrated || !columnsReady) return;
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
      localStorage.setItem('sr-prod-columns', JSON.stringify(columns)); // compat
    } catch {
      // ignore
    }
  }, [hydrated, columnsReady, columns]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-views', JSON.stringify(views)); }, [hydrated, views]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-hide-cats-on', String(hideCategories)); }, [hydrated, hideCategories]);
  useEffect(() => { if (hydrated) localStorage.setItem('sr-prod-hidden-cats', JSON.stringify(hiddenCategoryIds)); }, [hydrated, hiddenCategoryIds]);
  useEffect(() => { if (hydrated && searchInput !== filters.q) setSearchInput(filters.q); }, [hydrated, filters.q]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((current) => ({ ...current, q: searchInput.trim() })), 300); return () => window.clearTimeout(timer); }, [searchInput]);

  const updateColumns = (updater: SetStateAction<ColumnSetting[]>) => {
    setColumns(updater);
    setColumnsSavedFlash(true);
  };

  useEffect(() => {
    if (!columnsSavedFlash) return;
    const timer = window.setTimeout(() => setColumnsSavedFlash(false), 1600);
    return () => window.clearTimeout(timer);
  }, [columnsSavedFlash]);
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
          lowStock: filters.lowStock ? 'true' : undefined,
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
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setSearchInput(''); };
  const categories = alpha(facets.categories, (item) => item.name);
  const providers = alpha(facets.providers, (item) => item.label);
  const brands = alpha(facets.brands, (item) => item.value);
  const types = alpha(facets.types, (item) => item.value);
  const selectedCategory = categories.find((item) => item.id === filters.categoryId);
  const selectedProvider = providers.find((item) => item.value === filters.provider);
  const hasActiveFilters = Boolean(
    filters.q || filters.categoryId || filters.brand || filters.provider || filters.type
    || filters.hasStock || filters.stockControl || filters.lowStock || filters.status !== 'active',
  );
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
  const moveColumn = (index: number, direction: -1 | 1) =>
    updateColumns((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const saveView = () => {
    const name = prompt('Nombre de la vista:')?.trim(); if (!name) return;
    setViews((current) => [...current, { id: `${Date.now()}`, name, filters, columns, mode, sort, dir }]);
  };
  const applyView = (id: string) => {
    const view = views.find((item) => item.id === id);
    if (!view) return;
    setFilters({ ...EMPTY_FILTERS, ...view.filters });
    setSearchInput(view.filters.q);
    updateColumns(mergeColumns(view.columns));
    setMode(view.mode);
    setSort(view.sort);
    setDir(view.dir);
  };

  const runBulk = async (action: BulkAction, value?: unknown) => {
    if (selected.size === 0) return;
    try {
      const result = await api<{ updated: number; skipped: { id: string; reason: string }[] }>('/products/bulk', { method: 'POST', body: JSON.stringify({ ids: [...selected], action, value }) });
      setBulkMessage(`${result.updated} actualizados${result.skipped.length ? ` · ${result.skipped.length} omitidos: ${result.skipped.slice(0, 3).map((item) => item.reason).join('; ')}` : ''}`);
      setSelected(new Set()); setBulkMenuOpen(false); setBulkDialog(null); await fetchProducts();
    } catch (error) { alert(error instanceof Error ? error.message : 'Error en acción masiva'); }
  };
  const openBulkDialog = (dialog: Omit<BulkDialog, 'value'>) => { setBulkMenuOpen(false); setBulkDialog({ ...dialog, value: '' }); };
  const submitBulkDialog = () => {
    if (!bulkDialog) return;
    const value = bulkDialog.kind === 'number' ? Number(bulkDialog.value.replace(',', '.')) : bulkDialog.value.trim();
    if (bulkDialog.kind === 'number' && !Number.isFinite(value)) return alert('Ingresá un número válido.');
    if ((bulkDialog.kind === 'text' || bulkDialog.kind === 'category') && !value) return alert('Completá el valor.');
    void runBulk(bulkDialog.action, value);
  };
  const catalogParams = () => ({
    q: filters.q || undefined, categoryId: filters.categoryId || undefined, brand: filters.brand || undefined,
    provider: filters.provider || undefined, type: filters.type || undefined, status: filters.status,
    excludeCategoryIds: hideCategories && hiddenCategoryIds.length ? hiddenCategoryIds.join(',') : undefined,
    hasStock: filters.hasStock ? 'true' : undefined, stockControl: filters.stockControl ? 'true' : undefined,
    lowStock: filters.lowStock ? 'true' : undefined,
    sort, dir,
  });

  const labelsFromLoaded = (ids: string[]) => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return ids.map((id) => byId.get(id)).filter((product): product is Product => Boolean(product)).map(toLabelItem);
  };

  const openLabels = async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) {
      alert('No hay productos para imprimir.');
      return;
    }
    setLabelsBusy(true);
    try {
      let items: LabelItem[] = [];
      try {
        items = await api<LabelItem[]>('/products/labels', { method: 'POST', body: JSON.stringify({ ids: unique }) });
        const missing = items.filter((item) => item.id && !item.barcode).map((item) => item.id!);
        if (missing.length) {
          const ok = confirm(`${missing.length} producto(s) no tienen código. ¿Generamos un código interno ahora y después imprimimos?`);
          if (ok) {
            await api('/products/assign-barcodes', { method: 'POST', body: JSON.stringify({ ids: missing }) });
            items = await api<LabelItem[]>('/products/labels', { method: 'POST', body: JSON.stringify({ ids: unique }) });
            await fetchProducts();
          }
        }
      } catch {
        items = labelsFromLoaded(unique);
      }
      if (!items.length) {
        alert('No hay productos para imprimir.');
        return;
      }
      setLabelItems(items);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudieron armar las etiquetas');
    } finally {
      setLabelsBusy(false);
    }
  };

  const selectAllMatching = async () => {
    setLabelsBusy(true);
    try {
      const result = await api<{ ids: string[]; total: number }>('/products/catalog-ids', { params: catalogParams() });
      setSelected(new Set(result.ids));
      setBulkMessage(`${result.total} productos de esta búsqueda seleccionados.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo seleccionar el catálogo');
    } finally {
      setLabelsBusy(false);
    }
  };

  const printFiltered = async () => {
    if (selected.size > 0) {
      await openLabels([...selected]);
      return;
    }
    if (!products.length) {
      alert('No hay productos en esta búsqueda para imprimir.');
      return;
    }
    const count = total || products.length;
    if (count > 40 && !confirm(`Vas a imprimir ${count} etiquetas (todo el filtro). ¿Seguimos?`)) return;
    setLabelsBusy(true);
    try {
      try {
        const result = await api<{ ids: string[]; total: number }>('/products/catalog-ids', { params: catalogParams() });
        if (result.ids.length) {
          await openLabels(result.ids);
          return;
        }
      } catch {
        // Si la API todavía no tiene el endpoint, imprimimos lo que ya se ve en pantalla.
      }
      await openLabels(products.map((product) => product.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudieron armar las etiquetas');
    } finally {
      setLabelsBusy(false);
    }
  };

  const loadPhotoProducts = async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    const byId = new Map(products.map((product) => [product.id, toPhotoProduct(product)]));
    const unknown = unique.filter((id) => !byId.has(id));
    if (unknown.length) {
      const need = new Set(unknown);
      try {
        let pageNum = 1;
        let pages = 1;
        do {
          const result = await api<{ items: Product[]; totalPages: number }>('/products/catalog', {
            params: { ...catalogParams(), page: String(pageNum), pageSize: '200' },
          });
          pages = result.totalPages || 1;
          for (const item of result.items) {
            if (need.has(item.id)) {
              byId.set(item.id, toPhotoProduct(item));
              need.delete(item.id);
            }
          }
          pageNum += 1;
        } while (need.size && pageNum <= pages);
      } catch {
        // Usamos los que ya están cargados en pantalla.
      }
    }
    return unique.map((id) => byId.get(id)).filter((item): item is PhotoProduct => Boolean(item));
  };

  const applyFirstPhotos = async () => {
    if (photoBusy) return;
    const fromSelection = selected.size > 0;
    const candidates = fromSelection ? await loadPhotoProducts([...selected]) : products.map(toPhotoProduct);
    if (!candidates.length) {
      alert('No hay productos para buscar fotos.');
      return;
    }
    const missing = candidates.filter((item) => !productHasPhoto(item));
    const already = candidates.length - missing.length;
    if (!missing.length) {
      alert('Todos ya tienen imagen. No hay nada que buscar.');
      return;
    }
    const scope = fromSelection ? 'seleccionados' : 'de esta página';
    if (!confirm(`${missing.length} producto${missing.length === 1 ? '' : 's'} ${scope} sin imagen.${already ? ` Los ${already} que ya tienen foto se saltean.` : ''} ¿Buscamos la primera foto de Serper?`)) {
      return;
    }
    setPhotoBusy(true);
    setPhotoProgress('Buscando fotos…');
    setBulkMessage(null);
    try {
      const result = await autoAssignSerperPhotos(candidates, true, (done, total, name) => {
        setPhotoProgress(`Foto ${done}/${total}: ${name}`);
      });
      setBulkMessage(formatSerperAutoResult(result));
      setPhotoProgress(null);
      await fetchProducts();
    } catch (error) {
      setPhotoProgress(null);
      alert(error instanceof Error ? error.message : 'Error al buscar imágenes');
    } finally {
      setPhotoBusy(false);
    }
  };

  const exportSelected = async () => {
    if (!selected.size) return;
    setBulkMenuOpen(false);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${getApiBaseUrl()}/products/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error((error as { message?: string }).message || 'No se pudo exportar.'); }
      const blob = await response.blob();
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'productos-seleccionados.csv'; document.body.appendChild(link); link.click();
      setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 500);
    } catch (error) { alert(error instanceof Error ? error.message : 'No se pudo exportar.'); }
  };

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
    if (key === 'name') return <div><div className="flex items-center gap-2"><Link href={`/productos/${product.id}`} className="font-semibold text-fg hover:text-brand hover:underline">{product.name}</Link>{product.incomplete && <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warn">Incompleto</span>}{product.silent && <span title="Producto silencioso: en el ticket sale con el texto configurado" className="rounded-md border border-[color:var(--brand-accent)] bg-brand-highlight px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">PS</span>}</div><span className="block font-mono text-xs tabular-nums text-fg-faint">{[product.barcode, product.unitsPerBox ? `x${product.unitsPerBox}` : null].filter(Boolean).join(' · ')}</span></div>;
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
    return <div className="flex items-center gap-3"><button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setQuickViewProduct(product); }} className="text-fg-muted hover:text-fg">👁️ Vista rápida</button><button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void openLabels([product.id]); }} className="text-fg-muted hover:text-fg">Etiqueta</button><Link href={`/productos/${product.id}`} className="text-brand hover:underline">Editar</Link></div>;
  };

  const toolBtn = 'rounded-lg border border-hair bg-raised px-3 py-2 text-sm font-medium text-fg hover:bg-raised2 disabled:opacity-50';

  return <Container className="space-y-6">
    <PageHeader
      title="Productos"
      subtitle={sectionTab === 'community' ? 'Importá fichas sin precio del catálogo comunitario.' : view === 'cards' ? 'Tocá un producto para editarlo' : 'Gestioná catálogo, precios, costos y niveles de stock.'}
      actions={
        sectionTab === 'inventory' ? (
        <>
          <button type="button" disabled={incompleteProducts.length === 0} onClick={() => { setShowIncomplete(true); void loadIncompleteProducts(); }} className="rounded-lg border border-warn/30 bg-[var(--warn-soft)] px-3 py-2 text-sm font-medium text-warn hover:bg-raised2 disabled:cursor-not-allowed disabled:opacity-50">Completar <span className="font-mono tabular-nums">({incompleteProducts.length})</span></button>
          <Link href="/productos/nuevo" data-tour="productos-nuevo" className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold">Nuevo producto</Link>
        </>
        ) : null
      }
    />
    <div className="inline-flex rounded-lg border border-hair overflow-hidden">
      <button type="button" onClick={() => setSectionTab('inventory')} className={`px-4 py-2 text-sm font-semibold ${sectionTab === 'inventory' ? 'bg-brand-highlight text-brand' : 'bg-raised text-fg-muted'}`}>Mi inventario</button>
      <button type="button" onClick={() => setSectionTab('community')} className={`px-4 py-2 text-sm font-semibold ${sectionTab === 'community' ? 'bg-brand-highlight text-brand' : 'bg-raised text-fg-muted'}`}>Catálogo público</button>
    </div>
    {sectionTab === 'community' ? (
      <PublicCatalogPanel />
    ) : (
    <>
    <div className="flex flex-wrap items-center gap-2">
      {view === 'list' && <>
        <a href="#" role="button" onClick={(event) => handleExportStock(event)} className={`${toolBtn} inline-block cursor-pointer select-none no-underline`} style={{ pointerEvents: exporting ? 'none' : undefined, opacity: exporting ? 0.6 : 1 }}>{exporting ? 'Exportando…' : 'Exportar stock'}</a>
        <button type="button" onClick={handleExportTxt} className={toolBtn}>Exportar CSV</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className={toolBtn}>{importing ? 'Importando…' : 'Importar stock'}</button>
      </>}
      <button type="button" disabled={labelsBusy} onClick={() => void printFiltered()} className={`inline-flex items-center gap-1.5 ${toolBtn}`}>{labelsBusy ? 'Armando etiquetas…' : selected.size > 0 ? `Imprimir etiquetas (${selected.size})` : 'Imprimir etiquetas'}</button>
      <button type="button" disabled={photoBusy} onClick={() => void applyFirstPhotos()} className={`inline-flex items-center gap-1.5 ${toolBtn}`}>
        <ImageIcon className="h-4 w-4" />
        {photoBusy ? 'Buscando…' : selected.size > 0 ? `Primera foto (${selected.size})` : 'Primera foto'}
      </button>
      <Link href="/productos/imagenes" className={toolBtn}>Imágenes</Link>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportStock} />
    </div>
    {exportMsg && <p className="text-sm text-warn">{exportMsg}</p>}
    {importResult && <div className="rounded-lg border border-hair bg-raised p-3 text-sm text-fg">Importación: <strong className="font-mono">{importResult.updated}</strong> producto(s) actualizado(s). {importResult.errors.length > 0 && <span className="text-warn">Errores en {importResult.errors.length} fila(s): {importResult.errors.slice(0, 5).map((error) => `Fila ${error.row}: ${error.message}`).join('; ')}</span>}</div>}
    {photoProgress && <p className="text-sm text-fg-muted">{photoProgress}</p>}
    {bulkMessage && <div className="rounded-lg border border-ok/30 bg-[var(--ok-soft)] px-4 py-3 text-sm text-ok">{bulkMessage}</div>}

    <section data-tour="productos-filters" className="space-y-3 rounded-xl border border-hair-soft bg-surface p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por nombre, código, marca o SKU…"
            className="h-11 w-full rounded-xl border border-hair bg-raised pl-10 pr-4 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-[color:var(--brand-accent)]"
          />
        </div>
        <div className="inline-flex self-start rounded-xl border border-hair bg-raised p-1 lg:self-auto" aria-label="Vista de productos">
          <button type="button" onClick={() => setView('cards')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === 'cards' ? 'bg-raised2 font-semibold text-fg' : 'text-fg-muted hover:bg-surface'}`}><Grid2X2 className="h-4 w-4" />Tarjetas</button>
          <button type="button" onClick={() => setView('list')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === 'list' ? 'bg-raised2 font-semibold text-fg' : 'text-fg-muted hover:bg-surface'}`}><List className="h-4 w-4" />Lista</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FilterField label="Categoría">
            <select value={filters.categoryId} onChange={(event) => changeFilter('categoryId', event.target.value)} className={FILTER_SELECT}>
              <option value="">Todas ({total})</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.count})</option>)}
            </select>
          </FilterField>
          <FilterField label="Proveedor">
            <select value={filters.provider} onChange={(event) => changeFilter('provider', event.target.value)} className={FILTER_SELECT}>
              <option value="">Todos</option>
              {providers.map((item) => <option key={item.value} value={item.value}>{item.label} ({item.count})</option>)}
            </select>
          </FilterField>
          <FilterField label="Marca">
            <select value={filters.brand} onChange={(event) => changeFilter('brand', event.target.value)} className={FILTER_SELECT}>
              <option value="">Todas</option>
              {brands.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}
            </select>
          </FilterField>
          <div className="min-w-[10rem] flex-1">
            <p className="text-xs font-medium text-fg-muted">Ordenar</p>
            <div className="mt-1.5 flex gap-2">
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className={`${FILTER_SELECT} mt-0`}>
                {SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setDir((current) => current === 'asc' ? 'desc' : 'asc')}
                title={dir === 'asc' ? 'Ascendente' : 'Descendente'}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hair bg-raised text-fg-muted hover:bg-raised2 hover:text-fg"
              >
                {dir === 'asc' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => changeFilter('lowStock', !filters.lowStock)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filters.lowStock ? 'border-warn bg-[var(--warn-soft)] text-warn' : 'border-hair bg-raised text-fg-muted hover:bg-raised2'}`}
          >
            Stock bajo {stockSummary ? <span className="font-mono tabular-nums">({stockSummary.lowStockCount})</span> : null}
          </button>
          <button
            type="button"
            onClick={() => changeFilter('hasStock', !filters.hasStock)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filters.hasStock ? 'border-[color:var(--brand-accent)] bg-brand-highlight-soft text-brand' : 'border-hair bg-raised text-fg-muted hover:bg-raised2'}`}
          >
            Con stock
          </button>
          <button
            type="button"
            onClick={() => setShowMoreFilters((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-raised px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-raised2"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {showMoreFilters ? 'Menos filtros' : 'Más filtros'}
          </button>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="text-sm font-medium text-brand hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>

        {showMoreFilters && (
          <div className="grid gap-3 border-t border-hair-soft pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterField label="Tipo">
              <select value={filters.type} onChange={(event) => changeFilter('type', event.target.value)} className={FILTER_SELECT}>
                <option value="">Todos</option>
                {types.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}
              </select>
            </FilterField>
            <FilterField label="Estado">
              <select value={filters.status} onChange={(event) => changeFilter('status', event.target.value as Filters['status'])} className={FILTER_SELECT}>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
                <option value="all">Todos</option>
              </select>
            </FilterField>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={filters.stockControl} onChange={(event) => changeFilter('stockControl', event.target.checked)} />Control de stock</label>
              <label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={showBulkInternal} onChange={(event) => setShowBulkInternal(event.target.checked)} />Ver bulto interno</label>
              <label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={hideCategories} onChange={(event) => setHideCategories(event.target.checked)} />Ocultar categorías</label>
              <span className="rounded-md border border-hair bg-raised2 px-2 py-1 font-mono text-xs tabular-nums text-fg-faint">{hiddenCategoryIds.length} ocultas</span>
              <button type="button" onClick={() => setShowHiddenCategories(true)} className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted hover:bg-raised">Elegir ocultas</button>
            </div>
          </div>
        )}

        {(filters.categoryId || filters.provider || filters.brand || filters.type || filters.lowStock) && (
          <div className="flex flex-wrap gap-2 border-t border-hair-soft pt-3">
            {selectedCategory && <button type="button" onClick={() => changeFilter('categoryId', '')} className="rounded-full border border-hair bg-raised px-3 py-1 text-xs text-fg-muted hover:text-fg">Categoría: {selectedCategory.name} ×</button>}
            {selectedProvider && <button type="button" onClick={() => changeFilter('provider', '')} className="rounded-full border border-hair bg-raised px-3 py-1 text-xs text-fg-muted hover:text-fg">Proveedor: {selectedProvider.label} ×</button>}
            {filters.brand && <button type="button" onClick={() => changeFilter('brand', '')} className="rounded-full border border-hair bg-raised px-3 py-1 text-xs text-fg-muted hover:text-fg">Marca: {filters.brand} ×</button>}
            {filters.type && <button type="button" onClick={() => changeFilter('type', '')} className="rounded-full border border-hair bg-raised px-3 py-1 text-xs text-fg-muted hover:text-fg">Tipo: {filters.type} ×</button>}
            {filters.lowStock && <button type="button" onClick={() => changeFilter('lowStock', false)} className="rounded-full border border-warn/40 bg-[var(--warn-soft)] px-3 py-1 text-xs text-warn">Stock bajo ×</button>}
          </div>
        )}
    </section>

    {view === 'cards' ? <>

      <div data-tour="productos-table">
        {loading ? <Loader /> : products.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">{products.map((product) => { const expiryDays = daysUntilExpiry(product.expiresAt); const lowStock = product.stock <= product.minStock; return <Link key={product.id} href={`/productos/${product.id}`} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-hair-soft bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[color:var(--brand-accent)] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]">
          <div className="relative aspect-square overflow-hidden bg-raised p-5">
            <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">{lowStock && <span className="rounded-md border border-warn/40 bg-[var(--warn-soft)] px-2 py-1 text-xs font-semibold text-warn backdrop-blur">Stock bajo</span>}{expiryDays != null && expiryDays <= 30 && <span className="rounded-md border border-crit/40 bg-[var(--crit-soft)] px-2 py-1 text-xs font-semibold text-crit backdrop-blur">Vence pronto</span>}{product.incomplete && <span className="rounded-md border border-warn/40 bg-[var(--warn-soft)] px-2 py-1 text-xs font-semibold text-warn backdrop-blur">Incompleto</span>}{product.silent && <span title="Producto silencioso" className="rounded-md border border-[color:var(--brand-accent)]/50 bg-brand-highlight px-2 py-1 text-xs font-bold uppercase text-brand backdrop-blur">PS</span>}</div>
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.03]" /> : <div className="flex h-full w-full items-center justify-center rounded-xl border border-hair-soft bg-surface text-5xl font-bold text-fg-faint">{product.name.trim().slice(0, 2).toUpperCase()}</div>}
          </div>
          <div className="flex flex-1 flex-col p-4">
            <h2 className="min-h-12 overflow-hidden text-base font-semibold leading-6 text-fg [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{product.name}</h2>
            <p className="mt-1 truncate text-sm text-fg-faint">{product.category?.name || 'Sin categoría'} · {product.brand || 'Sin marca'}</p>
            {product.points != null && <span className="mt-2 self-start rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 font-mono text-xs text-warn">★ {product.points} pts</span>}
            <div className="mt-4 flex items-end justify-between gap-3 border-t border-hair-soft pt-4"><span className="font-mono text-2xl font-bold tabular-nums text-brand">{formatMoneyArs(Number(product.price))}</span><span className="flex items-center gap-2 text-sm text-fg-muted"><span className={`h-2.5 w-2.5 rounded-full ${lowStock ? 'bg-warn' : 'bg-ok'}`} /><span className="font-mono tabular-nums">{product.stock}</span></span></div>
            <span className="mt-4 block w-full rounded-xl border border-hair bg-raised px-4 py-2.5 text-center text-sm font-semibold text-fg-muted transition-colors group-hover:border-[color:var(--brand-accent)] group-hover:bg-brand-highlight-soft group-hover:text-brand">Editar</span>
            <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void openLabels([product.id]); }} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-hair bg-surface px-4 py-2.5 text-sm font-semibold text-fg-muted hover:bg-raised">
              <Printer className="h-4 w-4" />Imprimir etiqueta
            </button>
          </div>
        </Link>; })}</div> : <div className="rounded-2xl border border-hair-soft bg-surface p-10 text-center"><p className="text-lg font-medium text-fg">No encontramos productos</p><p className="mt-1 text-sm text-fg-muted">Probá con otra búsqueda o cambiá los filtros.</p></div>}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-hair-soft bg-surface p-4 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between"><p><span className="font-mono tabular-nums text-fg">{total}</span> productos · Página <span className="font-mono">{page}</span> de <span className="font-mono">{totalPages || 1}</span></p><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="min-h-11 flex-1 rounded-xl border border-hair px-5 py-2 font-medium disabled:opacity-40 sm:flex-none">Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="min-h-11 flex-1 rounded-xl border border-hair px-5 py-2 font-medium disabled:opacity-40 sm:flex-none">Siguiente</button><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded-xl border border-hair bg-raised px-3 py-2 text-fg">{[25, 50, 100, 200].map((size) => <option key={size} value={size}>{size} por página</option>)}</select></div></div>
    </> : <>
    <section className="space-y-3 rounded-xl border border-hair-soft bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2"><div className="inline-flex rounded-lg border border-hair bg-raised p-1"><button type="button" onClick={() => setMode('catalog')} className={`rounded-md px-3 py-1.5 text-sm ${mode === 'catalog' ? 'bg-raised2 text-fg' : 'text-fg-faint'}`}>Catálogo</button><button type="button" onClick={() => setMode('stock')} className={`rounded-md px-3 py-1.5 text-sm ${mode === 'stock' ? 'bg-raised2 text-fg' : 'text-fg-faint'}`}>Stock</button></div>
        <select defaultValue="" onChange={(event) => { applyView(event.target.value); event.target.value = ''; }} className="rounded-lg border border-hair bg-raised px-3 py-2 text-sm text-fg"><option value="">Mis vistas</option>{views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select><button type="button" onClick={saveView} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised">Guardar vista</button>{views.length > 0 && <button type="button" onClick={() => { const id = prompt(`ID de vista a borrar:\n${views.map((view) => `${view.id}: ${view.name}`).join('\n')}`); if (id) setViews((current) => current.filter((view) => view.id !== id)); }} className="rounded-lg border border-hair px-3 py-2 text-sm text-crit">Borrar vista</button>}
        <button type="button" onClick={() => setShowColumns((current) => !current)} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised">Columnas</button><button type="button" onClick={openDuplicates} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised">Duplicados (EAN)</button><button type="button" disabled={labelsBusy} onClick={() => void selectAllMatching()} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised disabled:opacity-50">Seleccionar todos los de esta búsqueda</button>
      </div>
      {showColumns && (
        <div className="space-y-2 rounded-lg border border-hair bg-raised p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-fg-muted">Elegí qué columnas ver y el orden. Se guardan solas en este navegador.</p>
            {columnsSavedFlash ? <p className="text-xs font-semibold text-ok">Columnas guardadas</p> : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((column, index) => (
              <div key={column.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={(event) =>
                    updateColumns((current) =>
                      current.map((item) => (item.key === column.key ? { ...item, visible: event.target.checked } : item)),
                    )
                  }
                />
                <span className="min-w-0 flex-1 text-sm text-fg-muted">{column.label}</span>
                <button type="button" onClick={() => moveColumn(index, -1)} className="text-fg-faint">↑</button>
                <button type="button" onClick={() => moveColumn(index, 1)} className="text-fg-faint">↓</button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => updateColumns(DEFAULT_COLUMNS.map((column) => ({ ...column })))}
            className="text-xs text-fg-faint hover:text-fg"
          >
            Restablecer columnas por defecto
          </button>
        </div>
      )}
    </section>

    {selected.size > 0 && <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--brand-accent)] bg-surface p-3 shadow-lg"><div className="flex items-center gap-3"><strong className="font-mono text-brand">{selected.size} seleccionados</strong><button type="button" onClick={() => setSelected(new Set())} className="text-sm text-fg-muted hover:text-fg">Limpiar</button><button type="button" disabled={labelsBusy} onClick={() => void selectAllMatching()} className="text-sm text-fg-muted hover:text-fg disabled:opacity-50">Seleccionar todos los de esta búsqueda</button><button type="button" disabled={photoBusy} onClick={() => void applyFirstPhotos()} className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted hover:text-fg disabled:opacity-50">{photoBusy ? (photoProgress || 'Buscando…') : 'Primera foto'}</button><button type="button" disabled={labelsBusy} onClick={() => void openLabels([...selected])} className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted hover:text-fg disabled:opacity-50">Imprimir etiquetas</button></div><div ref={bulkMenuRef} className="relative"><button type="button" onClick={() => setBulkMenuOpen((current) => !current)} aria-expanded={bulkMenuOpen} className="btn-brand flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold">Acciones rápidas <ChevronDown className={`h-4 w-4 transition-transform ${bulkMenuOpen ? 'rotate-180' : ''}`} /></button>{bulkMenuOpen && <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-hair bg-surface p-2 shadow-2xl"><p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Estado</p><button type="button" onClick={() => void runBulk('setActive', true)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Habilitar</button><button type="button" onClick={() => void runBulk('setActive', false)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Deshabilitar</button><button type="button" onClick={() => void runBulk('setSilent', true)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Marcar como silencioso</button><button type="button" onClick={() => void runBulk('setSilent', false)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Quitar silencioso</button><div className="my-1 border-t border-hair-soft" /><p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Catálogo</p><button type="button" onClick={() => openBulkDialog({ action: 'setCategory', title: 'Cambiar categoría', label: 'Nueva categoría', kind: 'category' })} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Cambiar categoría</button><button type="button" onClick={() => openBulkDialog({ action: 'setBrand', title: 'Cambiar marca', label: 'Nueva marca', kind: 'text' })} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Cambiar marca</button><button type="button" onClick={() => openBulkDialog({ action: 'setIva', title: 'Cambiar IVA', label: 'IVA (%)', kind: 'number' })} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Cambiar IVA</button><button type="button" onClick={() => void exportSelected()} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Exportar seleccionados</button><button type="button" disabled={labelsBusy} onClick={() => { setBulkMenuOpen(false); void openLabels([...selected]); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised disabled:opacity-50">Imprimir etiquetas</button><div className="my-1 border-t border-hair-soft" /><p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Precio</p><button type="button" onClick={() => openBulkDialog({ action: 'applyMarkup', title: 'Aplicar rentabilidad', label: 'Rentabilidad / markup (%)', kind: 'number' })} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Aplicar rentabilidad %</button><button type="button" onClick={() => openBulkDialog({ action: 'adjustPrice', title: 'Ajustar precio', label: 'Porcentaje (usá negativo para bajar)', kind: 'number' })} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Ajustar precio ±%</button><div className="my-1 border-t border-hair-soft" /><p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Inventario</p><button type="button" onClick={() => openBulkDialog({ action: 'setStock', title: 'Fijar stock', label: 'Cantidad final', kind: 'number' })} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Fijar stock</button><button type="button" onClick={() => openBulkDialog({ action: 'adjustStock', title: 'Ajustar stock', label: 'Cantidad a sumar o restar', kind: 'number' })} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Ajustar stock ±</button><div className="my-1 border-t border-hair-soft" /><p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">Admin</p><button type="button" onClick={() => confirm('¿Dejar de sincronizar los productos seleccionados?') && void runBulk('stopSync')} className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-raised">Dejar de sincronizar</button><button type="button" onClick={() => confirm('¿Eliminar definitivamente los productos seleccionados?') && void runBulk('delete')} className="w-full rounded-lg px-3 py-2 text-left text-sm text-crit hover:bg-[var(--crit-soft)]">Eliminar</button></div>}</div></div>}

    <div data-tour="productos-table"><div className="hidden overflow-x-auto rounded-xl border border-hair-soft bg-surface md:block"><table className="w-full text-sm"><thead className="bg-raised text-xs uppercase tracking-wide text-fg-faint"><tr><th className="p-3"><input type="checkbox" checked={products.length > 0 && products.every((product) => selected.has(product.id))} onChange={(event) => setSelected(event.target.checked ? new Set(products.map((product) => product.id)) : new Set())} /></th>{visibleColumns.map((column) => <th key={column.key} className="whitespace-nowrap p-3 text-left">{SORTABLE[column.key] ? <button type="button" onClick={() => changeSort(SORTABLE[column.key]!)} className="hover:text-fg">{column.label}{sort === SORTABLE[column.key] ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button> : column.label}</th>)}</tr></thead><tbody className="divide-y divide-hair-soft">{products.map((product) => <tr key={product.id} className="hover:bg-raised/70"><td className="p-3"><input type="checkbox" checked={selected.has(product.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(product.id); else next.delete(product.id); return next; })} /></td>{visibleColumns.map((column) => <td key={column.key} className={`whitespace-nowrap p-3 ${['cost', 'price', 'margin', 'stock', 'minStock'].includes(column.key) ? 'text-right font-mono tabular-nums' : ''}`}>{renderCell(product, column.key)}</td>)}</tr>)}{!loading && products.length === 0 && <tr><td colSpan={visibleColumns.length + 1} className="p-10 text-center text-fg-faint">No hay productos para estos filtros.</td></tr>}</tbody></table></div><div className="space-y-3 md:hidden">{products.map((product) => { const expiryDays = daysUntilExpiry(product.expiresAt); return <article key={product.id} className="rounded-xl border border-hair-soft bg-surface p-3"><div className="flex items-start gap-3"><input type="checkbox" checked={selected.has(product.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(product.id); else next.delete(product.id); return next; })} className="mt-3 shrink-0" />{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-hair-soft bg-white object-contain" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-hair-soft bg-raised2 text-sm font-semibold text-fg-muted">{product.name.trim().slice(0, 2).toUpperCase()}</span>}<div className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><Link href={`/productos/${product.id}`} className="truncate text-[14.5px] font-semibold leading-tight text-fg">{product.name}</Link>{product.silent && <span title="Producto silencioso" className="shrink-0 rounded border border-[color:var(--brand-accent)] bg-brand-highlight px-1 text-[9px] font-bold uppercase leading-4 text-brand">PS</span>}</span><p className="mt-1 truncate font-mono text-[10.5px] text-fg-faint">{product.barcode || 'Sin código'}{product.unitsPerBoxNum != null && product.unitsPerBoxNum >= 2 ? ` · bulto ×${product.unitsPerBoxNum}` : ''}</p></div><div className="shrink-0 text-right"><p className="font-mono text-base font-bold tabular-nums text-brand">{formatMoneyArs(Number(product.price))}</p><p className="font-mono text-[10.5px] tabular-nums text-fg-faint">{product.cost == null ? 'sin costo' : `costo ${formatMoneyArs(Number(product.cost))}`}</p></div></div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hair-soft pt-3"><div><span className="block text-[10.5px] font-medium uppercase tracking-wide text-fg-faint">Stock</span><span className={`mt-1 inline-flex rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums ${product.stock <= product.minStock ? 'border-warn/30 bg-[var(--warn-soft)] text-warn' : 'border-hair bg-raised2 text-fg'}`}>{product.stock}</span></div><div><span className="block text-[10.5px] font-medium uppercase tracking-wide text-fg-faint">Categoría</span><span className="mt-1 block truncate text-sm text-fg-muted">{product.category?.name || '—'}</span></div><div><span className="block text-[10.5px] font-medium uppercase tracking-wide text-fg-faint">Origen</span>{product.sourceProvider ? <span className="mt-1 inline-flex rounded-md border border-hair bg-raised2 px-2 py-0.5 text-xs text-fg-muted">{product.sourceProvider}</span> : <span className="mt-1 block text-sm text-fg-faint">—</span>}</div><div><span className="block text-[10.5px] font-medium uppercase tracking-wide text-fg-faint">{product.incomplete ? 'Estado' : 'Vencimiento'}</span>{product.incomplete ? <span className="mt-1 inline-flex rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-0.5 text-xs text-warn">Incompleto</span> : <span className={`mt-1 block font-mono text-xs tabular-nums ${expiryDays != null && expiryDays <= 30 ? 'text-crit' : 'text-fg-muted'}`}>{product.expiresAt ? new Date(product.expiresAt).toLocaleDateString('es-AR') : '—'}</span>}</div></div><div className="mt-3 flex justify-end gap-3 border-t border-hair-soft pt-3"><button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setQuickViewProduct(product); }} className="text-sm font-medium text-fg-muted">👁️ Vista rápida</button><button type="button" onClick={() => void openLabels([product.id])} className="text-sm font-medium text-fg-muted">Etiqueta</button><Link href={`/productos/${product.id}`} className="text-sm font-medium text-brand">Editar</Link></div></article>; })}{!loading && products.length === 0 && <p className="rounded-xl border border-hair-soft bg-surface p-6 text-center text-fg-faint">No hay productos para estos filtros.</p>}</div>{loading && <Loader />}</div>

    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted"><p><span className="font-mono tabular-nums text-fg">{total}</span> productos · Página <span className="font-mono">{page}</span> de <span className="font-mono">{totalPages || 1}</span></p><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-hair px-3 py-2 disabled:opacity-40">Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-hair px-3 py-2 disabled:opacity-40">Siguiente</button><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg">{[25, 50, 100, 200].map((size) => <option key={size} value={size}>{size} por página</option>)}</select></div></div>
    </>}

    {stockSummary && (
      <section className="rounded-xl border border-hair-soft bg-surface" data-tour="productos-stock-summary">
        <button
          type="button"
          onClick={() => setShowStats((current) => !current)}
          className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="text-sm font-medium text-fg">Estadísticas de inventario</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
            <span><span className="font-mono tabular-nums text-fg">{stockSummary.productCount}</span> productos</span>
            <span>Venta <span className="font-mono tabular-nums text-brand">{formatMoneyArs(stockSummary.valueAtSale)}</span></span>
            <span className="text-warn">{stockSummary.lowStockCount} stock bajo</span>
            <span className="text-crit">{stockSummary.expiringUnitsInWindow} por vencer</span>
            <ChevronDown className={`h-4 w-4 text-fg-faint transition-transform ${showStats ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {showStats && (
          <div className="space-y-4 border-t border-hair-soft p-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-hair-soft border-l-4 border-l-[color:var(--brand-accent)] bg-raised p-4"><p className="text-xs text-fg-muted">Productos</p><p className="font-mono text-3xl font-bold tabular-nums text-fg">{stockSummary.productCount}</p><p className="font-mono text-xs text-fg-faint">Con stock {stockSummary.productsWithStock} · Sin stock {stockSummary.productsNoStock}</p></div>
              <div className="rounded-xl border border-hair-soft bg-raised p-4"><p className="text-xs text-fg-muted">Valor de venta</p><p className="font-mono text-2xl font-bold tabular-nums text-brand">{formatMoneyArs(stockSummary.valueAtSale)}</p><p className="font-mono text-xs text-ok">Margen {formatMoneyArs(stockSummary.potentialMargin)}</p></div>
              <button type="button" onClick={() => changeFilter('lowStock', true)} className="rounded-xl border border-warn/30 border-l-4 border-l-warn bg-[var(--warn-soft)] p-4 text-left"><p className="text-xs text-warn">Stock bajo</p><p className="font-mono text-3xl font-bold text-warn">{stockSummary.lowStockCount}</p><p className="font-mono text-xs text-fg-muted">{stockSummary.totalUnits} unidades totales</p></button>
              <div className="rounded-xl border border-crit/30 border-l-4 border-l-crit bg-[var(--crit-soft)] p-4"><p className="text-xs text-crit">Por vencer ({stockSummary.expiringDaysWindow} días)</p><p className="font-mono text-3xl font-bold text-crit">{stockSummary.expiringUnitsInWindow}</p><p className="font-mono text-xs text-fg-muted">{stockSummary.expiringProductsCount} productos</p></div>
            </div>
            <details className="rounded-xl border border-hair-soft bg-raised p-4">
              <summary className="cursor-pointer font-medium text-fg">Más estadísticas y vencimientos</summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <p className="text-sm text-fg-muted">Costo productos <strong className="block font-mono text-fg">{formatMoneyArs(stockSummary.valueAtCostProduct)}</strong></p>
                <p className="text-sm text-fg-muted">Costo lotes <strong className="block font-mono text-fg">{formatMoneyArs(stockSummary.valueAtCostBatches)}</strong></p>
                <p className="text-sm text-fg-muted">Sin costo con stock <strong className="block font-mono text-warn">{stockSummary.productsWithoutCostWithStock}</strong></p>
              </div>
              {(stockSummary.expiringBatches.length > 0 || stockSummary.expiringByProduct.length > 0) && (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-fg">Lotes por vencer</h3>
                    {stockSummary.expiringBatches.map((batch) => <div key={batch.id} className="flex justify-between border-t border-hair-soft py-2 text-sm"><Link href={`/productos/${batch.productId}`} className="text-brand">{batch.productName}</Link><span className="font-mono text-fg-muted">{batch.qty} · {new Date(batch.expiresAt).toLocaleDateString('es-AR')}</span></div>)}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-fg">Próximo vencimiento por producto</h3>
                    {stockSummary.expiringByProduct.map((item, index) => <div key={`${item.name}-${index}`} className="flex justify-between border-t border-hair-soft py-2 text-sm"><span className="text-fg">{item.name}</span><span className="font-mono text-fg-muted">{item.qtyExpiring} · {new Date(`${item.expiresAt}T12:00:00`).toLocaleDateString('es-AR')}</span></div>)}
                  </div>
                </div>
              )}
            </details>
          </div>
        )}
      </section>
    )}

    {quickViewProduct && (() => { const product = quickViewProduct; const rows: [string, string | null][] = [['Marca', product.brand ?? null], ['Categoría', product.category?.name ?? null], ['Subcategoría', product.subcategory ?? null], ['Cód. de barras', product.barcode ?? null], ['EAN bulto', product.eanBox ?? null], ['SKU proveedor', product.supplierSku ?? null], ['Ref. proveedor', product.supplierRef ?? null], ['ID externo', product.externalId ?? null], ['Costo', product.cost != null && Number(product.cost) > 0 ? formatMoneyArs(Number(product.cost)) : null], ['Precio', formatMoneyArs(Number(product.price))], ['IVA', product.iva != null ? `${Number(product.iva)}%` : null], ['Unidades por bulto', product.unitsPerBox ?? null], ['Peso', product.weight ?? null], ['Formato', product.format ?? null], ['Sabor', product.flavor ?? null], ['Presentación', product.presentation ?? null], ['Stock', String(product.stock)], ['Stock mínimo', String(product.minStock)], ['Control de stock', product.stockControl ? 'Sí' : 'No'], ['Producto silencioso', product.silent ? 'Sí' : 'No'], ['Origen', product.sourceProvider ?? null], ['Vencimiento', product.expiresAt ? new Date(product.expiresAt).toLocaleDateString('es-AR') : null]]; const filled = rows.filter(([, value]) => value != null && value !== '' && value !== '—'); return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setQuickViewProduct(null)}><div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hair bg-surface shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-3 border-b border-hair-soft p-4">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-raised2 text-sm font-bold text-fg-muted">{product.name.trim().slice(0, 2).toUpperCase()}</span>}<div className="min-w-0 flex-1"><h2 className="truncate text-lg font-bold text-fg">{product.name}</h2><p className="text-xs text-fg-faint">Vista rápida · {filled.length} datos completos</p></div><button type="button" onClick={() => setQuickViewProduct(null)} className="rounded-lg px-2 py-1 text-fg-muted hover:bg-raised" aria-label="Cerrar vista rápida">✕</button></div><div className="flex-1 overflow-y-auto p-4"><dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{filled.map(([label, value]) => <div key={label} className="flex flex-col border-b border-hair-soft/60 pb-2"><dt className="text-[11px] font-medium uppercase tracking-wide text-fg-faint">{label}</dt><dd className="mt-0.5 truncate text-sm text-fg">{value}</dd></div>)}</dl></div><div className="flex justify-end border-t border-hair-soft p-4"><Link href={`/productos/${product.id}`} className="text-sm font-medium text-brand hover:underline">Editar</Link></div></div></div>; })()}

    {bulkDialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setBulkDialog(null); }}><div className="w-full max-w-md rounded-2xl border border-hair bg-surface p-5 shadow-2xl"><h2 className="text-xl font-bold text-fg">{bulkDialog.title}</h2><p className="mt-1 text-sm text-fg-muted">Se aplicará a <span className="font-mono text-brand">{selected.size}</span> productos.</p><label className="mt-5 block text-sm font-medium text-fg-muted">{bulkDialog.label}{bulkDialog.kind === 'category' ? <select autoFocus value={bulkDialog.value} onChange={(event) => setBulkDialog({ ...bulkDialog, value: event.target.value })} className="mt-2 h-12 w-full rounded-xl border border-hair bg-raised px-3 text-fg"><option value="">Elegí una categoría</option>{facets.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select> : <input autoFocus type={bulkDialog.kind === 'number' ? 'number' : 'text'} step={bulkDialog.kind === 'number' ? '0.01' : undefined} value={bulkDialog.value} onChange={(event) => setBulkDialog({ ...bulkDialog, value: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') submitBulkDialog(); if (event.key === 'Escape') setBulkDialog(null); }} className="mt-2 h-12 w-full rounded-xl border border-hair bg-raised px-3 font-mono text-fg" />}</label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setBulkDialog(null)} className="rounded-xl border border-hair px-4 py-2.5 text-sm text-fg-muted">Cancelar</button><button type="button" onClick={submitBulkDialog} className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold">Aplicar</button></div></div></div>}

    {showDuplicates && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDuplicates(false); }}><div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-hair bg-surface p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold text-fg">Duplicados por EAN</h2><button type="button" onClick={() => setShowDuplicates(false)} className="text-fg-muted">Cerrar</button></div>{duplicates.length === 0 ? <p className="text-fg-muted">No hay códigos duplicados activos.</p> : <div className="space-y-4">{duplicates.map((group) => <section key={group.barcode} className="rounded-xl border border-hair bg-raised p-4"><div className="mb-3 flex justify-between"><strong className="font-mono text-fg">EAN {group.barcode}</strong><span className="font-mono text-warn">{group.count}</span></div><div className="space-y-2">{group.products.map((product) => <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-hair-soft bg-surface p-3"><input type="radio" name={`keep-${group.barcode}`} checked={duplicateKeep[group.barcode] === product.id} onChange={() => setDuplicateKeep((current) => ({ ...current, [group.barcode]: product.id }))} /><span className="min-w-0 flex-1"><strong className="block text-fg">{product.name}</strong><span className="font-mono text-xs text-fg-faint">{product.sourceProvider || 'Sin origen'} · stock {product.stock} · {formatMoneyArs(Number(product.price))}</span></span></label>)}</div><button type="button" onClick={() => mergeDuplicate(group)} className="btn-brand mt-3 rounded-lg px-4 py-2">Conservar seleccionado y fusionar</button></section>)}</div>}</div></div>}
    {showHiddenCategories && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHiddenCategories(false); }}><div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-hair bg-surface p-5 shadow-xl"><div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-fg">Categorías ocultas</h2><p className="mt-1 text-sm text-fg-muted">No se mostrarán en el catálogo mientras el toggle esté activado.</p></div><button type="button" onClick={() => setShowHiddenCategories(false)} className="text-sm text-fg-muted hover:text-fg">Cerrar</button></div><div className="space-y-2">{facets.categories.length === 0 ? <p className="rounded-lg border border-hair-soft bg-raised p-4 text-sm text-fg-faint">No hay categorías disponibles.</p> : facets.categories.map((category) => <label key={category.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-hair-soft bg-raised px-3 py-2.5 hover:bg-raised2"><input type="checkbox" checked={hiddenCategoryIds.includes(category.id)} onChange={(event) => setHiddenCategoryIds((current) => event.target.checked ? [...new Set([...current, category.id])] : current.filter((id) => id !== category.id))} /><span className="min-w-0 flex-1 text-sm text-fg">{category.name}</span><span className="font-mono text-xs tabular-nums text-fg-faint">{category.count}</span></label>)}</div><div className="mt-5 flex items-center justify-between gap-3 border-t border-hair-soft pt-4"><button type="button" onClick={() => setHiddenCategoryIds([])} className="text-sm text-crit hover:underline">Limpiar selección</button><button type="button" disabled={savingHiddenCategories} onClick={() => void saveHiddenCategories()} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{savingHiddenCategories ? 'Guardando…' : 'Guardar'}</button></div></div></div>}
    {showIncomplete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowIncomplete(false); }}><div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-hair bg-surface p-5 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-fg">Completar productos</h2><p className="mt-1 text-sm text-fg-muted">Completá los datos básicos y activá el control de stock cuando corresponda.</p></div><button type="button" onClick={() => setShowIncomplete(false)} className="text-sm text-fg-muted hover:text-fg">Cerrar</button></div>{incompleteProducts.length === 0 ? <div className="rounded-xl border border-ok/30 bg-[var(--ok-soft)] p-8 text-center text-ok">No hay productos incompletos.</div> : <div className="space-y-3">{incompleteProducts.map((product) => { const draft = incompleteDrafts[product.id] ?? { categoryId: '', brand: '', cost: '', stockControl: false }; const updateDraft = (patch: Partial<IncompleteDraft>) => setIncompleteDrafts((current) => ({ ...current, [product.id]: { ...draft, ...patch } })); return <section key={product.id} className="rounded-xl border border-hair-soft bg-raised p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><strong className="text-fg">{product.name}</strong><p className="font-mono text-xs text-fg-faint">{product.barcode || 'Sin SKU'} · {formatMoneyArs(Number(product.price))}</p></div><span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 text-xs text-warn">Incompleto</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-fg-muted">Categoría<select value={draft.categoryId} onChange={(event) => updateDraft({ categoryId: event.target.value })} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-fg"><option value="">Sin categoría</option>{facets.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="text-xs text-fg-muted">Marca<input value={draft.brand} onChange={(event) => updateDraft({ brand: event.target.value })} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-fg" /></label><label className="text-xs text-fg-muted">Costo<input value={draft.cost} inputMode="decimal" onChange={(event) => updateDraft({ cost: event.target.value })} className="mt-1 w-full rounded-lg border border-hair bg-surface px-3 py-2 font-mono text-sm tabular-nums text-fg" /></label><label className="flex items-center gap-2 self-end rounded-lg border border-hair bg-surface px-3 py-2.5 text-sm text-fg-muted"><input type="checkbox" checked={draft.stockControl} onChange={(event) => updateDraft({ stockControl: event.target.checked })} />Control de stock</label></div><div className="mt-3 flex justify-end"><button type="button" disabled={savingIncompleteId === product.id} onClick={() => void saveIncompleteProduct(product)} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{savingIncompleteId === product.id ? 'Guardando…' : 'Guardar'}</button></div></section>; })}</div>}</div></div>}
    {labelItems ? <LabelPrintDialog items={labelItems} onClose={() => setLabelItems(null)} /> : null}
    </>
    )}
  </Container>;
}
