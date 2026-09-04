'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { SupplierSelector } from '@/components/SupplierSelector';
import { CategorySelector } from '@/components/CategorySelector';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader, Spinner } from '@/components/ui/Loader';
import { usePersistedState } from '@/lib/use-persisted-state';
import { Grid2X2, List, Search } from 'lucide-react';

type Product = {
  id: string;
  name: string;
  barcode?: string | null;
  stock: number;
  minStock: number;
  price: string | number;
  cost?: string | number;
  category?: { id: string; name: string };
  imageUrl?: string | null;
  eanBox?: string | null;
  supplierSku?: string | null;
  supplierRef?: string | null;
  externalId?: string | null;
  allCodes?: string | null;
  matched?: string;
};
type Supplier = { id: string; name: string };
type Category = { id: string; name: string };

type PurchaseItemRow = {
  productId: string;
  productName: string;
  barcode: string;
  categoryId: string;
  qty: string;
  unitCost: string;
  price: string;
  minStock: string;
  expiresAt: string;
};

type Purchase = {
  id: string;
  total: string | number;
  createdAt: string;
  supplier: { id: string; name: string };
  items: {
    productId: string;
    qty: number;
    unitCost: string | number;
    expiresAt?: string | null;
    product: { name: string; barcode?: string | null; category?: { id: string; name: string } };
  }[];
};

const emptyItem = (): PurchaseItemRow => ({
  productId: '',
  productName: '',
  barcode: '',
  categoryId: '',
  qty: '1',
  unitCost: '0',
  price: '',
  minStock: '0',
  expiresAt: '',
});

