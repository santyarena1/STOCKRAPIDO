'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CATALOG_SHARE_CONSENT_TEXT, PUBLIC_CATALOG_INTRO } from '@/lib/plans';
import { Loader } from '@/components/ui/Loader';
import { useBilling } from '@/components/billing/BillingProvider';
import { CatalogImportModal } from '@/components/productos/CatalogImportModal';

const INTRO_STORAGE_KEY = 'stockrapido:public-catalog-intro:v1';

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

export function PublicCatalogPanel() {
  const { readOnly } = useBilling();
  const [tab, setTab] = useState<'search' | 'history'>('search');
  const [showIntro, setShowIntro] = useState(false);
  const [importModalId, setImportModalId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const dismissIntro = () => {
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setShowIntro(false);
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ items: CatalogItem[]; total: number }>('/public-catalog', {
        params: { q: q.trim() || undefined, limit: '50' },
      });
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await api<{ items: ImportHistoryItem[]; total: number }>('/public-catalog/import-history', {
        params: { limit: '80' },
      });
      setHistory(data.items);
      setHistoryTotal(data.total);
    } catch {
      setHistory([]);
      setHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'search') return;
    const t = setTimeout(() => void fetchList(), 200);
    return () => clearTimeout(t);
  }, [fetchList, tab]);

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
    if (ids.length === 1) {
      openImport(ids[0]);
      return;
    }
    setSelected(new Set(ids));
    await importSelected();
  };

  return (
    <div className="space-y-4">
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
            <p className="mt-3 text-xs text-fg-faint border-l-2 border-hair pl-3">{CATALOG_SHARE_CONSENT_TEXT}</p>
            <button
              type="button"
              onClick={dismissIntro}
              className="mt-5 w-full rounded-xl btn-brand px-4 py-2.5 text-sm font-semibold"
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

      <div className="inline-flex rounded-lg border border-hair bg-raised p-1">
        <button
          type="button"
          onClick={() => setTab('search')}
          className={`rounded-md px-4 py-2 text-sm font-medium ${tab === 'search' ? 'bg-raised2 text-fg' : 'text-fg-faint'}`}
        >
          Buscar fichas
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`rounded-md px-4 py-2 text-sm font-medium ${tab === 'history' ? 'bg-raised2 text-fg' : 'text-fg-faint'}`}
        >
          Historial importados
        </button>
      </div>

      {tab === 'search' ? (
        <>
          <div className="rounded-xl border border-hair-soft bg-surface p-4">
            <h2 className="font-semibold text-fg">Catálogo comunitario</h2>
            <p className="text-sm text-fg-faint mt-1">
              Fichas compartidas por la comunidad (sin precios). Al importar podés completar código, marca, categoría y precios (todo opcional).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, marca o código…"
                className="min-w-[200px] flex-1 rounded-lg border border-hair-soft bg-raised px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={readOnly || !selected.size || busyId === 'batch'}
                onClick={() => void importSelected()}
                className="rounded-lg btn-brand px-4 py-2 text-sm disabled:opacity-50"
              >
                Importar seleccionados ({selected.size})
              </button>
              <button
                type="button"
                disabled={readOnly || loading || items.every((i) => i.alreadyImported)}
                onClick={() => void importAllVisible()}
                className="rounded-lg border border-hair px-4 py-2 text-sm text-fg-muted hover:bg-raised disabled:opacity-50"
              >
                Importar todos los visibles
              </button>
            </div>
            <p className="text-xs text-fg-faint mt-2">{total} ficha(s) en el catálogo</p>
          </div>

          {loading ? (
            <Loader size="sm" label="Catálogo" />
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-fg-faint py-8">
              No hay resultados. Probá otra búsqueda o publicá productos desde tus fichas.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
              {items.map((item) => (
                <article
                  key={item.id}
                  className={`group flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface shadow-sm transition duration-200 ${
                    selected.has(item.id)
                      ? 'border-[color:var(--brand-accent)] shadow-md'
                      : 'border-hair-soft hover:-translate-y-0.5 hover:border-[color:var(--brand-accent)] hover:shadow-lg'
                  }`}
                >
                  <div className="relative aspect-square overflow-hidden bg-raised p-5">
                    <label className="absolute left-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-hair bg-surface/90 backdrop-blur">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        disabled={item.alreadyImported}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4"
                      />
                    </label>
                    {item.alreadyImported && (
                      <span className="absolute right-3 top-3 z-10 rounded-md border border-ok/40 bg-[var(--ok-soft)] px-2 py-1 text-xs font-semibold text-ok backdrop-blur">
                        Importado
                      </span>
                    )}
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-xl border border-hair-soft bg-surface text-5xl font-bold text-fg-faint">
                        {item.name.trim().slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="min-h-12 overflow-hidden text-base font-semibold leading-6 text-fg [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {item.name}
                    </h3>
                    <p className="mt-1 truncate text-sm text-fg-faint">
                      {[item.category, item.brand].filter(Boolean).join(' · ') || 'Sin categoría ni marca'}
                    </p>
                    {item.barcode && (
                      <p className="mt-1 truncate font-mono text-xs text-fg-faint">{item.barcode}</p>
                    )}
                    <div className="mt-4 border-t border-hair-soft pt-4">
                      {item.alreadyImported && item.localProductId ? (
                        <Link
                          href={`/productos/${item.localProductId}`}
                          className="block w-full rounded-xl border border-hair bg-raised px-4 py-2.5 text-center text-sm font-semibold text-brand transition-colors hover:border-[color:var(--brand-accent)] hover:bg-brand-highlight-soft"
                        >
                          Ver en inventario
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={readOnly || busyId === item.id}
                          onClick={() => openImport(item.id)}
                          className="w-full rounded-xl btn-brand px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                        >
                          Importar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-hair-soft bg-surface overflow-hidden">
          <div className="border-b border-hair-soft px-4 py-3">
            <h2 className="font-semibold text-fg">Historial de importados</h2>
            <p className="text-xs text-fg-faint mt-0.5">{historyTotal} importación(es) registradas</p>
          </div>
          {historyLoading ? (
            <div className="p-6">
              <Loader size="sm" label="Historial" />
            </div>
          ) : history.length === 0 ? (
            <p className="p-8 text-center text-sm text-fg-faint">Todavía no importaste fichas del catálogo.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-4">
              {history.map((row) => {
                const name = row.localProduct?.name || row.publicProduct?.name || 'Producto';
                return (
                  <article
                    key={row.id}
                    className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-hair-soft bg-raised transition hover:border-[color:var(--brand-accent)] hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-surface p-3">
                      {row.publicProduct?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.publicProduct.imageUrl} alt={name} className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-fg-faint">
                          {name.trim().slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <p className="truncate text-sm font-semibold text-fg">{name}</p>
                      <p className="mt-1 text-xs text-fg-faint">
                        {new Date(row.importedAt).toLocaleString('es-AR')}
                      </p>
                      {row.publicProduct?.barcode && (
                        <p className="mt-0.5 truncate font-mono text-[11px] text-fg-faint">{row.publicProduct.barcode}</p>
                      )}
                      {row.localProduct?.id && (
                        <Link
                          href={`/productos/${row.localProduct.id}`}
                          className="mt-3 block rounded-lg border border-hair bg-surface px-3 py-2 text-center text-xs font-semibold text-brand hover:bg-brand-highlight-soft"
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
        </div>
      )}
    </div>
  );
}
