'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Grid2X2, List, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { CATALOG_SHARE_CONSENT_TEXT, PUBLIC_CATALOG_INTRO } from '@/lib/plans';
import { usePersistedState } from '@/lib/use-persisted-state';
import { Loader } from '@/components/ui/Loader';
import { useBilling } from '@/components/billing/BillingProvider';
import { CatalogImportModal } from '@/components/productos/CatalogImportModal';

const INTRO_STORAGE_KEY = 'stockrapido:public-catalog-intro:v1';
const PAGE_SIZES = [24, 48, 96] as const;

type CatalogItem = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  imageUrl: string | null;
  alreadyImported: boolean;
  localProductId: string | null;
};

type ImportHistoryItem = {
  id: string;
  importedAt: string;
  publicProduct: {
    id: string;
    name: string;
    brand: string | null;
    barcode: string | null;
    imageUrl: string | null;
    category: string | null;
  } | null;
  localProduct: { id: string; name: string; brand: string | null; barcode: string | null } | null;
};

type Facets = { brands: string[]; categories: string[] };

type ImportedFilter = '' | 'no' | 'yes';
type SortOption = 'newest' | 'name' | 'brand';
type ViewMode = 'cards' | 'list';

const FILTER_SELECT =
  'w-full rounded-lg border border-hair bg-raised px-3 py-2 text-sm text-fg outline-none focus:border-[color:var(--brand-accent)]';

function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-hair-soft bg-surface p-4 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between">
      <p>
        Mostrando <span className="font-mono tabular-nums text-fg">{from}</span>–
        <span className="font-mono tabular-nums text-fg">{to}</span> de{' '}
        <span className="font-mono tabular-nums text-fg">{total}</span> · Página{' '}
        <span className="font-mono text-fg">{page}</span> de{' '}
        <span className="font-mono text-fg">{totalPages}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="min-h-10 rounded-xl border border-hair px-4 py-2 font-medium disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="min-h-10 rounded-xl border border-hair px-4 py-2 font-medium disabled:opacity-40"
        >
          Siguiente
        </button>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-xl border border-hair bg-raised px-3 py-2 text-fg"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} por página
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CatalogThumb({ name, imageUrl, compact }: { name: string; imageUrl: string | null; compact?: boolean }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt={name} className="h-full w-full object-contain" />
    );
  }
  return (
    <div
      className={`flex h-full w-full items-center justify-center font-bold text-fg-faint ${compact ? 'text-2xl' : 'text-4xl'}`}
    >
      {name.trim().slice(0, 2).toUpperCase()}
    </div>
  );
}