export default function ComprasPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    supplierId: '',
    items: [emptyItem()] as PurchaseItemRow[],
  });
  const [searchTerm, setSearchTerm] = useState<Record<number, string>>({});
  const [searchResults, setSearchResults] = useState<Record<number, Product[]>>({});
  const [searchingResults, setSearchingResults] = useState<Record<number, boolean>>({});
  const [historyFilters, setHistoryFilters, historyFiltersReady] = usePersistedState('sr-filters:compras:history', {
    supplierId: '',
    from: '',
    to: '',
    q: '',
  });
  const [historyView, setHistoryView] = usePersistedState<'cards' | 'list'>('sr-compras-view', 'cards');
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [highlightedResultIndex, setHighlightedResultIndex] = useState<Record<number, number>>({});
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchPurchases = useCallback(async () => {
    const params: Record<string, string> = { limit: '100' };
    if (historyFilters.supplierId) params.supplierId = historyFilters.supplierId;
    if (historyFilters.from) params.from = historyFilters.from;
    if (historyFilters.to) params.to = historyFilters.to;
    const list = await api<Purchase[]>('/purchases', { params }).catch(() => []);
    setPurchases(Array.isArray(list) ? list : []);
  }, [historyFilters.supplierId, historyFilters.from, historyFilters.to]);

  useEffect(() => {
    Promise.allSettled([
      api<Supplier[]>('/suppliers'),
      api<Product[]>('/products'),
      api<Product[]>('/purchases/low-stock'),
      api<Category[]>('/business/categories'),
    ]).then(([sRes, pRes, lowRes, cRes]) => {
      setSuppliers(sRes.status === 'fulfilled' && Array.isArray(sRes.value) ? sRes.value : []);
      setProducts(pRes.status === 'fulfilled' && Array.isArray(pRes.value) ? pRes.value : []);
      setLowStock(lowRes.status === 'fulfilled' && Array.isArray(lowRes.value) ? lowRes.value : []);
      setCategories(cRes.status === 'fulfilled' && Array.isArray(cRes.value) ? cRes.value : []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!historyFiltersReady) return;
    void fetchPurchases();
  }, [historyFiltersReady, fetchPurchases]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    Object.entries(searchTerm).forEach(([idxStr, term]) => {
      const idx = Number(idxStr);
      if (!term.trim()) {
        setSearchResults((r) => ({ ...r, [idx]: [] }));
        setSearchingResults((current) => ({ ...current, [idx]: false }));
        return;
      }
      const t = setTimeout(async () => {
        setSearchingResults((current) => ({ ...current, [idx]: true }));
        try {
          const data = await api<Product[]>('/products/search', { params: { q: term, limit: '15' } }).catch(() => []);
          setSearchResults((r) => ({ ...r, [idx]: Array.isArray(data) ? data : [] }));
        } finally { setSearchingResults((current) => ({ ...current, [idx]: false })); }
      }, 150);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [searchTerm]);

  const addItem = () => {
    setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  };

  const removeItem = (index: number) => {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }));
  };

  const setItem = (index: number, patch: Partial<PurchaseItemRow>) => {
    setForm((f) => {
      const n = [...f.items];
      n[index] = { ...n[index], ...patch };
      return { ...f, items: n };
    });
  };

  const selectProduct = (index: number, p: Product) => {
    setItem(index, {
      productId: p.id,
      productName: p.name,
      barcode: p.barcode || '',
      categoryId: p.category?.id ?? '',
      unitCost: p.cost != null ? String(p.cost) : '0',
      price: p.price != null ? String(p.price) : '',
    });
    setSearchTerm((t) => ({ ...t, [index]: '' }));
    setSearchResults((r) => ({ ...r, [index]: [] }));
    setHighlightedResultIndex((h) => ({ ...h, [index]: 0 }));
  };

  const handleProductInputKeyDown = (itemIndex: number, e: React.KeyboardEvent) => {
    const results = searchResults[itemIndex] ?? [];
    if (results.length === 0) return;
    const current = Math.min(highlightedResultIndex[itemIndex] ?? 0, results.length - 1);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedResultIndex((h) => ({ ...h, [itemIndex]: Math.min(current + 1, results.length - 1) }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedResultIndex((h) => ({ ...h, [itemIndex]: Math.max(current - 1, 0) }));
    } else if (e.key === 'Enter' && results[current]) {
      e.preventDefault();
      selectProduct(itemIndex, results[current]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setHighlightedResultIndex((h) => ({ ...h, [itemIndex]: 0 }));
      setSearchResults((resultsByRow) => ({ ...resultsByRow, [itemIndex]: [] }));
    }
  };

  const loadPurchaseIntoForm = (p: Purchase, clearExpiry: boolean) => {
    setForm({
      supplierId: p.supplier.id,
      items: p.items.map((it) => ({
        productId: it.productId,
        productName: it.product.name,
        barcode: it.product?.barcode ?? '',
        categoryId: it.product?.category?.id ?? '',
        qty: String(it.qty),
        unitCost: String(it.unitCost),
        price: '',
        minStock: '0',
        expiresAt: clearExpiry ? '' : (it.expiresAt ? new Date(it.expiresAt).toISOString().slice(0, 10) : ''),
      })),
    });
    setSearchTerm({});
    setSearchResults({});
    setShowNew(true);
  };

  const handleRepetir = (p: Purchase) => {
    setEditingPurchaseId(null);
    loadPurchaseIntoForm(p, true);
  };

  const handleEditar = (p: Purchase) => {
    setEditingPurchaseId(p.id);
    loadPurchaseIntoForm(p, false);
  };

  const handleVer = (p: Purchase) => {
    setViewPurchase(p);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!form.supplierId) {
      setMessage({ type: 'err', text: 'Elegí un proveedor antes de guardar la compra.' });
      return;
    }
    const items = form.items
      .map((i) => ({
        productId: i.productId || undefined,
        productName: i.productName.trim() || undefined,
        barcode: i.barcode.trim() || undefined,
        categoryId: i.categoryId || undefined,
        qty: parseInt(i.qty, 10) || 0,
        unitCost: parseFloat(i.unitCost) || 0,
        price: (i.price !== '' && i.price != null) ? parseFloat(String(i.price)) : undefined,
        minStock: i.minStock ? parseInt(i.minStock, 10) : undefined,
        expiresAt: i.expiresAt || undefined,
      }))
      .filter((i) => i.qty > 0 && (i.productId || i.productName));
    if (items.length === 0) {
      setMessage({ type: 'err', text: 'Agregá al menos un ítem con cantidad y producto.' });
      return;
    }
    setSubmitting(true);
    try {
      if (editingPurchaseId) {
        await api(`/purchases/${editingPurchaseId}`, {
          method: 'PATCH',
          body: JSON.stringify({ supplierId: form.supplierId, items }),
        });
        setEditingPurchaseId(null);
      } else {
        await api('/purchases', {
          method: 'POST',
          body: JSON.stringify({ supplierId: form.supplierId, items }),
        });
      }
      setForm({ supplierId: '', items: [emptyItem()] });
      setShowNew(false);
      setMessage({ type: 'ok', text: editingPurchaseId ? 'Compra actualizada correctamente.' : 'Compra registrada. El stock y los costos ya fueron actualizados.' });
      await fetchPurchases();
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'No se pudo guardar la compra.' });
    } finally { setSubmitting(false); }
  };

  const purchaseTotal = useMemo(() => form.items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitCost) || 0), 0), [form.items]);
  const filteredPurchases = useMemo(() => {
    const term = (historyFilters.q ?? '').trim().toLocaleLowerCase('es');
    if (!term) return purchases;
    return purchases.filter((purchase) => purchase.supplier.name.toLocaleLowerCase('es').includes(term) || purchase.items.some((item) => item.product.name.toLocaleLowerCase('es').includes(term) || item.product.barcode?.toLocaleLowerCase('es').includes(term)));
  }, [purchases, historyFilters.q]);

  if (loading) return <Loader full />;

  return (
    <Container className="max-w-[1500px] space-y-6">
      <PageHeader
        title="Compras"
        subtitle="Registrá ingresos de mercadería y mantené costos y stock actualizados."
        actions={<div className="flex flex-wrap items-center gap-3">
          <Link
            href="/compras/arca"
            className="rounded-xl border border-hair bg-surface px-4 py-2.5 text-sm font-medium text-fg-muted hover:bg-raised hover:text-fg"
          >
            Facturas ARCA
          </Link>
          <Link
            href="/compras/ia"
            className="rounded-xl border border-hair bg-surface px-4 py-2.5 text-sm font-medium text-fg-muted hover:bg-raised hover:text-fg"
          >
            Compras con IA
          </Link>
        <button
          type="button"
          onClick={() => { setShowNew(!showNew); setEditingPurchaseId(null); }}
          className="btn-brand min-h-11 rounded-xl px-5 py-2.5 text-base font-semibold"
        >
          {showNew ? 'Cerrar' : 'Nueva compra'}
        </button>
        </div>}
      />

      {message && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.type === 'ok' ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-crit/30 bg-[var(--crit-soft)] text-crit'}`}>{message.text}</div>}

      {lowStock.length > 0 && (
        <details className="rounded-xl border border-warn/30 bg-[var(--warn-soft)] p-4">
          <summary className="cursor-pointer font-semibold text-warn">Stock bajo · {lowStock.length} productos sugeridos para reponer</summary>
          <ul className="mt-3 grid gap-2 text-sm text-fg-muted sm:grid-cols-2 lg:grid-cols-3">
            {lowStock.slice(0, 10).map((p) => (
              <li key={p.id} className="rounded-lg border border-warn/20 bg-surface/60 px-3 py-2"><span className="font-medium text-fg">{p.name}</span><span className="block font-mono text-xs text-warn">Stock {p.stock} · mínimo {p.minStock}</span></li>
            ))}
          </ul>
        </details>
      )}

      {showNew && (
        <form data-tour="compras-form" onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-hair-soft bg-surface p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 border-b border-hair-soft pb-5 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-bold text-fg">{editingPurchaseId ? 'Editar compra' : 'Nueva compra'}</h2><p className="mt-1 text-sm text-fg-muted">Seleccioná el proveedor y cargá la mercadería recibida.</p></div><Link href="/pedidos-proveedor" className="rounded-xl border border-hair bg-raised px-4 py-2.5 text-center text-sm font-medium text-fg-muted hover:bg-raised2 hover:text-fg">Traer de un pedido / catálogo proveedor →</Link></div>
          {editingPurchaseId && (
            <p className="text-warn text-sm">Editando compra existente. Al confirmar se actualizará la compra (se revierte el stock anterior y se aplican los nuevos ítems).</p>
          )}
          <div data-tour="compras-proveedor">
            <label className="block text-sm text-fg-muted mb-1">Proveedor *</label>
            <SupplierSelector
              value={form.supplierId}
              onChange={(id) => setForm((f) => ({ ...f, supplierId: id }))}
              suppliers={suppliers}
              onSuppliersChange={setSuppliers}
              placeholder="Seleccionar o crear proveedor"
            />
          </div>

          <div data-tour="compras-items">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-fg-muted">Ítems de la compra</label>
              <button type="button" onClick={addItem} className="text-brand text-sm hover:underline">
                + Agregar ítem
              </button>
            </div>
            <p className="text-xs text-fg-faint mb-3">
              Buscá por nombre o código de barras para elegir un producto existente, o escribí nombre/código para crear uno nuevo. Podés indicar vencimiento por ítem (mismo producto, distintos lotes).
            </p>

            <div className="space-y-4">
              {form.items.map((item, i) => (
                <div
                  key={i}
                  className="space-y-4 rounded-xl border border-hair-soft bg-raised/40 p-4 sm:p-5"
                >
                  <div className="flex justify-between items-center">
                    <div><span className="text-fg-muted text-sm">Ítem {i + 1}</span><p className="font-mono text-lg font-bold tabular-nums text-brand">Subtotal ${(Number(item.qty || 0) * Number(item.unitCost || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                    {form.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-crit text-sm hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="lg:col-span-2">
                      <label className="block text-xs text-fg-faint mb-0.5">Producto (buscar o escribir nombre) *</label>
                      <input
                        type="text"
                        value={item.productId ? item.productName : searchTerm[i] ?? item.productName}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (item.productId) setItem(i, { productId: '', productName: v, barcode: '' });
                          else setItem(i, { productName: v });
                          setSearchTerm((t) => ({ ...t, [i]: v }));
                          setHighlightedResultIndex((h) => ({ ...h, [i]: 0 }));
                        }}
                        onFocus={() => {
                          if (!item.productId) setSearchTerm((t) => ({ ...t, [i]: item.productName || '' }));
                          setHighlightedResultIndex((h) => ({ ...h, [i]: 0 }));
                        }}
                        onKeyDown={(e) => handleProductInputKeyDown(i, e)}
                        placeholder="Nombre o buscar..."
                        className="w-full rounded-xl border-2 border-hair bg-surface px-4 py-3 text-base text-fg outline-none focus-brand"
                      />
                      {!item.productId && (searchResults[i]?.length ?? 0) > 0 && (
                        <ul
                          className="relative z-20 mt-2 max-h-80 overflow-auto rounded-xl border border-hair bg-surface p-1 shadow-2xl"
                          role="listbox"
                          aria-label="Resultados de búsqueda"
                        >
                          {searchResults[i].map((p, idx) => {
                            const highlighted = Math.min(highlightedResultIndex[i] ?? 0, searchResults[i].length - 1);
                            return (
                            <li
                              key={p.id}
                              role="option"
                              aria-selected={idx === highlighted}
                              className={`grid cursor-pointer grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg p-2.5 text-sm text-fg ${idx === highlighted ? 'bg-brand-highlight ring-1 ring-[color:var(--brand-accent)]' : 'hover:bg-raised'}`}
                              onClick={() => selectProduct(i, p)}
                            >
                              {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-12 w-12 rounded-lg border border-hair-soft bg-white object-contain" /> : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-raised2 font-semibold text-fg-faint">{p.name.trim().slice(0, 2).toUpperCase()}</span>}
                              <span className="min-w-0"><strong className="block truncate font-semibold text-fg">{p.name}</strong><span className="block truncate font-mono text-[11px] text-fg-faint">{p.barcode || p.eanBox || p.supplierSku || p.supplierRef || p.externalId || 'Sin código'}{p.matched && p.matched !== 'nombre' ? ` · coincide por ${p.matched}` : ''}</span><span className="mt-1 block text-xs text-fg-muted">Stock <span className={`font-mono ${p.stock <= p.minStock ? 'text-warn' : 'text-ok'}`}>{p.stock}</span></span></span>
                              <span className="text-right"><strong className="block font-mono text-sm text-brand">${Number(p.price).toLocaleString('es-AR')}</strong><span className="block font-mono text-[11px] text-fg-faint">Costo {p.cost == null ? '—' : `$${Number(p.cost).toLocaleString('es-AR')}`}</span>{idx === highlighted && <span className="mt-1 inline-flex rounded-md border border-[color:var(--brand-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-brand">↵ Enter</span>}</span>
                            </li>
                          );})}
                        </ul>
                      )}
                      {searchingResults[i] && <div className="mt-2 flex items-center gap-2 text-sm text-fg-muted"><Spinner />Buscando productos…</div>}
                      {!searchingResults[i] && !item.productId && (searchTerm[i]?.trim().length ?? 0) >= 2 && (searchResults[i]?.length ?? 0) === 0 && <div className="mt-2 rounded-xl border border-hair-soft bg-surface p-3 text-sm text-fg-muted"><strong className="text-fg">No encontramos coincidencias.</strong><p className="mt-1 text-xs">Podés seguir completando la fila para crear “{item.productName || searchTerm[i]}” como producto nuevo.</p></div>}
                    </div>
                    <div>
                      <label className="block text-xs text-fg-faint mb-0.5" title="Para asociar a producto existente o nuevo">Código de barras</label>
                      <input
                        type="text"
                        value={item.barcode}
                        onChange={(e) => setItem(i, { barcode: e.target.value })}
                        placeholder="Opcional"
                        className="w-full rounded-xl border border-hair bg-surface px-3 py-2.5 font-mono text-sm text-fg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-fg-faint mb-0.5">Categoría (si creás producto nuevo)</label>
                      <CategorySelector
                        value={item.categoryId}
                        onChange={(id) => setItem(i, { categoryId: id })}
                        categories={categories}
                        onCategoriesChange={(arg) => setCategories((prev) => (typeof arg === 'function' ? arg(prev) : arg))}
                        placeholder="—"
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-fg-faint mb-0.5" title="Cantidad comprada">Cantidad *</label>
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => setItem(i, { qty: e.target.value })}
                        className="w-full rounded-xl border border-hair bg-surface px-3 py-2.5 font-mono text-fg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-fg-faint mb-0.5" title="Costo unitario de esta compra">Costo unitario *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitCost}
                        onChange={(e) => setItem(i, { unitCost: e.target.value })}
                        className="w-full rounded-xl border border-hair bg-surface px-3 py-2.5 font-mono text-fg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-fg-faint mb-0.5" title="Precio de venta (si creás producto)">Precio venta</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.price}
                        onChange={(e) => setItem(i, { price: e.target.value })}
                        placeholder="Opcional"
                        className="w-full rounded-xl border border-hair bg-surface px-3 py-2.5 font-mono text-fg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-fg-faint mb-0.5" title="Fecha de vencimiento de este lote">Vencimiento (lote)</label>
                      <input
                        type="date"
                        value={item.expiresAt}
                        onChange={(e) => setItem(i, { expiresAt: e.target.value })}
                        className="w-full rounded-xl border border-hair bg-surface px-3 py-2.5 font-mono text-fg"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--brand-accent)] bg-brand-highlight-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Total de la compra</span><p className="font-mono text-3xl font-bold tabular-nums text-brand">{purchaseTotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</p><p className="text-xs text-fg-faint">{form.items.length} {form.items.length === 1 ? 'ítem cargado' : 'ítems cargados'}</p></div><button
            type="submit"
            data-tour="compras-guardar"
            disabled={submitting || form.items.length === 0 || !form.supplierId}
            className="btn-brand min-h-12 rounded-xl px-6 py-3 text-base font-bold disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : editingPurchaseId ? 'Guardar cambios' : 'Confirmar compra'}
          </button></div>
        </form>
      )}

      <div data-tour="compras-history" className="overflow-hidden rounded-xl border border-hair-soft bg-surface">
        <div className="space-y-4 border-b border-hair-soft p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-fg">Historial de compras</h2><p className="text-sm text-fg-muted">Consultá, repetí o corregí compras anteriores.</p></div><div className="inline-flex rounded-xl border border-hair bg-raised p-1"><button type="button" onClick={() => setHistoryView('cards')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${historyView === 'cards' ? 'bg-surface text-fg shadow-sm' : 'text-fg-faint'}`}><Grid2X2 className="h-4 w-4" />Tarjetas</button><button type="button" onClick={() => setHistoryView('list')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${historyView === 'list' ? 'bg-surface text-fg shadow-sm' : 'text-fg-faint'}`}><List className="h-4 w-4" />Lista</button></div></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_220px_160px_160px]">
            <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" /><input value={historyFilters.q ?? ''} onChange={(e) => setHistoryFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Buscar proveedor o producto…" className="w-full rounded-xl border border-hair bg-raised py-2.5 pl-9 pr-3 text-sm text-fg" /></label>
            <select
              value={historyFilters.supplierId}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, supplierId: e.target.value }))}
              className="w-full rounded-xl border border-hair bg-raised px-3 py-2.5 text-sm text-fg"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={historyFilters.from}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, from: e.target.value }))}
              className="w-full rounded-xl border border-hair bg-raised px-3 py-2.5 font-mono text-sm text-fg"
              title="Desde (fecha)"
            />
            <input
              type="date"
              value={historyFilters.to}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, to: e.target.value }))}
              className="w-full rounded-xl border border-hair bg-raised px-3 py-2.5 font-mono text-sm text-fg"
              title="Hasta (fecha)"
            />
          </div>
        </div>
        <div className={`${historyView === 'cards' ? 'grid' : 'grid md:hidden'} gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3`}>
          {filteredPurchases.map((p) => <article key={p.id} className="flex flex-col rounded-xl border border-hair-soft bg-raised/50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-fg">{p.supplier.name}</h3><p className="mt-1 font-mono text-xs text-fg-faint">{new Date(p.createdAt).toLocaleString('es-AR')}</p></div><strong className="font-mono text-xl tabular-nums text-brand">{Number(p.total).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong></div><div className="mt-4 flex-1 space-y-2 border-t border-hair-soft pt-3">{p.items.map((it, index) => <div key={index} className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 text-fg-muted"><strong className="font-mono text-fg">{it.qty}×</strong> {it.product.name}{it.expiresAt && <span className="block text-xs text-fg-faint">Lote vence {new Date(it.expiresAt).toLocaleDateString('es-AR')}</span>}</span><span className="shrink-0 font-mono text-fg-faint">{(Number(it.unitCost) * it.qty).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span></div>)}</div><div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-hair-soft pt-3"><button type="button" onClick={() => handleRepetir(p)} className="rounded-lg border border-[color:var(--brand-accent)] px-3 py-2 text-sm font-medium text-brand">Repetir</button><button type="button" onClick={() => handleEditar(p)} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:text-fg">Editar</button><button type="button" onClick={() => handleVer(p)} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:text-fg">Ver</button></div></article>)}
          {!filteredPurchases.length && <p className="rounded-xl border border-hair-soft bg-raised p-8 text-center text-sm text-fg-faint sm:col-span-2 xl:col-span-3">No hay compras para estos filtros.</p>}
        </div>
        <div className={historyView === 'list' ? 'hidden overflow-x-auto md:block' : 'hidden'}>
          <table className="w-full text-sm">
            <thead className="bg-raised text-fg-muted">
              <tr>
                <th className="hidden text-left p-3 sm:table-cell" title="Fecha y hora en que se registró la compra">Fecha</th>
                <th className="text-left p-3" title="Proveedor del cual se compró">Proveedor</th>
                <th className="text-right p-3 font-mono tabular-nums" title="Monto total de la compra">Total</th>
                <th className="hidden text-left p-3 sm:table-cell" title="Resumen de productos y cantidades">Detalle</th>
                <th className="text-right p-3 font-mono tabular-nums">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair-soft">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-fg-faint text-center">
                    No hay compras en el período o con el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((p) => (
                  <tr key={p.id} className="hover:bg-raised">
                    <td className="hidden p-3 text-fg-muted sm:table-cell" title="Fecha de la compra">
                      {new Date(p.createdAt).toLocaleString('es-AR')}
                    </td>
                    <td className="p-3 text-fg">{p.supplier.name}</td>
                    <td className="p-3 text-right text-fg font-medium font-mono tabular-nums">
                      ${Number(p.total).toFixed(0)}
                    </td>
                    <td className="hidden p-3 text-fg-muted sm:table-cell">
                      <ul className="space-y-0.5">
                        {p.items.map((it, j) => (
                          <li key={j}>
                            {it.qty} × {it.product.name}
                            {it.expiresAt && (
                              <span className="text-fg-faint text-xs ml-1">
                                (vence {new Date(it.expiresAt).toLocaleDateString('es-AR')})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums">
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => handleRepetir(p)}
                          className="text-brand hover:underline text-sm"
                        >
                          Repetir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditar(p)}
                          className="text-fg-muted hover:underline text-sm"
                          title="Cargar con los mismos datos (incl. vencimientos) para modificar y guardar como nueva compra"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVer(p)}
                          className="text-fg-muted hover:underline text-sm"
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-hair-soft bg-raised px-4 py-2 font-mono text-xs text-fg-faint">{filteredPurchases.length} compras visibles</div>
      </div>

      {viewPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setViewPurchase(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-hair bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-hair-soft flex justify-between items-center">
              <h3 className="text-lg font-medium text-fg">Detalle de compra</h3>
              <button type="button" onClick={() => setViewPurchase(null)} className="text-fg-muted hover:text-fg">Cerrar</button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-fg-muted text-sm">
                {new Date(viewPurchase.createdAt).toLocaleString('es-AR')} · {viewPurchase.supplier.name}
              </p>
              <div className="rounded-xl border border-[color:var(--brand-accent)] bg-brand-highlight-soft p-4"><span className="text-xs uppercase tracking-wide text-fg-muted">Total de la compra</span><p className="font-mono text-3xl font-bold tabular-nums text-brand">{Number(viewPurchase.total).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</p></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-fg-faint border-b border-hair-soft">
                      <th className="py-2 pr-3">Producto</th>
                      <th className="py-2 pr-3 text-right font-mono tabular-nums">Cant.</th>
                      <th className="py-2 pr-3 text-right font-mono tabular-nums">Costo unit.</th>
                      <th className="py-2 pr-3 text-right font-mono tabular-nums">Subtotal</th>
                      <th className="py-2">Vencimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewPurchase.items.map((it, j) => (
                      <tr key={j} className="border-b border-hair-soft/50">
                        <td className="py-2 pr-3 text-fg">{it.product.name}</td>
                        <td className="py-2 pr-3 text-right text-fg-muted font-mono tabular-nums">{it.qty}</td>
                        <td className="py-2 pr-3 text-right text-fg-muted font-mono tabular-nums">${Number(it.unitCost).toFixed(0)}</td>
                        <td className="py-2 pr-3 text-right font-mono font-semibold tabular-nums text-fg">{(Number(it.unitCost) * it.qty).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                        <td className="py-2 text-fg-muted">
                          {it.expiresAt ? new Date(it.expiresAt).toLocaleDateString('es-AR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
