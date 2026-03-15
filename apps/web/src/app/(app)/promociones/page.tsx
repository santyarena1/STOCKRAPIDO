'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

type ProductItem = { productId: string; qty: number };

type Promo = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  value: string | number;
  buyQty: number | null;
  getQtyFree: number | null;
  minPurchase: string | number | null;
  productIds: string | null;
  productItems: string | null;
  categoryIds: string | null;
  promoCode: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  createdAt: string;
};

type Product = { id: string; name: string; price?: string | number; categoryId?: string | null };
type Category = { id: string; name: string };

function ProductSearchRow({ product, onAdd }: { product: Product; onAdd: (qty: number) => void }) {
  const [qty, setQty] = useState(1);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-slate-700/50">
      <span className="text-slate-200 text-sm flex-1 min-w-0 truncate">{product.name}</span>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-14 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-100 text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onAdd(qty)}
          className="px-2 py-1 rounded bg-sky-600 text-white text-sm whitespace-nowrap"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

const PROMO_TYPES = [
  { id: 'percent', label: 'Porcentaje de descuento', desc: 'Ej: 15 = 15% off' },
  { id: 'fixed', label: 'Monto fijo de descuento', desc: 'Ej: 500 = $500 off' },
  { id: 'bogo', label: 'Llevá más, pagá menos (BOGO)', desc: 'Comprá N, llevá M gratis' },
  { id: 'precio_fijo', label: 'Precio fijo del combo', desc: 'Fijá el precio total del combo' },
];

