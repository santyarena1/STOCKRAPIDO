'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CategorySelector } from '@/components/CategorySelector';
import { STOCK_REASONS } from '@/components/StockAdjustReasons';

type ProductBatch = {
  id: string;
  qty: number;
  unitCost: string | number;
  expiresAt: string | null;
  createdAt: string;
};
type Product = {
  id: string;
  name: string;
  barcode?: string;
  price: string | number;
  cost?: string | number;
  stock: number;
  minStock: number;
  category?: { id: string; name: string };
  brand?: string;
  stockControl: boolean;
  expiresAt?: string | null;
  batches?: ProductBatch[];
};
type Category = { id: string; name: string };
type StockMove = { id: string; qty: number; reason: string; reference?: string; createdAt: string };

export default function EditarProductoPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', barcode: '', categoryId: '', cost: '', price: '', minStock: '', brand: '', stockControl: true, expiresAt: '' });
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => {
    Promise.allSettled([
      api<Product | null>(`/products/${id}`),
      api<Category[]>('/business/categories'),
      api<StockMove[]>(`/products/${id}/stock-moves`),
    ]).then(([pRes, catsRes, mRes]) => {
      const p = pRes.status === 'fulfilled' ? pRes.value : null;
      const cats = catsRes.status === 'fulfilled' && Array.isArray(catsRes.value) ? catsRes.value : [];
      const m = mRes.status === 'fulfilled' && Array.isArray(mRes.value) ? mRes.value : [];
      if (p) {
        setProduct(p);
        setForm({
          name: p.name,
          barcode: p.barcode || '',
          categoryId: p.category?.id || '',
          cost: p.cost ? String(p.cost) : '',
          price: String(p.price),
          minStock: String(p.minStock),
          brand: p.brand || '',
          stockControl: p.stockControl,
          expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : '',
        });
      }
      setCategories(cats);
      setMoves(m);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          barcode: form.barcode || undefined,
          categoryId: form.categoryId || undefined,
          cost: form.cost ? parseFloat(form.cost) : undefined,
          price: parseFloat(form.price) || 0,
          minStock: parseInt(form.minStock, 10) || 0,
          brand: form.brand || undefined,
          stockControl: form.stockControl,
          expiresAt: form.expiresAt || undefined,
        }),
      });
      router.push('/productos');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(adjustQty, 10);
    if (!qty || !adjustReason.trim()) return;
    try {
      const updated = await api<Product>(`/products/${id}/stock`, {
        method: 'POST',
        body: JSON.stringify({ qty, reason: adjustReason }),
      });
      setProduct(updated);
      setAdjustQty('');
      setAdjustReason('');
      const m = await api<StockMove[]>(`/products/${id}/stock-moves`);
      setMoves(m);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;
  if (!product) return (
    <div className="p-6">
      <Link href="/productos" className="text-sky-400 hover:underline">← Productos</Link>
      <p className="mt-4 text-slate-400">Producto no encontrado</p>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/productos" className="text-slate-400 hover:text-white">← Productos</Link>
        <h1 className="text-2xl font-bold text-white">{product.name}</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <form data-tour="editar-producto-form" onSubmit={handleSave} className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nombre *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Código de barras</label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Categoría</label>
              <CategorySelector
                value={form.categoryId}
                onChange={(id) => setForm((f) => ({ ...f, categoryId: id }))}
                categories={categories}
                onCategoriesChange={setCategories}
                placeholder="Sin categoría"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Costo (referencia)</label>
              <input
                type="number"
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              />
              <p className="text-xs text-slate-500 mt-0.5">Se actualiza con la última compra</p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Precio venta * (referencia)</label>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                required
              />
              <p className="text-xs text-slate-500 mt-0.5">Se actualiza con la última compra</p>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Stock mínimo</label>
            <input
              type="number"
              value={form.minStock}
              onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Vencimiento (referencia)</label>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            />
            <p className="text-xs text-slate-500 mt-0.5">El vencimiento por lote se define en cada compra (ver Lotes abajo)</p>
          </div>
          <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
            <input type="checkbox" checked={form.stockControl} onChange={(e) => setForm((f) => ({ ...f, stockControl: e.target.checked }))} />
            Controlar stock
          </label>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-sky-600 text-white disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </form>

        <div className="space-y-6">
          {product.expiresAt && (
            <div className={`rounded-lg border p-4 ${new Date(product.expiresAt) < new Date() ? 'border-red-700/50 bg-red-900/20' : 'border-amber-700/50 bg-amber-900/20'}`}>
              <h3 className="font-medium text-amber-400 mb-1">Vencimiento</h3>
              <p className="text-slate-200">
                {new Date(product.expiresAt).toLocaleDateString('es-AR')}
                {new Date(product.expiresAt) < new Date() ? (
                  <span className="text-red-400 ml-2">· Vencido</span>
                ) : (
                  <span className="text-amber-400 ml-2">
                    · Vence en {Math.ceil((new Date(product.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))} días
                  </span>
                )}
              </p>
            </div>
          )}
          <div data-tour="editar-producto-stock" className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="font-medium text-slate-200 mb-1">Stock actual</h3>
            <p className="text-2xl font-bold text-white mb-4">{product.stock} unidades</p>
            <h4 className="text-sm font-medium text-slate-300 mb-2">Lotes</h4>
            <p className="text-xs text-slate-500 mb-3">
              Mismo producto puede tener distintos vencimientos o costos por compra. Acá se ve cada lote (cantidad, costo, vencimiento). Se descuentan por orden de vencimiento al vender.
            </p>
            <div className="overflow-x-auto rounded border border-slate-600 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 bg-slate-800/80 border-b border-slate-600">
                    <th className="px-3 py-2">Cantidad</th>
                    <th className="px-3 py-2">Costo unit.</th>
                    <th className="px-3 py-2">Vencimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {(product.batches?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-slate-500 text-center text-sm">
                        Sin lotes. Los lotes se crean al cargar compras (desde Compras) o al hacer un ajuste positivo de stock.
                      </td>
                    </tr>
                  ) : (
                    (product.batches ?? []).map((b) => (
                      <tr key={b.id} className="border-b border-slate-700/50">
                        <td className="px-3 py-2 text-slate-200">{b.qty}</td>
                        <td className="px-3 py-2 text-slate-300">${Number(b.unitCost).toFixed(0)}</td>
                        <td className="px-3 py-2 text-slate-400">
                          {b.expiresAt
                            ? new Date(b.expiresAt).toLocaleDateString('es-AR')
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <form data-tour="editar-producto-ajuste" onSubmit={handleAdjust} className="space-y-2">
              <div className="flex gap-2 items-end">
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Cantidad (+/-)</label>
                  <input
                    type="number"
                    placeholder="Ej: 10 o -5"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    className="w-24 px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-0.5">Motivo</label>
                  <select
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-slate-100"
                  >
                    <option value="">Elegir motivo...</option>
                    {STOCK_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="px-3 py-1.5 rounded bg-sky-600 text-white text-sm">Ajustar</button>
              </div>
            </form>
          </div>
          <div data-tour="editar-producto-movimientos" className="rounded-lg border border-slate-700 overflow-hidden">
            <h3 className="px-4 py-2 bg-slate-800 text-slate-200 font-medium">Historial de movimientos</h3>
            <p className="px-4 py-1 text-slate-500 text-xs">Entradas y salidas de stock con fecha y motivo</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-700">
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Cantidad</th>
                    <th className="px-4 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-4 text-slate-500 text-center">Sin movimientos</td></tr>
                  ) : (
                    (Array.isArray(moves) ? moves : []).map((m) => (
                      <tr key={m.id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-slate-400">{new Date(m.createdAt).toLocaleString('es-AR')}</td>
                        <td className={`px-4 py-2 font-medium ${m.qty >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {m.qty >= 0 ? '+' : ''}{m.qty}
                        </td>
                        <td className="px-4 py-2 text-slate-300">{STOCK_REASONS.find((r) => r.value === m.reason)?.label ?? m.reason}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
