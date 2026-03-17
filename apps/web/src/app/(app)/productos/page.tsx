'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4002';

export default function ProductosPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryId, setCategoryId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; errors: Array<{ row: number; message: string }> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      api<Product[]>('/products', { params: { categoryId: categoryId || undefined, lowStock: lowStock ? 'true' : undefined } }),
      api<Category[]>('/business/categories'),
    ]).then(([prodsRes, catsRes]) => {
      setProducts(prodsRes.status === 'fulfilled' && Array.isArray(prodsRes.value) ? prodsRes.value : []);
      setCategories(catsRes.status === 'fulfilled' && Array.isArray(catsRes.value) ? catsRes.value : []);
    }).finally(() => setLoading(false));
  }, [categoryId, lowStock]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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
  const safeHighlighted = filtered.length > 0 ? Math.min(highlightedIndex, filtered.length - 1) : 0;

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const p = filtered[safeHighlighted];
      if (p?.id) {
        e.preventDefault();
        router.push(`/productos/${p.id}`);
      }
    }
  };

  function diasHastaVencimiento(expiresAt: string | null | undefined): number | null {
    if (!expiresAt) return null;
    const d = new Date(expiresAt);
    return Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  }

  const handleExportStock = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (exporting) return;
    setExportMsg('Preparando descarga…');
    setExporting(true);
    setImportResult(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const url = `${API}/products/export-stock`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => res.text().then((raw) => ({ ok: res.ok, raw })))
      .then(({ ok, raw }) => {
        let parsed: { message?: string; filename?: string; content?: string };
        try {
          parsed = JSON.parse(raw) as { message?: string; filename?: string; content?: string };
        } catch {
          throw new Error('La respuesta no es JSON válido');
        }
        if (!ok) throw new Error(parsed?.message || 'Error al exportar');
        if (!parsed?.content || typeof parsed.filename !== 'string') {
          throw new Error(parsed?.message || 'La API no devolvió el archivo');
        }
        const base64 = String(parsed.content).replace(/\s/g, '');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = parsed.filename;
        link.style.position = 'fixed';
        link.style.left = '-9999px';
        link.style.top = '0';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        }, 2000);
        setExportMsg(null);
      })
      .catch((err) => {
        setExportMsg(null);
        alert(err instanceof Error ? err.message : 'Error al exportar');
      })
      .finally(() => setExporting(false));
  };

  const handleImportStock = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImporting(true);
      setImportResult(null);
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API}/products/import-stock`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || res.statusText);
      setImportResult(data as { updated: number; errors: Array<{ row: number; message: string }> });
      fetchProducts();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al importar');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">Productos</h1>
        <div className="flex flex-wrap gap-2 items-center">
          <a
            href="#"
            role="button"
            onClick={(e) => handleExportStock(e)}
            className="px-4 py-2 rounded-lg bg-slate-600 text-white font-medium hover:bg-slate-500 disabled:opacity-50 inline-block cursor-pointer select-none no-underline"
            style={{ pointerEvents: exporting ? 'none' : undefined, opacity: exporting ? 0.6 : 1 }}
          >
            {exporting ? 'Exportando…' : 'Exportar stock (Excel)'}
          </a>
          {exportMsg && <span className="text-amber-400 text-sm ml-2">{exportMsg}</span>}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 rounded-lg bg-slate-600 text-white font-medium hover:bg-slate-500 disabled:opacity-50"
          >
            {importing ? 'Importando…' : 'Importar stock (Excel)'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportStock}
          />
          <Link
            href="/productos/nuevo"
            data-tour="productos-nuevo"
            className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-500"
          >
            Nuevo producto
          </Link>
        </div>
      </div>

      <p className="mb-2 text-slate-500 text-sm">
        Exportá a Excel para ver y editar columnas. Para importar: editá solo <strong>Stock actual</strong> y/o <strong>Stock mínimo</strong>, guardá el archivo y subilo. No borres las columnas id ni codigo_barras.
      </p>

      {importResult && (
        <div className="mb-4 p-3 rounded-lg bg-slate-800 border border-slate-600 text-sm">
          <p className="text-slate-200">
            Importación: <strong>{importResult.updated}</strong> producto(s) actualizado(s).
            {importResult.errors.length > 0 && (
              <span className="text-amber-400"> Errores en {importResult.errors.length} fila(s): {importResult.errors.slice(0, 5).map((e) => `Fila ${e.row}: ${e.message}`).join('; ')}
                {importResult.errors.length > 5 ? '…' : ''}</span>
            )}
          </p>
        </div>
      )}

      <div data-tour="productos-filters" className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleListKeyDown}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 w-64"
        />
        <select
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setHighlightedIndex(0); }}
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
          <input type="checkbox" checked={lowStock} onChange={(e) => { setLowStock(e.target.checked); setHighlightedIndex(0); }} />
          Stock bajo
        </label>
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
          <input type="checkbox" checked={expiringSoon} onChange={(e) => { setExpiringSoon(e.target.checked); setHighlightedIndex(0); }} />
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
              {(Array.isArray(filtered) ? filtered : []).map((p, idx) => (
                <tr
                  key={p?.id ?? ''}
                  className={`hover:bg-slate-800/50 ${idx === safeHighlighted ? 'bg-sky-600/20 ring-1 ring-inset ring-sky-500/50' : ''}`}
                >
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
