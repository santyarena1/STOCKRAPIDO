'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

type SaleItem = {
  id: string;
  productId: string | null;
  productName: string | null;
  qty: number;
  unitPrice: string | number;
  subtotal: string | number;
  product?: { id: string; name: string } | null;
};

type Sale = {
  id: string;
  createdAt: string;
  total: string | number;
  discount: string | number;
  totalFinal: string | number;
  paymentMethod: string | null;
  status: string;
  items: SaleItem[];
  user?: { name: string };
  customer?: { id: string; name: string; balance?: string | number } | null;
};

type Customer = { id: string; name: string; balance?: string | number };

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_debito: 'Tarjeta débito',
  tarjeta_credito: 'Tarjeta crédito',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  fiado: 'Fiado',
};

export default function VentasPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    customerId: '',
    limit: '100',
  });
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: filters.limit };
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.customerId) params.customerId = filters.customerId;
      const data = await api<Sale[]>('/sales', { params });
      setSales(Array.isArray(data) ? data : []);
    } catch {
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to, filters.customerId, filters.limit]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useEffect(() => {
    api<Customer[]>('/customers')
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]));
  }, []);

  const totalVentas = sales.reduce((s, v) => s + Number(v.totalFinal ?? 0), 0);
  const totalDescuentos = sales.reduce((s, v) => s + Number(v.discount ?? 0), 0);

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-bold text-white mb-4">Historial de ventas</h1>

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden mb-4">
        <div data-tour="ventas-filters" className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-slate-200">Filtros</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Desde
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Hasta
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
              />
            </label>
            <select
              value={filters.customerId}
              onChange={(e) => setFilters((f) => ({ ...f, customerId: e.target.value }))}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm min-w-[180px]"
              title="Filtrar por cliente (ventas al fiado)"
            >
              <option value="">Todos los clientes</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={filters.limit}
              onChange={(e) => setFilters((f) => ({ ...f, limit: e.target.value }))}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
              title="Cantidad máxima de ventas"
            >
              <option value="50">Últimas 50</option>
              <option value="100">Últimas 100</option>
              <option value="200">Últimas 200</option>
              <option value="500">Últimas 500</option>
            </select>
          </div>
        </div>

        <div data-tour="ventas-table" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="text-left p-3">Fecha y hora</th>
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Forma de pago</th>
                <th className="text-right p-3">Ítems</th>
                <th className="text-right p-3">Subtotal</th>
                <th className="text-right p-3">Descuento</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">Vendedor</th>
                <th className="text-right p-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-6 text-slate-500 text-center">
                    Cargando...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-slate-500 text-center">
                    No hay ventas en el período o con el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                sales.map((s) => {
                  const itemCount = s.items?.reduce((sum, i) => sum + (i.qty ?? 0), 0) ?? 0;
                  const subtotalNum = Number(s.total ?? 0);
                  return (
                    <tr key={s.id} className="hover:bg-slate-800/50">
                      <td className="p-3 text-slate-400 whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleString('es-AR')}
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-xs">{s.id.slice(-8)}</td>
                      <td className="p-3 text-slate-200">
                        {s.customer?.name ?? '—'}
                      </td>
                      <td className="p-3 text-slate-400 text-xs">
                        {s.paymentMethod ? (PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod) : '—'}
                      </td>
                      <td className="p-3 text-right text-slate-300">{itemCount}</td>
                      <td className="p-3 text-right text-slate-300">
                        ${subtotalNum.toFixed(0)}
                      </td>
                      <td className="p-3 text-right text-amber-400">
                        {Number(s.discount ?? 0) > 0 ? `-$${Number(s.discount).toFixed(0)}` : '—'}
                      </td>
                      <td className="p-3 text-right text-sky-400 font-medium">
                        ${Number(s.totalFinal ?? 0).toFixed(0)}
                      </td>
                      <td className="p-3 text-slate-400 text-xs">
                        {(s as Sale & { user?: { name: string } }).user?.name ?? '—'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => setViewSale(s)}
                          className="text-sky-400 hover:underline text-sm"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && sales.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-700 flex justify-between text-sm text-slate-400">
            <span>{sales.length} venta(s)</span>
            <span>
              Total descuentos: -${totalDescuentos.toFixed(0)} · Total cobrado: ${totalVentas.toFixed(0)}
            </span>
          </div>
        )}
      </div>

      {viewSale && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setViewSale(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-slate-900">
              <h2 className="text-lg font-bold text-white">
                Venta {viewSale.id.slice(-8)} · {new Date(viewSale.createdAt).toLocaleString('es-AR')}
              </h2>
              <button
                type="button"
                onClick={() => setViewSale(null)}
                className="text-slate-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-slate-500">Cliente</div>
                <div className="text-slate-200">{viewSale.customer?.name ?? '—'}</div>
                <div className="text-slate-500">Vendedor</div>
                <div className="text-slate-200">{(viewSale as Sale & { user?: { name: string } }).user?.name ?? '—'}</div>
                <div className="text-slate-500">Forma de pago</div>
                <div className="text-slate-200">
                  {viewSale.paymentMethod ? (PAYMENT_LABELS[viewSale.paymentMethod] ?? viewSale.paymentMethod) : '—'}
                </div>
                <div className="text-slate-500">Estado</div>
                <div className="text-slate-200">{viewSale.status ?? 'completed'}</div>
              </div>

              <div>
                <h3 className="text-slate-300 font-medium mb-2">Detalle de ítems</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-700">
                      <th className="pb-2">Producto</th>
                      <th className="pb-2 text-right">Cant.</th>
                      <th className="pb-2 text-right">Precio unit.</th>
                      <th className="pb-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {(viewSale.items ?? []).map((it) => (
                      <tr key={it.id}>
                        <td className="py-1.5 text-slate-200">
                          {it.product?.name ?? it.productName ?? 'Producto manual'}
                        </td>
                        <td className="py-1.5 text-right text-slate-300">{it.qty}</td>
                        <td className="py-1.5 text-right text-slate-300">
                          ${Number(it.unitPrice ?? 0).toFixed(0)}
                        </td>
                        <td className="py-1.5 text-right text-slate-200">
                          ${Number(it.subtotal ?? 0).toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-700 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>${Number(viewSale.total ?? 0).toFixed(0)}</span>
                </div>
                {Number(viewSale.discount ?? 0) > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Descuento</span>
                    <span>-${Number(viewSale.discount).toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-sky-400">
                  <span>Total</span>
                  <span>${Number(viewSale.totalFinal ?? 0).toFixed(0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
