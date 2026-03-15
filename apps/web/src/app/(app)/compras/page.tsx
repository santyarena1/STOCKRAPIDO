'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { SupplierSelector } from '@/components/SupplierSelector';
import { CategorySelector } from '@/components/CategorySelector';

type Product = {
  id: string;
  name: string;
  barcode?: string | null;
  stock: number;
  minStock: number;
  price: string | number;
  cost?: string | number;
  category?: { id: string; name: string };
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
  const [historyFilters, setHistoryFilters] = useState({
    supplierId: '',
    from: '',
    to: '',
  });
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [highlightedResultIndex, setHighlightedResultIndex] = useState<Record<number, number>>({});

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
    fetchPurchases();
  }, [fetchPurchases]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    Object.entries(searchTerm).forEach(([idxStr, term]) => {
      const idx = Number(idxStr);
      if (!term.trim()) {
        setSearchResults((r) => ({ ...r, [idx]: [] }));
        return;
      }
      const t = setTimeout(async () => {
        const data = await api<Product[]>('/products/search', { params: { q: term, limit: '10' } }).catch(() => []);
        setSearchResults((r) => ({ ...r, [idx]: Array.isArray(data) ? data : [] }));
      }, 300);
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
      setHighlightedResultIndex((h) => ({ ...h, [itemIndex]: 0 }));
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
    if (!form.supplierId) {
      alert('Elegí un proveedor.');
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
      alert('Agregá al menos un ítem con cantidad y producto (nombre o selección).');
      return;
    }
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
      fetchPurchases();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Compras</h1>
        <button
          type="button"
          onClick={() => { setShowNew(!showNew); setEditingPurchaseId(null); }}
          className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium"
        >
          {showNew ? 'Cerrar' : 'Nueva compra'}
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 p-4 mb-6">
          <h3 className="font-medium text-amber-400 mb-2">Productos con stock bajo (sugeridos)</h3>
          <ul className="text-sm text-slate-300 space-y-1">
            {lowStock.slice(0, 10).map((p) => (
              <li key={p.id}>{p.name} – Stock: {p.stock} (mín: {p.minStock})</li>
            ))}
          </ul>
        </div>
      )}

      {showNew && (
        <form data-tour="compras-form" onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-slate-700 bg-slate-800/50 p-6 mb-8">
          {editingPurchaseId && (
            <p className="text-amber-400 text-sm">Editando compra existente. Al confirmar se actualizará la compra (se revierte el stock anterior y se aplican los nuevos ítems).</p>
          )}
          <div data-tour="compras-proveedor">
            <label className="block text-sm text-slate-400 mb-1">Proveedor *</label>
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
              <label className="text-sm text-slate-400">Ítems de la compra</label>
              <button type="button" onClick={addItem} className="text-sky-400 text-sm hover:underline">
                + Agregar ítem
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Buscá por nombre o código de barras para elegir un producto existente, o escribí nombre/código para crear uno nuevo. Podés indicar vencimiento por ítem (mismo producto, distintos lotes).
            </p>

            <div className="overflow-x-auto space-y-4">
              {form.items.map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-600 bg-slate-800/30 p-4 space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Ítem {i + 1}</span>
                    {form.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-red-400 text-sm hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="lg:col-span-2">
                      <label className="block text-xs text-slate-500 mb-0.5">Producto (buscar o escribir nombre) *</label>
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
                        className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100 text-sm"
                      />
                      {!item.productId && (searchResults[i]?.length ?? 0) > 0 && (
                        <ul
                          className="mt-1 border border-slate-600 rounded bg-slate-800 max-h-32 overflow-auto"
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
                              className={`px-2 py-1.5 text-sm text-slate-200 cursor-pointer flex justify-between ${idx === highlighted ? 'bg-sky-600/30 ring-1 ring-sky-500/50' : 'hover:bg-slate-700'}`}
                              onClick={() => selectProduct(i, p)}
                            >
                              <span>{p.name}</span>
                              {p.barcode && <span className="text-slate-500 text-xs">{p.barcode}</span>}
                            </li>
                          );})}
                        </ul>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5" title="Para asociar a producto existente o nuevo">Código de barras</label>
                      <input
                        type="text"
                        value={item.barcode}
                        onChange={(e) => setItem(i, { barcode: e.target.value })}
                        placeholder="Opcional"
                        className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5">Categoría (si creás producto nuevo)</label>
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
                      <label className="block text-xs text-slate-500 mb-0.5" title="Cantidad comprada">Cantidad *</label>
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => setItem(i, { qty: e.target.value })}
                        className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5" title="Costo unitario de esta compra">Costo unitario *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitCost}
                        onChange={(e) => setItem(i, { unitCost: e.target.value })}
                        className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5" title="Precio de venta (si creás producto)">Precio venta</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.price}
                        onChange={(e) => setItem(i, { price: e.target.value })}
                        placeholder="Opcional"
                        className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5" title="Fecha de vencimiento de este lote">Vencimiento (lote)</label>
                      <input
                        type="date"
                        value={item.expiresAt}
                        onChange={(e) => setItem(i, { expiresAt: e.target.value })}
                        className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            type="submit"
            data-tour="compras-guardar"
            disabled={form.items.length === 0 || !form.supplierId}
            className="px-4 py-2 rounded-lg bg-sky-600 text-white disabled:opacity-50"
          >
            {editingPurchaseId ? 'Guardar cambios' : 'Confirmar compra'}
          </button>
        </form>
      )}

      <div data-tour="compras-history" className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-slate-200">Historial de compras</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={historyFilters.supplierId}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, supplierId: e.target.value }))}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
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
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
              title="Desde (fecha)"
            />
            <span className="text-slate-500">a</span>
            <input
              type="date"
              value={historyFilters.to}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, to: e.target.value }))}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
              title="Hasta (fecha)"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="text-left p-3" title="Fecha y hora en que se registró la compra">Fecha</th>
                <th className="text-left p-3" title="Proveedor del cual se compró">Proveedor</th>
                <th className="text-right p-3" title="Monto total de la compra">Total</th>
                <th className="text-left p-3" title="Resumen de productos y cantidades">Detalle</th>
                <th className="text-right p-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-slate-500 text-center">
                    No hay compras en el período o con el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/50">
                    <td className="p-3 text-slate-400" title="Fecha de la compra">
                      {new Date(p.createdAt).toLocaleString('es-AR')}
                    </td>
                    <td className="p-3 text-slate-200">{p.supplier.name}</td>
                    <td className="p-3 text-right text-slate-200 font-medium">
                      ${Number(p.total).toFixed(0)}
                    </td>
                    <td className="p-3 text-slate-400">
                      <ul className="space-y-0.5">
                        {p.items.map((it, j) => (
                          <li key={j}>
                            {it.qty} × {it.product.name}
                            {it.expiresAt && (
                              <span className="text-slate-500 text-xs ml-1">
                                (vence {new Date(it.expiresAt).toLocaleDateString('es-AR')})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => handleRepetir(p)}
                          className="text-sky-400 hover:underline text-sm"
                        >
                          Repetir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditar(p)}
                          className="text-slate-400 hover:underline text-sm"
                          title="Cargar con los mismos datos (incl. vencimientos) para modificar y guardar como nueva compra"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVer(p)}
                          className="text-slate-400 hover:underline text-sm"
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
        <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/30 text-xs text-slate-500">
          <strong>Columnas:</strong> Fecha = cuándo se cargó la compra · Proveedor = quién vendió · Total = monto pagado · Detalle = productos y cantidades (con vencimiento si se cargó). <strong>Repetir</strong> = cargar misma compra como nueva para cambiar vencimientos/costos. <strong>Editar</strong> = igual, cargar para modificar y guardar. <strong>Ver</strong> = ver detalle.
        </div>
      </div>

      {viewPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setViewPurchase(null)}>
          <div className="rounded-lg border border-slate-600 bg-slate-800 max-w-lg w-full max-h-[90vh] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-medium text-white">Detalle de compra</h3>
              <button type="button" onClick={() => setViewPurchase(null)} className="text-slate-400 hover:text-white">Cerrar</button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-slate-400 text-sm">
                {new Date(viewPurchase.createdAt).toLocaleString('es-AR')} · {viewPurchase.supplier.name}
              </p>
              <p className="text-xl font-bold text-white">Total: ${Number(viewPurchase.total).toFixed(0)}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-600">
                      <th className="py-2 pr-3">Producto</th>
                      <th className="py-2 pr-3 text-right">Cant.</th>
                      <th className="py-2 pr-3 text-right">Costo unit.</th>
                      <th className="py-2">Vencimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewPurchase.items.map((it, j) => (
                      <tr key={j} className="border-b border-slate-700/50">
                        <td className="py-2 pr-3 text-slate-200">{it.product.name}</td>
                        <td className="py-2 pr-3 text-right text-slate-300">{it.qty}</td>
                        <td className="py-2 pr-3 text-right text-slate-300">${Number(it.unitCost).toFixed(0)}</td>
                        <td className="py-2 text-slate-400">
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
    </div>
  );
}
