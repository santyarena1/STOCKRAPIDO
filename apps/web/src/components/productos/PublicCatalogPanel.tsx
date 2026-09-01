'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';
import { Loader } from '@/components/ui/Loader';
import { useBilling } from '@/components/billing/BillingProvider';

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

export function PublicCatalogPanel() {
  const { readOnly } = useBilling();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    const t = setTimeout(() => void fetchList(), 200);
    return () => clearTimeout(t);
  }, [fetchList]);

  const importOne = async (id: string) => {
    if (readOnly) return alert('Tu cuenta está en solo lectura.');
    setBusyId(id);
    try {
      await api('/public-catalog/import', { method: 'POST', body: JSON.stringify({ publicProductId: id }) });
      await fetchList();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo importar');
    } finally {
      setBusyId(null);
    }
  };

  const importSelected = async () => {
    if (readOnly) return alert('Tu cuenta está en solo lectura.');
    const ids = [...selected];
    if (!ids.length) return;
    setBusyId('batch');
    try {
      const r = await api<{ imported: number; skipped: number }>('/public-catalog/import-batch', {
        method: 'POST',
        body: JSON.stringify({ publicProductIds: ids }),
      });
      alert(`Importados: ${r.imported}. Omitidos: ${r.skipped}.`);
      setSelected(new Set());
      await fetchList();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error en lote');
    } finally {
      setBusyId(null);
    }
  };

  const importAllVisible = async () => {
    const ids = items.filter((i) => !i.alreadyImported).map((i) => i.id);
    setSelected(new Set(ids));
    await importSelected();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-hair-soft bg-surface p-4">
        <h2 className="font-semibold text-fg">Catálogo comunitario</h2>
        <p className="text-sm text-fg-faint mt-1">
          Fichas compartidas por otros kioscos: imagen, nombre, código y categoría.{' '}
          <strong className="text-fg-muted">Sin precios</strong> — cada uno pone el suyo al importar.
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
        <p className="text-center text-sm text-fg-faint py-8">No hay resultados. Probá otra búsqueda o publicá productos desde tus fichas.</p>
      ) : (
        <ul className="divide-y divide-hair-soft rounded-xl border border-hair-soft overflow-hidden">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 bg-raised px-3 py-3">
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
              />
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="h-12 w-12 rounded object-contain bg-surface" />
              ) : (
                <div className="h-12 w-12 rounded bg-surface border border-hair-soft" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg truncate">{item.name}</p>
                <p className="text-xs text-fg-faint">
                  {[item.brand, item.category, item.barcode].filter(Boolean).join(' · ') || 'Sin datos extra'}
                </p>
              </div>
              {item.alreadyImported && item.localProductId ? (
                <Link href={`/productos/${item.localProductId}`} className="text-xs text-brand hover:underline">
                  En tu inventario
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={readOnly || busyId === item.id}
                  onClick={() => void importOne(item.id)}
                  className="rounded-lg border border-hair px-3 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-50"
                >
                  {busyId === item.id ? '…' : 'Importar'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
