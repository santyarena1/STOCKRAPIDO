'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getApiBaseUrl } from '@/lib/api';
import { UnitPriceDisplay } from '@/components/UnitPriceDisplay';

type Product = {
  id: string;
  name: string;
  barcode?: string;
  price: string | number;
  cost?: string | number;
  stock: number;
  minStock: number;
  stockControl?: boolean;
  brand?: string | null;
  category?: { name: string };
  expiresAt?: string | null;
  imageUrl?: string | null;
  unitsPerBox?: string | null;
  unitsPerBoxNum?: number | null;
  costBox?: number | null;
  priceBox?: number | null;
  weight?: string | null;
  format?: string | null;
};
type Category = { id: string; name: string };

type StockSummary = {
  productCount: number;
  productsWithStock: number;
  productsNoStock: number;
  totalUnits: number;
  valueAtCostProduct: number;
  valueAtCostBatches: number;
  valueAtSale: number;
  potentialMargin: number;
  lowStockCount: number;
  expiringDaysWindow: number;
  expiringProductsCount: number;
  expiringUnitsInWindow: number;
  productsWithoutCostWithStock: number;
  expiringByProduct: { name: string; expiresAt: string; qtyExpiring: number }[];
  expiringBatches: {
    id: string;
    productId: string;
    productName: string;
    qty: number;
    expiresAt: string;
    unitCost: number;
  }[];
};

