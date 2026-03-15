'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type SalesSummary = { total: number; count: number };
type TopProduct = { name: string; qty: number; total: number };
type Margin = { revenue: number; cost: number; margin: number };

export default function ReportesPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [margin, setMargin] = useState<Margin | null>(null);
  const [lowStock, setLowStock] = useState<{ name: string; stock: number; minStock: number }[]>([]);
  const [expiring, setExpiring] = useState<{ name: string; expiresAt: string; qtyExpiring: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api<SalesSummary>(`/reports/sales?period=${period}`),
      api<TopProduct[]>(`/reports/top-products?period=${period}`),
      api<Margin>(`/reports/margin?period=${period}`),
      api<{ name: string; stock: number; minStock: number }[]>('/reports/low-stock'),
      api<{ name: string; expiresAt: string; qtyExpiring: number }[]>('/reports/expiring?days=30'),
    ]).then(([sRes, tRes, mRes, lRes, eRes]) => {
      setSales(sRes.status === 'fulfilled' ? sRes.value : null);
      setTopProducts(tRes.status === 'fulfilled' && Array.isArray(tRes.value) ? tRes.value : []);
      setMargin(mRes.status === 'fulfilled' ? mRes.value : null);
      setLowStock(lRes.status === 'fulfilled' && Array.isArray(lRes.value) ? lRes.value : []);
      setExpiring(eRes.status === 'fulfilled' && Array.isArray(eRes.value) ? eRes.value : []);
    }).finally(() => setLoading(false));
  }, [period]);

  const handleExportCsv = async () => {
    try {
      const { csv, filename } = await api<{ csv: string; filename: string }>('/reports/export/sales');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Reportes</h1>
        <div data-tour="reportes-periodo" className="flex gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'today' | 'week' | 'month')}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          >
            <option value="today">Hoy</option>
            <option value="week">Semana</option>
            <option value="month">Mes</option>
          </select>
          <button data-tour="reportes-export" onClick={handleExportCsv} className="px-4 py-2 rounded-lg bg-sky-600 text-white">
            Exportar CSV
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-slate-400 text-sm">Ventas totales</h3>
              <p className="text-2xl font-bold text-white">${sales?.total?.toFixed(0) ?? 0}</p>
              <p className="text-slate-500 text-sm">{sales?.count ?? 0} ventas</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-slate-400 text-sm">Margen estimado</h3>
              <p className="text-2xl font-bold text-white">${margin?.margin?.toFixed(0) ?? 0}</p>
              <p className="text-slate-500 text-sm">Ingresos: ${margin?.revenue?.toFixed(0) ?? 0} - Costo: ${margin?.cost?.toFixed(0) ?? 0}</p>
            </div>
            <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 p-4">
              <h3 className="text-amber-400 text-sm">Stock bajo</h3>
              <p className="text-2xl font-bold text-white">{Array.isArray(lowStock) ? lowStock.length : 0}</p>
              <p className="text-slate-500 text-sm">productos</p>
            </div>
            <div className="rounded-lg border border-orange-700/50 bg-orange-900/20 p-4">
              <h3 className="text-orange-400 text-sm">Por vencer</h3>
              <p className="text-2xl font-bold text-white">{Array.isArray(expiring) ? expiring.length : 0}</p>
              <p className="text-slate-500 text-sm">próximos 30 días</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="font-medium text-slate-200 mb-4">Top productos</h3>
            <ul className="space-y-2">
              {(Array.isArray(topProducts) ? topProducts : []).slice(0, 10).map((p, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span className="text-slate-300">{p?.name ?? '-'}</span>
                  <span className="text-sky-400">{p?.qty ?? 0} und · ${Number(p?.total ?? 0).toFixed(0)}</span>
                </li>
              ))}
            </ul>
          </div>

          {(Array.isArray(lowStock) ? lowStock : []).length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="font-medium text-amber-400 mb-4">Productos con stock bajo</h3>
              <ul className="space-y-2 text-sm">
                {(Array.isArray(lowStock) ? lowStock : []).map((p, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-slate-300">{p?.name ?? '-'}</span>
                    <span className="text-amber-400">Stock: {p?.stock ?? 0} (mín: {p?.minStock ?? 0})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(Array.isArray(expiring) ? expiring : []).length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="font-medium text-orange-400 mb-4">Productos por vencer (próximos 30 días)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-700">
                      <th className="py-2 pr-4">Producto</th>
                      <th className="py-2 pr-4">Cant.</th>
                      <th className="py-2">Vence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(expiring) ? expiring : []).map((p, i) => {
                      const d = p?.expiresAt ? new Date(p.expiresAt) : new Date();
                      const dias = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                      return (
                        <tr key={i} className="border-b border-slate-700/50">
                          <td className="py-2 pr-4 text-slate-300">{p?.name ?? '-'}</td>
                          <td className="py-2 pr-4 text-slate-400">{p?.qtyExpiring ?? 0} un.</td>
                          <td className={`py-2 ${dias < 0 ? 'text-red-400' : dias <= 7 ? 'text-amber-400' : 'text-slate-400'}`}>
                            {d.toLocaleDateString('es-AR')}
                            {dias >= 0 && <span className="ml-1 text-xs">({dias} días)</span>}
                            {dias < 0 && <span className="ml-1 text-xs">(vencido)</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