export default function PromocionesPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'percent' as 'percent' | 'fixed' | 'bogo' | 'precio_fijo',
    value: '',
    buyQty: '',
    getQtyFree: '',
    minPurchase: '',
    productItems: [] as ProductItem[],
    categoryIds: [] as string[],
    promoCode: '',
    validFrom: '',
    validTo: '',
    isActive: true,
  });
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchPromos = useCallback(async () => {
    const params = filterActive ? { activeOnly: 'true' } : {};
    const data = await api<Promo[]>('/promos', { params }).catch(() => []);
    setPromos(Array.isArray(data) ? data : []);
  }, [filterActive]);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      fetchPromos(),
      api<Product[]>('/products').catch(() => []),
      api<Category[]>('/business/categories').catch(() => []),
    ]).then(([, prodRes, catRes]) => {
      setProducts(prodRes.status === 'fulfilled' && Array.isArray(prodRes.value) ? prodRes.value : []);
      setCategories(catRes.status === 'fulfilled' && Array.isArray(catRes.value) ? catRes.value : []);
    }).finally(() => setLoading(false));
  }, [fetchPromos]);

  useEffect(() => {
    if (!productSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api<Product[]>('/products/search', { params: { q: productSearch.trim(), limit: '15' } });
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [productSearch]);

  const getProductName = (productId: string) =>
    products.find((p) => p.id === productId)?.name ?? productId.slice(-8);

  const loadPromoIntoForm = (p: Promo) => {
    const items = p.productItems ? (JSON.parse(p.productItems) as ProductItem[]) : [];
    const legacyIds = p.productIds ? (JSON.parse(p.productIds) as string[]) : [];
    const productItems = items.length ? items : legacyIds.map((id) => ({ productId: id, qty: 1 }));
    setForm({
      name: p.name,
      description: p.description ?? '',
      type: p.type as 'percent' | 'fixed' | 'bogo' | 'precio_fijo',
      value: String(p.value ?? ''),
      buyQty: String(p.buyQty ?? ''),
      getQtyFree: String(p.getQtyFree ?? ''),
      minPurchase: p.minPurchase != null ? String(p.minPurchase) : '',
      productItems,
      categoryIds: p.categoryIds ? (JSON.parse(p.categoryIds) as string[]) : [],
      promoCode: p.promoCode ?? '',
      validFrom: p.validFrom ? p.validFrom.slice(0, 10) : '',
      validTo: p.validTo ? p.validTo.slice(0, 10) : '',
      isActive: p.isActive,
    });
  };

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      type: 'percent',
      value: '',
      buyQty: '',
      getQtyFree: '',
      minPurchase: '',
      productItems: [],
      categoryIds: [],
      promoCode: '',
      validFrom: '',
      validTo: '',
      isActive: true,
    });
    setProductSearch('');
    setSearchResults([]);
    setEditingId(null);
  };

  const addProductItem = (product: Product, qty = 1) => {
    const q = Math.max(1, qty);
    setForm((f) => {
      const existing = f.productItems.find((i) => i.productId === product.id);
      if (existing) {
        return {
          ...f,
          productItems: f.productItems.map((i) =>
            i.productId === product.id ? { ...i, qty: i.qty + q } : i
          ),
        };
      }
      return { ...f, productItems: [...f.productItems, { productId: product.id, qty: q }] };
    });
    setProductSearch('');
    setSearchResults([]);
  };

  const removeProductItem = (productId: string) => {
    setForm((f) => ({ ...f, productItems: f.productItems.filter((i) => i.productId !== productId) }));
  };

  const updateProductItemQty = (productId: string, qty: number) => {
    const q = Math.max(1, Math.floor(qty) || 1);
    setForm((f) => ({
      ...f,
      productItems: f.productItems.map((i) => (i.productId === productId ? { ...i, qty: q } : i)),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.type === 'precio_fijo' && form.productItems.length === 0) {
      alert('Para precio fijo debés agregar al menos un producto al combo.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      value: parseFloat(form.value) || 0,
      buyQty: form.type === 'bogo' ? parseInt(form.buyQty, 10) || undefined : undefined,
      getQtyFree: form.type === 'bogo' ? parseInt(form.getQtyFree, 10) || undefined : undefined,
      minPurchase: form.minPurchase ? parseFloat(form.minPurchase) : undefined,
      productItems: form.productItems.length ? form.productItems : undefined,
      categoryIds: form.categoryIds.length ? form.categoryIds : undefined,
      promoCode: form.promoCode.trim() || undefined,
      validFrom: form.validFrom || undefined,
      validTo: form.validTo || undefined,
      isActive: form.isActive,
    };
    try {
      if (editingId) {
        await api(`/promos/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/promos', { method: 'POST', body: JSON.stringify(payload) });
      }
      resetForm();
      setShowForm(false);
      fetchPromos();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleEdit = (p: Promo) => {
    loadPromoIntoForm(p);
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta promoción?')) return;
    try {
      await api(`/promos/${id}`, { method: 'DELETE' });
      fetchPromos();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const toggleCategory = (id: string) => {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((x) => x !== id) : [...f.categoryIds, id],
    }));
  };

  const formatPromoValue = (p: Promo) => {
    if (p.type === 'percent') return `${p.value}% off`;
    if (p.type === 'fixed') return `$${Number(p.value).toFixed(0)} off`;
    if (p.type === 'precio_fijo') return `$${Number(p.value).toFixed(0)} (combo)`;
    if (p.type === 'bogo') {
      const buy = p.buyQty ?? 0;
      const free = p.getQtyFree ?? 0;
      return free === 1 && buy === 2 ? '2x1' : `Comprá ${buy} llevá ${buy + free} (${free} gratis)`;
    }
    return String(p.value);
  };

  return (
    <div className="p-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">Promociones y ofertas</h1>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={filterActive}
              onChange={(e) => setFilterActive(e.target.checked)}
              className="rounded"
            />
            Solo activas
          </label>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            data-tour="promos-nueva"
            className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium"
          >
            Nueva promoción
          </button>
        </div>
      </div>

      {showForm && (
        <form data-tour="promos-form" onSubmit={handleSubmit} className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 mb-6 space-y-4">
          <h2 className="text-lg font-bold text-white">{editingId ? 'Editar promoción' : 'Nueva promoción'}</h2>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: 2x1 en gaseosas"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Opcional"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Tipo de oferta *</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'percent' | 'fixed' | 'bogo' }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            >
              {PROMO_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {form.type === 'bogo' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Comprar (cantidad)</label>
                <input
                  type="number"
                  min={1}
                  value={form.buyQty}
                  onChange={(e) => setForm((f) => ({ ...f, buyQty: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Llevar gratis (cantidad)</label>
                <input
                  type="number"
                  min={0}
                  value={form.getQtyFree}
                  onChange={(e) => setForm((f) => ({ ...f, getQtyFree: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                {form.type === 'precio_fijo'
                  ? 'Precio total del combo ($)'
                  : form.type === 'percent'
                    ? 'Porcentaje de descuento'
                    : 'Monto de descuento'}
              </label>
              <input
                type="number"
                min={0}
                step={form.type === 'percent' ? 1 : 0.01}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={form.type === 'precio_fijo' ? '1500' : form.type === 'percent' ? '15' : '500'}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                required={form.type !== 'bogo'}
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">Compra mínima ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.minPurchase}
              onChange={(e) => setForm((f) => ({ ...f, minPurchase: e.target.value }))}
              placeholder="0 = sin mínimo"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Código de promoción (opcional)</label>
            <input
              type="text"
              value={form.promoCode}
              onChange={(e) => setForm((f) => ({ ...f, promoCode: e.target.value }))}
              placeholder="Ej: VERANO20"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Válida desde</label>
              <input
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Válida hasta</label>
              <input
                type="date"
                value={form.validTo}
                onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              {form.type === 'precio_fijo' ? 'Productos del combo (requerido)' : 'Productos del combo (vacío = todos)'}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto por nombre o código..."
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                />
              </div>
              {productSearch && (
                <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-2 max-h-40 overflow-auto">
                  {searching ? (
                    <p className="text-slate-500 text-sm">Buscando...</p>
                  ) : searchResults.length === 0 ? (
                    <p className="text-slate-500 text-sm">Sin resultados</p>
                  ) : (
                    <div className="space-y-1">
                      {searchResults.map((p) => (
                        <ProductSearchRow
                          key={p.id}
                          product={p}
                          onAdd={(qty) => addProductItem(p, qty)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {form.productItems.length > 0 && (
                <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-2 space-y-2">
                  <p className="text-slate-400 text-xs">Productos en el combo:</p>
                  {form.productItems.map((item) => (
                    <div key={item.productId} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-slate-700/50">
                      <span className="text-slate-200 text-sm">{getProductName(item.productId)}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={(e) => updateProductItemQty(item.productId, e.target.valueAsNumber)}
                          onBlur={(e) => updateProductItemQty(item.productId, e.target.valueAsNumber)}
                          className="w-14 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-100 text-sm text-center"
                        />
                        <button
                          type="button"
                          onClick={() => removeProductItem(item.productId)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Categorías (vacío = todas)</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-sm cursor-pointer hover:bg-slate-600">
                  <input
                    type="checkbox"
                    checked={form.categoryIds.includes(c.id)}
                    onChange={() => toggleCategory(c.id)}
                    className="rounded"
                  />
                  {c.name}
                </label>
              ))}
              {categories.length === 0 && <span className="text-slate-500 text-sm">Sin categorías</span>}
            </div>
          </div>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="rounded"
            />
            Promoción activa
          </label>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium">
              {editingId ? 'Guardar cambios' : 'Crear promoción'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div data-tour="promos-list" className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Tipo</th>
                <th className="text-left p-3">Descuento / Oferta</th>
                <th className="text-left p-3">Código</th>
                <th className="text-left p-3">Vigencia</th>
                <th className="text-left p-3">Estado</th>
                <th className="text-right p-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {promos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-slate-500 text-center">
                    No hay promociones. Creá una para empezar.
                  </td>
                </tr>
              ) : (
                promos.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/50">
                    <td className="p-3 text-slate-200">{p.name}</td>
                    <td className="p-3 text-slate-400 capitalize">{p.type}</td>
                    <td className="p-3 text-sky-400 font-medium">{formatPromoValue(p)}</td>
                    <td className="p-3 text-slate-400 font-mono">{p.promoCode || '—'}</td>
                    <td className="p-3 text-slate-400 text-xs">
                      {p.validFrom || p.validTo
                        ? `${p.validFrom ? new Date(p.validFrom).toLocaleDateString('es-AR') : '—'} a ${p.validTo ? new Date(p.validTo).toLocaleDateString('es-AR') : '—'}`
                        : 'Sin límite'}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${p.isActive ? 'bg-green-600/30 text-green-400' : 'bg-slate-600 text-slate-400'}`}>
                        {p.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button type="button" onClick={() => handleEdit(p)} className="text-sky-400 hover:underline mr-2">Editar</button>
                      <button type="button" onClick={() => handleDelete(p.id)} className="text-red-400 hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