function formatMoneyArs(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

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
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [showBulkInternal, setShowBulkInternal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      api<Product[]>('/products', { params: { categoryId: categoryId || undefined, lowStock: lowStock ? 'true' : undefined } }),
      api<Category[]>('/business/categories'),
      api<StockSummary>('/reports/stock-summary'),
    ]).then(([prodsRes, catsRes, sumRes]) => {
      setProducts(prodsRes.status === 'fulfilled' && Array.isArray(prodsRes.value) ? prodsRes.value : []);
      setCategories(catsRes.status === 'fulfilled' && Array.isArray(catsRes.value) ? catsRes.value : []);
      setStockSummary(sumRes.status === 'fulfilled' ? sumRes.value : null);
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
    const url = `${getApiBaseUrl()}/products/export-stock`;
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

  /**
   * Lista visible con los filtros actuales.
   * CSV con punto y coma: Excel en español usa ; como separador; el .txt con tabs suele abrirse como una sola columna.
   */
  const handleExportTxt = () => {
    if (filtered.length === 0) {
      alert('No hay productos para exportar con los filtros actuales.');
      return;
    }
    const plain = (s: string) =>
      String(s)
        .replace(/\t/g, ' ')
        .replace(/\r?\n/g, ' ')
        .trim();
    const csvCell = (raw: string | number) => {
      const s = String(raw);
      if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const SEP = ';';
    const header = [
      'id',
      'nombre',
      'codigo_barras',
      'stock',
      'stock_minimo',
      'categoria',
      'precio_venta',
      'costo',
      'marca',
      'vencimiento',
      'control_stock',
    ];
    const lines = filtered.map((p) => {
      const price = typeof p.price === 'number' ? p.price : parseFloat(String(p.price ?? '0')) || 0;
      const costRaw = p.cost;
      const costNum =
        costRaw != null && costRaw !== ''
          ? (typeof costRaw === 'number' ? costRaw : parseFloat(String(costRaw))) || 0
          : null;
      const ven = p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : '';
      const row = [
        csvCell(p.id ?? ''),
        csvCell(plain(p.name ?? '')),
        csvCell(plain(p.barcode ?? '')),
        csvCell(String(p.stock ?? 0)),
        csvCell(String(p.minStock ?? 0)),
        csvCell(plain(p.category?.name ?? '')),
        csvCell(price.toFixed(2)),
        csvCell(costNum == null ? '' : costNum.toFixed(2)),
        csvCell(plain(p.brand ?? '')),
        csvCell(ven),
        csvCell(p.stockControl === false ? 'No' : 'Sí'),
      ];
      return row.join(SEP);
    });
    const content = `\uFEFF${header.join(SEP)}\n${lines.join('\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stock-${new Date().toISOString().slice(0, 10)}.csv`;
    link.style.position = 'fixed';
    link.style.left = '-9999px';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }, 500);
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
      const res = await fetch(`${getApiBaseUrl()}/products/import-stock`, {
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
          <button
            type="button"
            onClick={handleExportTxt}
            className="px-4 py-2 rounded-lg bg-slate-600 text-white font-medium hover:bg-slate-500"
            title="CSV separado por punto y coma (UTF-8): abre en Excel con todas las columnas. Respeta filtros de la tabla."
          >
            Exportar lista (CSV)
          </button>
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
            className="px-4 py-2 rounded-lg btn-brand font-medium"
          >
            Nuevo producto
          </Link>
        </div>
      </div>

      <p className="mb-2 text-slate-500 text-sm">
        <strong>Exportar stock (Excel)</strong> descarga el catálogo completo para editar e importar.{' '}
        <strong>Exportar lista (CSV)</strong> usa los filtros actuales de la tabla e incluye id, código, precio, costo,
        categoría, marca y más (separador <code className="text-slate-400">;</code> para Excel en español). Para importar:
        editá solo <strong>Stock actual</strong> y/o <strong>Stock mínimo</strong> en el Excel de exportación masiva, guardá y subilo. No borres las columnas id ni codigo_barras.
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

      {!loading && stockSummary && (
        <div data-tour="productos-stock-summary" className="mb-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Valorización y estadísticas de stock</h2>
            <p className="text-slate-500 text-sm">
              Productos activos. Costo según precio de compra cargado en el producto; si usás lotes, también mostramos valorización por lotes.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Productos en catálogo</p>
              <p className="text-2xl font-bold text-white">{stockSummary.productCount}</p>
              <p className="text-slate-500 text-xs mt-1">Con stock: {stockSummary.productsWithStock} · Sin stock: {stockSummary.productsNoStock}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Unidades totales</p>
              <p className="text-2xl font-bold text-brand">{stockSummary.totalUnits}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Valor stock (costo producto)</p>
              <p className="text-xl font-bold text-white">{formatMoneyArs(stockSummary.valueAtCostProduct)}</p>
              {stockSummary.productsWithoutCostWithStock > 0 && (
                <p className="text-amber-400/90 text-xs mt-1">{stockSummary.productsWithoutCostWithStock} con stock sin costo cargado</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Valor stock (costo lotes)</p>
              <p className="text-xl font-bold text-emerald-400">{formatMoneyArs(stockSummary.valueAtCostBatches)}</p>
              <p className="text-slate-500 text-xs mt-1">Suma de cantidad × costo unitario por lote</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Valor stock (precio venta)</p>
              <p className="text-xl font-bold text-white">{formatMoneyArs(stockSummary.valueAtSale)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Margen potencial</p>
              <p className="text-xl font-bold text-emerald-400">{formatMoneyArs(stockSummary.potentialMargin)}</p>
              <p className="text-slate-500 text-xs mt-1">Venta − costo (campo producto)</p>
            </div>
            <div className="rounded-xl border border-amber-700/40 bg-amber-900/15 p-4">
              <p className="text-amber-400/90 text-xs mb-1">Stock bajo / mínimo</p>
              <p className="text-2xl font-bold text-amber-400">{stockSummary.lowStockCount}</p>
            </div>
            <div className="rounded-xl border border-rose-700/40 bg-rose-900/15 p-4">
              <p className="text-rose-400 text-xs mb-1">Por vencer ({stockSummary.expiringDaysWindow} días)</p>
              <p className="text-2xl font-bold text-rose-300">{stockSummary.expiringUnitsInWindow}</p>
              <p className="text-slate-500 text-xs mt-1">{stockSummary.expiringProductsCount} productos con lotes en ventana</p>
            </div>
          </div>

          {(stockSummary.expiringBatches.length > 0 || stockSummary.expiringByProduct.length > 0) && (
            <div className="grid gap-6 lg:grid-cols-2">
              {stockSummary.expiringBatches.length > 0 && (
                <div className="rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700">
                    <h3 className="font-semibold text-white text-sm">Lotes por vencer (detalle)</h3>
                    <p className="text-slate-500 text-xs">Cantidad por lote en los próximos {stockSummary.expiringDaysWindow} días</p>
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-700 bg-slate-900/50">
                          <th className="px-3 py-2">Producto</th>
                          <th className="px-3 py-2 text-right">Cant.</th>
                          <th className="px-3 py-2">Vence</th>
                          <th className="px-3 py-2 text-right">Costo u.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/60">
                        {stockSummary.expiringBatches.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-800/40">
                            <td className="px-3 py-2">
                              <Link href={`/productos/${b.productId}`} className="text-brand hover:underline">
                                {b.productName}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-200">{b.qty}</td>
                            <td className="px-3 py-2 text-slate-400">{new Date(b.expiresAt).toLocaleDateString('es-AR')}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{formatMoneyArs(b.unitCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {stockSummary.expiringByProduct.length > 0 && (
                <div className="rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700">
                    <h3 className="font-semibold text-white text-sm">Próximo vencimiento por producto</h3>
                    <p className="text-slate-500 text-xs">Cantidad en la fecha de vencimiento más cercana</p>
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-700 bg-slate-900/50">
                          <th className="px-3 py-2">Producto</th>
                          <th className="px-3 py-2 text-right">Cant.</th>
                          <th className="px-3 py-2">Vence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/60">
                        {stockSummary.expiringByProduct.map((row, i) => (
                          <tr key={`${row.name}-${row.expiresAt}-${i}`} className="hover:bg-slate-800/40">
                            <td className="px-3 py-2 text-slate-200">{row.name}</td>
                            <td className="px-3 py-2 text-right">{row.qtyExpiring}</td>
                            <td className="px-3 py-2 text-slate-400">{new Date(row.expiresAt + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {stockSummary.expiringBatches.length === 0 && stockSummary.expiringByProduct.length === 0 && (
            <p className="text-slate-500 text-sm border border-slate-700/80 rounded-lg px-4 py-3 bg-slate-900/30">
              No hay lotes registrados por vencer en los próximos {stockSummary.expiringDaysWindow} días. Si cargás compras con vencimiento, aparecerán aquí.
            </p>
          )}
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
        <label className="flex items-center gap-2 text-slate-500 cursor-pointer" title="Costo y venta por bulto — solo referencia interna">
          <input type="checkbox" checked={showBulkInternal} onChange={(e) => setShowBulkInternal(e.target.checked)} />
          Ver bulto (interno)
        </label>
      </div>

      <p className="text-slate-500 text-xs mb-3">
        Costo y precio de venta se muestran <strong className="text-slate-400">por unidad (c/u)</strong> — así los usa el POS.
        Los productos importados por bulto se convierten automáticamente al importar desde Sincronizaciones.
      </p>

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div data-tour="productos-table" className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="p-3 w-12"></th>
                <th className="text-left p-3">Producto</th>
                <th className="text-left p-3">Categoría</th>
                <th className="text-left p-3">Marca</th>
                <th className="text-right p-3">Costo c/u</th>
                <th className="text-right p-3">Precio c/u</th>
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
                  className={`hover:bg-slate-800/50 ${idx === safeHighlighted ? 'bg-brand-highlight' : ''}`}
                >
                  <td className="p-2">
                    {p?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="w-9 h-9 object-contain rounded bg-white/5" />
                    ) : (
                      <div className="w-9 h-9 rounded bg-slate-800" />
                    )}
                  </td>
                  <td className="p-3">
                    <Link href={`/productos/${p?.id ?? ''}`} className="text-brand hover:underline">
                      {p?.name ?? '-'}
                    </Link>
                    {(p?.barcode || p?.weight || p?.unitsPerBox) && (
                      <span className="text-slate-500 text-xs block">
                        {[p?.barcode, p?.weight ? `${p.weight}g` : null, p?.unitsPerBox ? `x${p.unitsPerBox}` : null].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-slate-400">{p?.category?.name || '-'}</td>
                  <td className="p-3 text-slate-400">{p?.brand || '-'}</td>
                  <td className="p-3 text-right">
                    {p?.cost != null ? (
                      <UnitPriceDisplay
                        cost={p.cost}
                        unitsPerBox={p.unitsPerBox}
                        unitsPerBoxNum={p.unitsPerBoxNum}
                        costBox={p.costBox}
                        showCost
                        showPrice={false}
                        showBulkInternal={showBulkInternal}
                      />
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <UnitPriceDisplay
                      price={p?.price}
                      unitsPerBox={p?.unitsPerBox}
                      unitsPerBoxNum={p?.unitsPerBoxNum}
                      priceBox={p?.priceBox}
                      showBulkInternal={showBulkInternal}
                    />
                  </td>
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
                    <Link href={`/productos/${p?.id ?? ''}`} className="text-brand hover:underline text-xs">
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
