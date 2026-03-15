'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CategorySelector } from '@/components/CategorySelector';

type Category = { id: string; name: string };

export default function NuevoProductoPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    barcode: '',
    categoryId: '',
    cost: '',
    price: '',
    stock: '0',
    minStock: '0',
    brand: '',
    stockControl: true,
    expiresAt: '',
  });

  useEffect(() => {
    api<Category[]>('/business/categories')
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          barcode: form.barcode || undefined,
          categoryId: form.categoryId || undefined,
          cost: form.cost ? parseFloat(form.cost) : undefined,
          price: parseFloat(form.price) || 0,
          stock: parseInt(form.stock, 10) || 0,
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
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/productos" className="text-slate-400 hover:text-white">← Productos</Link>
        <h1 className="text-2xl font-bold text-white">Nuevo producto</h1>
      </div>

      <form data-tour="nuevo-producto-form" onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <div data-tour="nuevo-producto-nombre">
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
          <div data-tour="nuevo-producto-barcode">
            <label className="block text-sm text-slate-400 mb-1">Código de barras</label>
            <input
              type="text"
              value={form.barcode}
              onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            />
          </div>
          <div data-tour="nuevo-producto-categoria">
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
        <div data-tour="nuevo-producto-costo-precio" className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Costo</label>
            <input
              type="number"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Precio venta *</label>
            <input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              required
            />
          </div>
        </div>
        <div data-tour="nuevo-producto-stock" className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Stock inicial</label>
            <input
              type="number"
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            />
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
        </div>
        <div data-tour="nuevo-producto-vencimiento">
          <label className="block text-sm text-slate-400 mb-1">Vencimiento (opcional)</label>
          <input
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
          <p className="text-slate-500 text-xs mt-1">Para lácteos, snacks y productos con fecha de vencimiento</p>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Marca</label>
          <input
            type="text"
            value={form.brand}
            onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          />
        </div>
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={form.stockControl}
            onChange={(e) => setForm((f) => ({ ...f, stockControl: e.target.checked }))}
          />
          Controlar stock
        </label>
        <div data-tour="nuevo-producto-guardar" className="flex gap-2 pt-4">
          <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-sky-600 text-white disabled:opacity-50">
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
          <Link href="/productos" className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
