'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const [salesToday, setSalesToday] = useState<{ total: number; count: number } | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);
  const [openCaja, setOpenCaja] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api<{ total: number; count: number }>('/reports/sales?period=today'),
      api<unknown[]>('/reports/low-stock'),
      api<unknown[]>('/reports/expiring?days=30'),
      api<{ id: string } | null>('/caja/open'),
    ]).then(([sRes, lowRes, expRes, cajaRes]) => {
      setSalesToday(sRes.status === 'fulfilled' ? sRes.value : null);
      setLowStockCount(lowRes.status === 'fulfilled' && Array.isArray(lowRes.value) ? lowRes.value.length : 0);
      setExpiringCount(expRes.status === 'fulfilled' && Array.isArray(expRes.value) ? expRes.value.length : 0);
      setOpenCaja(cajaRes.status === 'fulfilled' ? cajaRes.value : null);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Link href="/pos" data-tour="dashboard-pos" className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 hover:border-sky-600 transition-colors">
          <h3 className="text-sky-400 font-medium mb-2">POS</h3>
          <p className="text-slate-400 text-sm">Ir al punto de venta</p>
        </Link>
        <div data-tour="dashboard-ventas-hoy" className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <h3 className="text-slate-400 font-medium mb-2">Ventas hoy</h3>
          <p className="text-2xl font-bold text-white">${salesToday?.total?.toFixed(0) ?? 0}</p>
          <p className="text-slate-500 text-sm">{salesToday?.count ?? 0} ventas</p>
        </div>
        <div data-tour="dashboard-stock-bajo" className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <h3 className="text-slate-400 font-medium mb-2">Stock bajo</h3>
          <p className="text-2xl font-bold text-white">{lowStockCount}</p>
          <p className="text-slate-500 text-sm">productos</p>
        </div>
        <Link href="/reportes" data-tour="dashboard-por-vencer" className="rounded-lg border border-orange-700/50 bg-orange-900/20 p-6 hover:border-orange-600 transition-colors block">
          <h3 className="text-orange-400 font-medium mb-2">Por vencer</h3>
          <p className="text-2xl font-bold text-white">{expiringCount}</p>
          <p className="text-slate-500 text-sm">próximos 30 días</p>
        </Link>
      </div>

      <div className="space-y-4">
        {openCaja ? (
          <div data-tour="dashboard-caja" className="rounded-lg border border-green-700/50 bg-green-900/20 p-4">
            <p className="text-green-400">Caja abierta</p>
            <Link href="/caja" className="text-sky-400 hover:underline text-sm">Ver caja →</Link>
          </div>
        ) : (
          <div data-tour="dashboard-caja" className="rounded-lg border border-amber-700/50 bg-amber-900/20 p-4">
            <p className="text-amber-400">Caja cerrada</p>
            <Link href="/caja" className="text-sky-400 hover:underline text-sm">Abrir caja →</Link>
          </div>
        )}
        <div data-tour="dashboard-links" className="flex flex-wrap gap-2">
          <Link href="/reportes" className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800">
            Reportes
          </Link>
          <Link href="/productos" className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800">
            Productos
          </Link>
          <Link href="/compras" className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800">
            Compras
          </Link>
          <Link href="/clientes" className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800">
            Clientes
          </Link>
        </div>
      </div>
    </div>
  );
}