export function PublicCatalogPanel() {
  const { readOnly } = useBilling();
  const [tab, setTab] = useState<'search' | 'history'>('search');
  const [showIntro, setShowIntro] = useState(false);
  const [importModalId, setImportModalId] = useState<string | null>(null);

  const [q, setQ, qReady] = usePersistedState('sr-filters:public-catalog:q', '');
  const [brand, setBrand, brandReady] = usePersistedState('sr-filters:public-catalog:brand', '');
  const [category, setCategory, categoryReady] = usePersistedState('sr-filters:public-catalog:category', '');
  const [importedFilter, setImportedFilter, importedReady] = usePersistedState<ImportedFilter>(
    'sr-filters:public-catalog:imported',
    '',
  );
  const [hasImage, setHasImage, hasImageReady] = usePersistedState('sr-filters:public-catalog:hasImage', false);
  const [sort, setSort, sortReady] = usePersistedState<SortOption>('sr-filters:public-catalog:sort', 'newest');
  const [view, setView] = usePersistedState<ViewMode>('sr-filters:public-catalog:view', 'cards');
  const [pageSize, setPageSize, pageSizeReady] = usePersistedState('sr-filters:public-catalog:pageSize', 48);
  const catalogReady = qReady && brandReady && categoryReady && importedReady && hasImageReady && sortReady && pageSizeReady;

  const [searchInput, setSearchInput] = useState('');
  const [historyInput, setHistoryInput] = useState('');
  const [historyQ, setHistoryQ] = useState('');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets>({ brands: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    try {
      setShowIntro(localStorage.getItem(INTRO_STORAGE_KEY) !== '1');
    } catch {
      setShowIntro(false);
    }
  }, []);

  useEffect(() => {
    if (!catalogReady) return;
    const t = setTimeout(() => setQ(searchInput), 250);
    return () => clearTimeout(t);
  }, [catalogReady, searchInput, setQ]);

  useEffect(() => {
    const t = setTimeout(() => setHistoryQ(historyInput), 250);
    return () => clearTimeout(t);
  }, [historyInput]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [q, brand, category, importedFilter, hasImage, sort, pageSize]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyQ, pageSize]);

  useEffect(() => {
    if (!bulkMenuOpen) return;
    const outside = (event: MouseEvent) => {
      if (!bulkMenuRef.current?.contains(event.target as Node)) setBulkMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBulkMenuOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [bulkMenuOpen]);

  const dismissIntro = () => {
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setShowIntro(false);
  };

  useEffect(() => {
    if (!catalogReady) return;
    setSearchInput(q);
  }, [catalogReady, q]);

  const fetchList = useCallback(async () => {
    if (!catalogReady) return;
    setLoading(true);
    try {
      const data = await api<{ items: CatalogItem[]; total: number; facets: Facets }>('/public-catalog', {
        params: {
          q: q.trim() || undefined,
          brand: brand || undefined,
          category: category || undefined,
          imported: importedFilter || undefined,
          hasImage: hasImage ? 'true' : undefined,
          sort,
          limit: String(pageSize),
          offset: String((page - 1) * pageSize),
        },
      });
      setItems(data.items);
      setTotal(data.total);
      setFacets(data.facets ?? { brands: [], categories: [] });
    } catch {
      setItems([]);
      setTotal(0);
      setFacets({ brands: [], categories: [] });
    } finally {
      setLoading(false);
    }
  }, [catalogReady, q, brand, category, importedFilter, hasImage, sort, pageSize, page]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await api<{ items: ImportHistoryItem[]; total: number }>('/public-catalog/import-history', {
        params: {
          q: historyQ.trim() || undefined,
          limit: String(pageSize),
          offset: String((historyPage - 1) * pageSize),
        },
      });
      setHistory(data.items);
      setHistoryTotal(data.total);
    } catch {
      setHistory([]);
      setHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyQ, historyPage, pageSize]);

  useEffect(() => {
    if (!catalogReady || tab !== 'search') return;
    void fetchList();
  }, [catalogReady, fetchList, tab]);

  useEffect(() => {
    if (tab === 'history') void fetchHistory();
  }, [tab, fetchHistory]);

  const afterImport = () => {
    void fetchList();
    if (tab === 'history') void fetchHistory();
  };

  const openImport = (id: string) => {
    if (readOnly) return alert('Tu cuenta está en solo lectura.');
    setImportModalId(id);
  };

  const importSelected = async () => {
    if (readOnly) return alert('Tu cuenta está en solo lectura.');
    const ids = [...selected];
    if (!ids.length) return;
    if (ids.length === 1) {
      openImport(ids[0]);
      return;
    }
    setBusyId('batch');
    setBulkMenuOpen(false);
    try {
      const r = await api<{ imported: number; skipped: number }>('/public-catalog/import-batch', {
        method: 'POST',
        body: JSON.stringify({ publicProductIds: ids }),
      });
      alert(`Importados: ${r.imported}. Omitidos: ${r.skipped}. Para completar datos, importá de a uno con el modal.`);
      setSelected(new Set());
      await fetchList();
      await fetchHistory();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error en lote');
    } finally {
      setBusyId(null);
    }
  };

  const importAllVisible = async () => {
    const ids = items.filter((i) => !i.alreadyImported).map((i) => i.id);
    if (!ids.length) return;
    if (ids.length === 1) {
      openImport(ids[0]);
      return;
    }
    setSelected(new Set(ids));
    await importSelected();
  };

  const clearFilters = () => {
    setSearchInput('');
    setQ('');
    setBrand('');
    setCategory('');
    setImportedFilter('');
    setHasImage(false);
    setSort('newest');
  };

  const hasActiveFilters = Boolean(q || brand || category || importedFilter || hasImage || sort !== 'newest');

  const selectableOnPage = useMemo(() => items.filter((i) => !i.alreadyImported), [items]);
  const allPageSelected =
    selectableOnPage.length > 0 && selectableOnPage.every((item) => selected.has(item.id));

  const toggleSelectAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        selectableOnPage.forEach((item) => next.delete(item.id));
      } else {
        selectableOnPage.forEach((item) => next.add(item.id));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCard = (item: CatalogItem) => (
    <article
      key={item.id}
      className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface transition duration-150 ${
        selected.has(item.id)
          ? 'border-[color:var(--brand-accent)] shadow-md'
          : 'border-hair-soft hover:border-[color:var(--brand-accent)] hover:shadow-md'
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-raised p-2">
        <label className="absolute left-1.5 top-1.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-hair bg-surface/90 backdrop-blur">
          <input
            type="checkbox"
            checked={selected.has(item.id)}
            disabled={item.alreadyImported}
            onChange={() => toggleSelect(item.id)}
            className="h-3.5 w-3.5"
          />
        </label>
        {item.alreadyImported && (
          <span className="absolute right-1.5 top-1.5 z-10 rounded border border-ok/40 bg-[var(--ok-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-ok backdrop-blur">
            OK
          </span>
        )}
        <CatalogThumb name={item.name} imageUrl={item.imageUrl} compact />
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-fg">{item.name}</h3>
        <p className="mt-0.5 truncate text-[11px] text-fg-faint">
          {[item.brand, item.category].filter(Boolean).join(' · ') || '—'}
        </p>
        {item.barcode && <p className="truncate font-mono text-[10px] text-fg-faint">{item.barcode}</p>}
        <div className="mt-2">
          {item.alreadyImported && item.localProductId ? (
            <Link
              href={`/productos/${item.localProductId}`}
              className="block w-full rounded-lg border border-hair bg-raised px-2 py-1.5 text-center text-xs font-semibold text-brand hover:bg-brand-highlight-soft"
            >
              Ver
            </Link>
          ) : (
            <button
              type="button"
              disabled={readOnly || busyId === item.id}
              onClick={() => openImport(item.id)}
              className="w-full rounded-lg btn-brand px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Importar
            </button>
          )}
        </div>
      </div>
    </article>
  );

  const renderListRow = (item: CatalogItem) => (
    <tr key={item.id} className="hover:bg-raised/60">
      <td className="p-2">
        <input
          type="checkbox"
          checked={selected.has(item.id)}
          disabled={item.alreadyImported}
          onChange={() => toggleSelect(item.id)}
        />
      </td>
      <td className="p-2">
        <div className="h-10 w-10 overflow-hidden rounded-lg border border-hair-soft bg-raised p-1">
          <CatalogThumb name={item.name} imageUrl={item.imageUrl} compact />
        </div>
      </td>
      <td className="max-w-[280px] p-2">
        <p className="truncate font-medium text-fg">{item.name}</p>
        {item.barcode && <p className="truncate font-mono text-[11px] text-fg-faint">{item.barcode}</p>}
      </td>
      <td className="p-2 text-fg-muted">{item.brand || '—'}</td>
      <td className="p-2 text-fg-muted">{item.category || '—'}</td>
      <td className="p-2">
        {item.alreadyImported ? (
          <span className="rounded-md border border-ok/30 bg-[var(--ok-soft)] px-2 py-0.5 text-xs text-ok">
            Importado
          </span>
        ) : (
          <span className="rounded-md border border-hair bg-raised2 px-2 py-0.5 text-xs text-fg-muted">
            Disponible
          </span>
        )}
      </td>
      <td className="p-2 text-right">
        {item.alreadyImported && item.localProductId ? (
          <Link href={`/productos/${item.localProductId}`} className="text-xs font-semibold text-brand hover:underline">
            Ver
          </Link>
        ) : (
          <button
            type="button"
            disabled={readOnly || busyId === item.id}
            onClick={() => openImport(item.id)}
            className="rounded-lg border border-hair px-2.5 py-1 text-xs font-medium hover:bg-raised disabled:opacity-50"
          >
            Importar
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      {showIntro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={dismissIntro}>
          <div
            className="w-full max-w-lg rounded-2xl border border-hair bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-fg">{PUBLIC_CATALOG_INTRO.title}</h2>
            <p className="mt-2 text-sm text-fg-muted">{PUBLIC_CATALOG_INTRO.lead}</p>
            <ul className="mt-4 space-y-2 text-sm text-fg-muted">
              {PUBLIC_CATALOG_INTRO.bullets.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-brand">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-fg-faint">{PUBLIC_CATALOG_INTRO.limits}</p>
            <p className="mt-3 border-l-2 border-hair pl-3 text-xs text-fg-faint">{CATALOG_SHARE_CONSENT_TEXT}</p>
            <button
              type="button"
              onClick={dismissIntro}
              className="btn-brand mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {importModalId && (
        <CatalogImportModal
          publicProductId={importModalId}
          onClose={() => setImportModalId(null)}
          onImported={afterImport}
        />
      )}

      <div className="inline-flex rounded-lg border border-hair overflow-hidden">
        <button
          type="button"
          onClick={() => setTab('search')}
          className={`px-4 py-2 text-sm font-semibold ${tab === 'search' ? 'bg-brand-highlight text-brand' : 'bg-raised text-fg-muted'}`}
        >
          Buscar fichas
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-semibold ${tab === 'history' ? 'bg-brand-highlight text-brand' : 'bg-raised text-fg-muted'}`}
        >
          Historial importados
        </button>
      </div>

      {tab === 'search' ? (
        <>
          <section className="space-y-3 rounded-xl border border-hair-soft bg-surface p-3 sm:p-4">
            <p className="text-sm text-fg-faint">
              Fichas compartidas sin precios. Filtrá, navegá por páginas e importá a tu inventario.
            </p>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar por nombre, marca o código…"
                  className="h-11 w-full rounded-xl border border-hair bg-raised pl-10 pr-4 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-[color:var(--brand-accent)]"
                />
              </div>
              <div className="inline-flex self-start rounded-xl border border-hair bg-raised p-1 lg:self-auto">
                <button
                  type="button"
                  onClick={() => setView('cards')}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === 'cards' ? 'bg-raised2 font-semibold text-fg' : 'text-fg-muted hover:bg-surface'}`}
                >
                  <Grid2X2 className="h-4 w-4" />
                  Tarjetas
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === 'list' ? 'bg-raised2 font-semibold text-fg' : 'text-fg-muted hover:bg-surface'}`}
                >
                  <List className="h-4 w-4" />
                  Lista
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <label className="block text-xs text-fg-faint">
                Marca
                <select value={brand} onChange={(e) => setBrand(e.target.value)} className={`mt-1 ${FILTER_SELECT}`}>
                  <option value="">Todas</option>
                  {facets.brands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-fg-faint">
                Categoría
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1 ${FILTER_SELECT}`}>
                  <option value="">Todas</option>
                  {facets.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-fg-faint">
                Estado
                <select
                  value={importedFilter}
                  onChange={(e) => setImportedFilter(e.target.value as ImportedFilter)}
                  className={`mt-1 ${FILTER_SELECT}`}
                >
                  <option value="">Todos</option>
                  <option value="no">Sin importar</option>
                  <option value="yes">Ya importados</option>
                </select>
              </label>
              <label className="block text-xs text-fg-faint">
                Orden
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className={`mt-1 ${FILTER_SELECT}`}
                >
                  <option value="newest">Más recientes</option>
                  <option value="name">Nombre A–Z</option>
                  <option value="brand">Marca A–Z</option>
                </select>
              </label>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input type="checkbox" checked={hasImage} onChange={(e) => setHasImage(e.target.checked)} />
                  Solo con foto
                </label>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-lg border border-hair px-3 py-2 text-xs text-fg-muted hover:bg-raised"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-fg-faint">
              <span className="font-mono tabular-nums text-fg">{total}</span> ficha(s) encontradas
            </p>
          </section>

          {selected.size > 0 && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--brand-accent)] bg-surface p-3 shadow-lg">
              <div className="flex items-center gap-3">
                <strong className="font-mono text-brand">{selected.size} seleccionados</strong>
                <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-fg-muted hover:text-fg">
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={toggleSelectAllPage}
                  className="text-sm text-fg-muted hover:text-fg"
                  disabled={!selectableOnPage.length}
                >
                  {allPageSelected ? 'Desmarcar página' : 'Seleccionar página'}
                </button>
              </div>
              <div ref={bulkMenuRef} className="relative">
                <button
                  type="button"
                  disabled={readOnly || busyId === 'batch'}
                  onClick={() => setBulkMenuOpen((v) => !v)}
                  className="btn-brand flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  Acciones
                  <ChevronDown className={`h-4 w-4 transition-transform ${bulkMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {bulkMenuOpen && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-hair bg-surface p-2 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => void importSelected()}
                      className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-fg hover:bg-raised"
                    >
                      Importar seleccionados
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkMenuOpen(false);
                        void importAllVisible();
                      }}
                      className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-fg hover:bg-raised"
                    >
                      Importar todos los visibles
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <Loader size="sm" label="Catálogo" />
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-hair-soft bg-surface py-10 text-center text-sm text-fg-faint">
              No hay resultados. Probá otra búsqueda o publicá productos desde tus fichas.
            </p>
          ) : view === 'cards' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(185px,1fr))]">
              {items.map(renderCard)}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-hair-soft bg-surface">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-raised text-left text-xs uppercase text-fg-faint">
                  <tr>
                    <th className="w-10 p-2">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        disabled={!selectableOnPage.length}
                        onChange={toggleSelectAllPage}
                      />
                    </th>
                    <th className="w-14 p-2" />
                    <th className="p-2">Producto</th>
                    <th className="p-2">Marca</th>
                    <th className="p-2">Categoría</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hair-soft">{items.map(renderListRow)}</tbody>
              </table>
            </div>
          )}

          {!loading && total > 0 && (
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </>
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-hair-soft bg-surface p-4">
            <h2 className="font-semibold text-fg">Historial de importados</h2>
            <p className="mt-1 text-sm text-fg-faint">
              Fichas que ya trajiste a tu inventario.{' '}
              <span className="font-mono tabular-nums text-fg">{historyTotal}</span> importación(es).
            </p>
            <div className="relative mt-3 max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
              <input
                type="search"
                value={historyInput}
                onChange={(e) => setHistoryInput(e.target.value)}
                placeholder="Buscar en historial…"
                className="h-10 w-full rounded-xl border border-hair bg-raised pl-10 pr-4 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-[color:var(--brand-accent)]"
              />
            </div>
          </section>

          {historyLoading ? (
            <Loader size="sm" label="Historial" />
          ) : history.length === 0 ? (
            <p className="rounded-xl border border-hair-soft bg-surface py-10 text-center text-sm text-fg-faint">
              Todavía no importaste fichas del catálogo.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(185px,1fr))]">
              {history.map((row) => {
                const name = row.localProduct?.name || row.publicProduct?.name || 'Producto';
                return (
                  <article
                    key={row.id}
                    className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-hair-soft bg-surface transition hover:border-[color:var(--brand-accent)] hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-raised p-2">
                      <CatalogThumb name={name} imageUrl={row.publicProduct?.imageUrl ?? null} compact />
                    </div>
                    <div className="flex flex-1 flex-col p-2.5">
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-fg">{name}</p>
                      <p className="mt-0.5 text-[11px] text-fg-faint">
                        {new Date(row.importedAt).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {row.publicProduct?.barcode && (
                        <p className="truncate font-mono text-[10px] text-fg-faint">{row.publicProduct.barcode}</p>
                      )}
                      {row.localProduct?.id && (
                        <Link
                          href={`/productos/${row.localProduct.id}`}
                          className="mt-2 block rounded-lg border border-hair bg-raised px-2 py-1.5 text-center text-xs font-semibold text-brand hover:bg-brand-highlight-soft"
                        >
                          Ver producto
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!historyLoading && historyTotal > 0 && (
            <PaginationBar
              page={historyPage}
              pageSize={pageSize}
              total={historyTotal}
              onPageChange={setHistoryPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setHistoryPage(1);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
