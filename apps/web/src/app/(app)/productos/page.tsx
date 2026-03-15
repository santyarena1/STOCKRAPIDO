'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Product = {
  id: string;
  name: string;
  barcode?: string;
  price: string | number;
  cost?: string | number;
  stock: number;
  minStock: number;
  category?: { name: string };
  expiresAt?: string | null;
};
type Category = { id: string; name: string };

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryId, setCategoryId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.allSettled([
      api<Product[]>('/products', { params: { categoryId: categoryId || undefined, lowStock: lowStock ? 'true' : undefined } }),
      api<Category[]>('/business/categories'),
    ]).then(([prodsRes, catsRes]) => {
      setProducts(prodsRes.status === 'fulfilled' && Array.isArray(prodsRes.value) ? prodsRes.value : []);
      setCategories(catsRes.status === 'fulfilled' && Array.isArray(catsRes.value) ? catsRes.value : []);
    }).finally(() => setLoading(false));
  }, [categoryId, lowStock]);

  const DAYS_VENCER = 30;
  const now = new Date();
  const limitVencer = new Date(now.getTime() + DAYS_VENCER * 24 * 60 * 60 * 1000);

  const list = Array.isArray(products) ? products : [];
  let filtered = search.trim()
    ? list.filter((p) => p?.name?.toLowerCase().includes(search.toLowerCase()) || (p?.barcode && p.barcode.includes(search)))
    : list;
  if (expiringSoon) {
    filtered = filtered.filter((p) => p?.expiresAt && new Date(p.expiresAt) <= limitVencer && new Date(p.expiresAt) >= now);
  }

  function diasHastaVencimiento(expiresAt: string | null | undefined): number | null {
    if (!expiresAt) return null;
    const d = new Date(expiresAt);
    return Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Productos</h1>
        <Link
          href="/productos/nuevo"
          data-tour="productos-nuevo"
          className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-500"
        >
          Nuevo producto
        </Link>
      </div>

      <div data-tour="productos-filters" className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 w-64"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
        >
          <option value="">Todas las categorías</option>
          {(Array.isArray(categories) ? categories : []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
          <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />
          Stock bajo
        </label>
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
          <input type="checkbox" checked={expiringSoon} onChange={(e) => setExpiringSoon(e.target.checked)} />
          Por vencer (30 días)
        </label>
      </div>

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div data-tour="productos-table" className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="text-left p-3">Producto</th>
                <th className="text-left p-3">Categoría</th>
                <th className="text-right p-3">Precio</th>
                <th className="text-right p-3">Stock</th>
                <th className="text-right p-3">Mín.</th>
                <th className="text-left p-3">Vencimiento</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {(Array.isArray(filtered) ? filtered : []).map((p) => (
                <tr key={p?.id ?? ''} className="hover:bg-slate-800/50">
                  <td className="p-3">
                    <Link href={`/productos/${p?.id ?? ''}`} className="text-sky-400 hover:underline">
                      {p?.name ?? '-'}
                    </Link>
                    {p?.barcode && <span className="text-slate-500 text-xs block">{p.barcode}</span>}
                  </td>
                  <td className="p-3 text-slate-400">{p?.category?.name || '-'}</td>
                  <td className="p-3 text-right text-slate-200">${Number(p?.price ?? 0).toFixed(0)}</td>
                  <td className={`p-3 text-right ${(p?.stock ?? 0) <= (p?.minStock ?? 0) ? 'text-amber-400' : ''}`}>{p?.stock ?? 0}</td>
                  <td className="p-3 text-right text-slate-500">{p?.minStock ?? 0}</td>
                  <td className="p-3">
                    {p?.expiresAt ? (
                      (() => {
                        const dias = diasHastaVencimiento(p?.expiresAt);
                        if (dias === null) return '-';
                        if (dias < 0) return <span className="text-red-400">Vencido</span>;
                        if (dias <= 7) return <span className="text-amber-400">{dias} días</span>;
                        return <span className="text-slate-400">{new Date(p.expiresAt).toLocaleDateString('es-AR')}</span>;
                      })()
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Link href={`/productos/${p?.id ?? ''}`} className="text-sky-400 hover:underline text-xs">
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
