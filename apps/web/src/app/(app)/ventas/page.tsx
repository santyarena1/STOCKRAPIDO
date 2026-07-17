'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { printFiscalReceipt } from '@/components/FiscalCheckout';

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
  fiscalDocument?: {
    kind: 'INTERNAL' | 'FACTURA_C';
    status: 'INTERNAL' | 'PENDING' | 'AUTHORIZED' | 'ERROR';
    pointOfSale?: number | null;
    receiptNumber?: number | null;
  } | null;
};

type Customer = { id: string; name: string; balance?: string | number };

type ProductHit = { id: string; name: string; barcode?: string | null };

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_debito: 'Tarjeta débito',
  tarjeta_credito: 'Tarjeta crédito',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  fiado: 'Fiado',
};

const PAYMENT_OPTIONS = Object.entries(PAYMENT_LABELS);

type SalesHistoryStats = {
  saleCount: number;
  sumSubtotal: number;
  sumDiscount: number;
  sumTotalFinal: number;
  unitsSold: number;
  averageTicket: number;
  byPaymentMethod: Record<string, { count: number; total: number }>;
};

function formatMoneyArs(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Fecha local YYYY-MM-DD (inputs type="date"). */
function localYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Lunes de la semana calendario que contiene `ref` (semana lun → dom). */
function startOfWeekMonday(ref: Date): Date {
  const x = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

type VentasDatePresetId =
  | 'hoy'
  | 'ayer'
  | 'ultimos_7'
  | 'ultimos_5'
  | 'ultima_semana'
  | 'ultimos_30'
  | 'mes_actual'
  | 'mes_anterior';

const VENTAS_DATE_PRESETS: { id: VentasDatePresetId; label: string; title?: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'ultimos_7', label: 'Últimos 7 días', title: 'Incluye hoy (7 días corridos)' },
  { id: 'ultimos_5', label: 'Últimos 5 días', title: 'Incluye hoy (5 días corridos)' },
  {
    id: 'ultima_semana',
    label: 'Última semana',
    title: 'Semana calendario anterior (lun–dom)',
  },
  { id: 'ultimos_30', label: 'Últimos 30 días', title: 'Incluye hoy (30 días corridos)' },
  { id: 'mes_actual', label: 'Mes actual', title: 'Desde el 1 del mes hasta hoy' },
  { id: 'mes_anterior', label: 'Mes anterior', title: 'Mes calendario completo anterior' },
];

function rangeForVentasDatePreset(id: VentasDatePresetId): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (id) {
    case 'hoy':
      return { from: localYMD(today), to: localYMD(today) };
    case 'ayer': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const ymd = localYMD(y);
      return { from: ymd, to: ymd };
    }
    case 'ultimos_7': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: localYMD(start), to: localYMD(today) };
    }
    case 'ultimos_5': {
      const start = new Date(today);
      start.setDate(start.getDate() - 4);
      return { from: localYMD(start), to: localYMD(today) };
    }
    case 'ultima_semana': {
      const thisMonday = startOfWeekMonday(today);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastSunday.getDate() + 6);
      return { from: localYMD(lastMonday), to: localYMD(lastSunday) };
    }
    case 'ultimos_30': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { from: localYMD(start), to: localYMD(today) };
    }
    case 'mes_actual': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: localYMD(first), to: localYMD(today) };
    }
    case 'mes_anterior': {
      const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastPrev = new Date(firstThis);
      lastPrev.setDate(0);
      const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
      return { from: localYMD(firstPrev), to: localYMD(lastPrev) };
    }
    default:
      return { from: '', to: '' };
  }
}

export default function VentasPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<SalesHistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    customerId: '',
    limit: '100',
  });
  const [productSearch, setProductSearch] = useState('');
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const [activeDatePreset, setActiveDatePreset] = useState<VentasDatePresetId | null>(null);
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  const [saleEditDiscount, setSaleEditDiscount] = useState('');
  const [saleEditPayment, setSaleEditPayment] = useState('');
  const [saleEditCustomerId, setSaleEditCustomerId] = useState('');
  const [saleSaving, setSaleSaving] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditQty, setItemEditQty] = useState('');
  const [itemEditPrice, setItemEditPrice] = useState('');
  const [itemSaving, setItemSaving] = useState(false);

  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);

  /** IDs de ventas que parecen duplicadas: mismo totalFinal + paymentMethod dentro de 30 s */
  const duplicateIds = useMemo<Set<string>>(() => {
    if (sales.length < 2) return new Set();
    const sorted = [...sales].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const found = new Set<string>();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const diffS =
          (new Date(sorted[j].createdAt).getTime() - new Date(sorted[i].createdAt).getTime()) / 1000;
        if (diffS > 30) break;
        const sameTotal = String(sorted[i].totalFinal) === String(sorted[j].totalFinal);
        const sameMethod = sorted[i].paymentMethod === sorted[j].paymentMethod;
        const sameItems =
          sorted[i].items.length === sorted[j].items.length &&
          sorted[i].items.every((a) =>
            sorted[j].items.some(
              (b) =>
                (a.product?.id ?? a.productId) === (b.product?.id ?? b.productId) &&
                a.qty === b.qty &&
                String(a.unitPrice) === String(b.unitPrice),
            ),
          );
        if (sameTotal && sameMethod && sameItems) {
          found.add(sorted[i].id);
          found.add(sorted[j].id);
        }
      }
    }
    return found;
  }, [sales]);

  const handleCleanDuplicates = async () => {
    if (!confirm(`Se eliminarán ${duplicateIds.size - Math.floor(duplicateIds.size / 2)} venta(s) duplicada(s), revirtiendo stock y fiado. ¿Continuar?`)) return;
    setCleaningDuplicates(true);
    try {
      const result = await api<{ deleted: number; ids: string[] }>('/sales/duplicates/cleanup', { method: 'DELETE' });
      alert(`Se eliminaron ${result.deleted} venta(s) duplicada(s).`);
      fetchSales();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al limpiar duplicados');
    } finally {
      setCleaningDuplicates(false);
    }
  };

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: filters.limit };
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.customerId) params.customerId = filters.customerId;
      if (selectedProduct) params.productId = selectedProduct.id;
      const statsParams: Record<string, string> = {};
      if (filters.from) statsParams.from = filters.from;
      if (filters.to) statsParams.to = filters.to;
      if (filters.customerId) statsParams.customerId = filters.customerId;
      if (selectedProduct) statsParams.productId = selectedProduct.id;
      const [salesRes, statsRes] = await Promise.allSettled([
        api<Sale[]>('/sales', { params }),
        api<SalesHistoryStats>('/reports/sales-history-stats', { params: statsParams }),
      ]);
      setSales(
        salesRes.status === 'fulfilled' && Array.isArray(salesRes.value) ? salesRes.value : [],
      );
      const rawStats = statsRes.status === 'fulfilled' ? statsRes.value : null;
      setStats(
        rawStats && typeof rawStats === 'object' && rawStats !== null && 'saleCount' in rawStats
          ? rawStats
          : null,
      );
    } catch {
      setSales([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to, filters.customerId, filters.limit, selectedProduct?.id]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useEffect(() => {
    if (!productSearch.trim() || selectedProduct) {
      setProductHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      api<ProductHit[]>('/products/search', {
        params: { q: productSearch.trim(), limit: '15' },
      })
        .then((data) => setProductHits(Array.isArray(data) ? data : []))
        .catch(() => setProductHits([]));
    }, 280);
    return () => clearTimeout(t);
  }, [productSearch, selectedProduct]);

  useEffect(() => {
    api<Customer[]>('/customers')
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]));
  }, []);

  const applyDatePreset = (id: VentasDatePresetId) => {
    const r = rangeForVentasDatePreset(id);
    setFilters((f) => ({ ...f, from: r.from, to: r.to }));
    setActiveDatePreset(id);
  };

  useEffect(() => {
    if (!viewSale) return;
    setSaleEditDiscount(String(Number(viewSale.discount ?? 0)));
    setSaleEditPayment(viewSale.paymentMethod ?? '');
    setSaleEditCustomerId(viewSale.customer?.id ?? '');
    setEditingItemId(null);
  }, [viewSale?.id, viewSale]);

  const refreshSaleInModal = async (saleId: string) => {
    try {
      const s = await api<Sale>(`/sales/${saleId}`);
      if (s && typeof s === 'object' && 'id' in s) setViewSale(s as Sale);
    } catch {
      setViewSale(null);
    }
  };

  const handleSaveSaleMeta = async () => {
    if (!viewSale) return;
    const discount = parseFloat(saleEditDiscount.replace(',', '.')) || 0;
    if (discount < 0) {
      alert('Descuento inválido');
      return;
    }
    setSaleSaving(true);
    try {
      const body: { discount: number; paymentMethod?: string; customerId?: string | null } = {
        discount,
        paymentMethod: saleEditPayment || undefined,
      };
      body.customerId = saleEditCustomerId || null;
      const updated = await api<Sale>(`/sales/${viewSale.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setViewSale(updated);
      fetchSales();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaleSaving(false);
    }
  };

  const handleDeleteSale = async () => {
    if (!viewSale) return;
    if (!confirm('¿Eliminar esta venta por completo? Se revertirá el stock de los productos y el fiado si aplica.')) return;
    try {
      await api(`/sales/${viewSale.id}`, { method: 'DELETE' });
      setViewSale(null);
      fetchSales();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  const handleDeleteSaleFromRow = async (s: Sale, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar venta ${s.id.slice(-8)}? Se revertirá stock y fiado.`)) return;
    try {
      await api(`/sales/${s.id}`, { method: 'DELETE' });
      if (viewSale?.id === s.id) setViewSale(null);
      fetchSales();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const startEditItem = (it: SaleItem) => {
    setEditingItemId(it.id);
    setItemEditQty(String(it.qty));
    setItemEditPrice(String(Number(it.unitPrice ?? 0)));
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
  };

  const handleSaveItem = async (saleId: string, itemId: string) => {
    const qty = parseInt(itemEditQty.replace(/\D/g, ''), 10);
    const unitPrice = parseFloat(itemEditPrice.replace(',', '.'));
    if (Number.isNaN(qty) || qty < 1) {
      alert('Cantidad inválida');
      return;
    }
    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      alert('Precio inválido');
      return;
    }
    setItemSaving(true);
    try {
      const updated = await api<Sale>(`/sales/${saleId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ qty, unitPrice }),
      });
      setViewSale(updated);
      setEditingItemId(null);
      fetchSales();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar ítem');
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async (saleId: string, itemId: string) => {
    if (!confirm('¿Quitar este producto de la venta? El stock vuelve al inventario.')) return;
    setItemSaving(true);
    try {
      const res = await api<{ saleDeleted?: boolean; sale?: Sale }>(`/sales/${saleId}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (res.saleDeleted) {
        setViewSale(null);
      } else if (res.sale) {
        setViewSale(res.sale as Sale);
      } else {
        await refreshSaleInModal(saleId);
      }
      setEditingItemId(null);
      fetchSales();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar ítem');
    } finally {
      setItemSaving(false);
    }
  };
  const handleReprint = async (saleId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const popup = window.open('', '_blank', 'width=420,height=720');
    if (!popup) { alert('El navegador bloqueó la ventana de impresión.'); return; }
    try {
      const receipt = await api<any>(`/fiscal/sales/${saleId}/receipt`);
      await printFiscalReceipt(receipt, popup);
    } catch (error) {
      popup.close();
      alert(error instanceof Error ? error.message : 'No se pudo recuperar el comprobante');
    }
  };

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-bold text-white mb-4">Historial de ventas</h1>

      {!loading && stats && (
        <div data-tour="ventas-stats" className="mb-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Estadísticas del período</h2>
            <p className="text-slate-500 text-sm">
              Totales según fecha, cliente
              {selectedProduct ? (
                <>
                  {' '}
                  y producto <strong className="text-slate-400">{selectedProduct.name}</strong>
                </>
              ) : (
                ''
              )}
              . Las filas de la tabla respetan el mismo filtro (unidades vendidas = solo ese producto si aplica).
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Ventas</p>
              <p className="text-2xl font-bold text-white">{stats.saleCount}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Total cobrado</p>
              <p className="text-xl font-bold text-brand">{formatMoneyArs(stats.sumTotalFinal)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Subtotal bruto</p>
              <p className="text-xl font-bold text-white">{formatMoneyArs(stats.sumSubtotal)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Descuentos</p>
              <p className="text-xl font-bold text-amber-400">-{formatMoneyArs(stats.sumDiscount)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Ticket promedio</p>
              <p className="text-xl font-bold text-emerald-400">{formatMoneyArs(stats.averageTicket)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-slate-400 text-xs mb-1">Unidades vendidas</p>
              <p className="text-2xl font-bold text-slate-100">{stats.unitsSold}</p>
            </div>
          </div>
          {Object.keys(stats.byPaymentMethod).length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
              <p className="text-slate-400 text-xs mb-2">Por forma de pago</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-300">
                {Object.entries(stats.byPaymentMethod)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([method, v]) => (
                    <span key={method}>
                      {method === '_sin_metodo'
                        ? 'Sin método'
                        : PAYMENT_LABELS[method] ?? method}
                      : {v.count} ventas · {formatMoneyArs(v.total)}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && duplicateIds.size > 0 && (
        <div className="mb-4 rounded-xl border border-amber-600/40 bg-amber-950/25 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-amber-200 font-medium text-sm">
              ⚠ {duplicateIds.size} ventas parecen duplicadas
            </p>
            <p className="text-amber-200/60 text-xs mt-0.5">
              Mismo monto, método de pago e ítems dentro de 30 segundos — aparecen resaltadas en la tabla.
            </p>
          </div>
          <button
            type="button"
            disabled={cleaningDuplicates}
            onClick={() => void handleCleanDuplicates()}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white font-medium text-sm hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {cleaningDuplicates ? 'Limpiando…' : 'Eliminar duplicados'}
          </button>
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden mb-4">
        <div data-tour="ventas-filters" className="px-4 py-3 border-b border-slate-700 space-y-3">
          <h2 className="text-lg font-medium text-slate-200">Filtros</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-slate-500 shrink-0">Período rápido:</span>
            {VENTAS_DATE_PRESETS.map(({ id, label, title }) => (
              <button
                key={id}
                type="button"
                title={title}
                onClick={() => applyDatePreset(id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                  activeDatePreset === id
                    ? 'bg-emerald-900/50 border-emerald-600 text-emerald-200'
                    : 'border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Desde
              <input
                type="date"
                value={filters.from}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, from: e.target.value }));
                  setActiveDatePreset(null);
                }}
                className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Hasta
              <input
                type="date"
                value={filters.to}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, to: e.target.value }));
                  setActiveDatePreset(null);
                }}
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
            <div className="flex flex-col gap-1 min-w-[220px]">
              <span className="text-xs text-slate-500">Producto</span>
              {selectedProduct ? (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800 border border-emerald-700/50 text-sm">
                  <Link
                    href={`/productos/${selectedProduct.id}`}
                    className="text-emerald-400 hover:underline truncate flex-1 min-w-0"
                    title={selectedProduct.name}
                  >
                    {selectedProduct.name}
                  </Link>
                  <button
                    type="button"
                    className="text-slate-500 hover:text-white shrink-0"
                    title="Quitar filtro de producto"
                    onClick={() => {
                      setSelectedProduct(null);
                      setProductSearch('');
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar por nombre o código…"
                    className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm w-full"
                    autoComplete="off"
                  />
                  {productHits.length > 0 && (
                    <ul className="absolute top-full left-0 right-0 mt-0.5 z-30 max-h-52 overflow-auto rounded-lg border border-slate-600 bg-slate-900 shadow-xl">
                      {productHits.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 border-b border-slate-800 last:border-0"
                            onClick={() => {
                              setSelectedProduct({ id: p.id, name: p.name });
                              setProductSearch('');
                              setProductHits([]);
                            }}
                          >
                            <span className="block truncate">{p.name}</span>
                            {p.barcode && (
                              <span className="text-xs text-slate-500">{p.barcode}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
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
                <th className="text-left p-3">Comprobante</th>
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
                    No hay ventas en el período o con los filtros seleccionados
                    {selectedProduct ? ` (que incluyan "${selectedProduct.name}")` : ''}.
                  </td>
                </tr>
              ) : (
                sales.map((s) => {
                  const itemCount = s.items?.reduce((sum, i) => sum + (i.qty ?? 0), 0) ?? 0;
                  const subtotalNum = Number(s.total ?? 0);
                  const isDuplicate = duplicateIds.has(s.id);
                  return (
                    <tr key={s.id} className={isDuplicate ? 'bg-amber-950/20 border-l-2 border-amber-500/60 hover:bg-amber-950/30' : 'hover:bg-slate-800/50'}>
                      <td className="p-3 text-slate-400 whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleString('es-AR')}
                      </td>
                      <td className="p-3 text-xs whitespace-nowrap">
                        {s.fiscalDocument?.kind === 'FACTURA_C' && s.fiscalDocument.status === 'AUTHORIZED' ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 font-medium text-emerald-300">Factura C</span>
                            {s.fiscalDocument.pointOfSale != null && s.fiscalDocument.receiptNumber != null && (
                              <span className="font-mono text-[10px] text-slate-500">
                                {String(s.fiscalDocument.pointOfSale).padStart(5, '0')}-{String(s.fiscalDocument.receiptNumber).padStart(8, '0')}
                              </span>
                            )}
                          </div>
                        ) : s.fiscalDocument?.kind === 'FACTURA_C' ? (
                          <span className="rounded border border-red-500/30 bg-red-500/15 px-2 py-1 font-medium text-red-300">
                            {s.fiscalDocument.status === 'PENDING' ? 'Pendiente ARCA' : 'Error ARCA'}
                          </span>
                        ) : s.fiscalDocument?.kind === 'INTERNAL' ? (
                          <span className="rounded border border-amber-500/30 bg-amber-500/15 px-2 py-1 font-medium text-amber-300">Comprobante interno</span>
                        ) : (
                          <span className="rounded border border-slate-500/30 bg-slate-500/10 px-2 py-1 text-slate-400">Sin comprobante</span>
                        )}
                        {isDuplicate && <span className="ml-1.5 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1 py-0.5">dup</span>}
                      </td>
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
                      <td className="p-3 text-right text-brand font-medium">
                        ${Number(s.totalFinal ?? 0).toFixed(0)}
                      </td>
                      <td className="p-3 text-slate-400 text-xs">
                        {(s as Sale & { user?: { name: string } }).user?.name ?? '—'}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={(e) => void handleReprint(s.id, e)}
                          className="text-cyan-400 hover:underline text-sm"
                          title="No vuelve a facturar en ARCA"
                        >
                          Reimprimir
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewSale(s)}
                          className="text-brand hover:underline text-sm"
                        >
                          Detalle
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewSale(s);
                          }}
                          className="text-emerald-400 hover:underline text-sm"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteSaleFromRow(s, e)}
                          className="text-red-400 hover:underline text-sm"
                        >
                          Eliminar
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
          <div className="px-4 py-2 border-t border-slate-700 flex flex-wrap justify-between gap-2 text-sm text-slate-400">
            <span>
              {stats && stats.saleCount > sales.length
                ? `Mostrando ${sales.length} de ${stats.saleCount} venta(s)`
                : `${sales.length} venta(s)`}
            </span>
            <span>
              {stats ? (
                <>
                  Total descuentos: -{formatMoneyArs(stats.sumDiscount)} · Total cobrado (período):{' '}
                  {formatMoneyArs(stats.sumTotalFinal)}
                </>
              ) : (
                <>
                  Total descuentos: -$
                  {sales.reduce((s, v) => s + Number(v.discount ?? 0), 0).toFixed(0)} · Total cobrado (filas): $
                  {sales.reduce((s, v) => s + Number(v.totalFinal ?? 0), 0).toFixed(0)}
                </>
              )}
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
            className="bg-slate-900 border border-slate-700 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-slate-900 z-10">
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
            <div className="p-4 space-y-6">
              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
                <h3 className="text-slate-200 font-medium text-sm">Editar venta</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-slate-500">Descuento global ($)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={saleEditDiscount}
                      onChange={(e) => setSaleEditDiscount(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-500">Forma de pago</span>
                    <select
                      value={saleEditPayment}
                      onChange={(e) => setSaleEditPayment(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                    >
                      <option value="">—</option>
                      {PAYMENT_OPTIONS.map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs text-slate-500">Cliente (fiado / cuenta)</span>
                    <select
                      value={saleEditCustomerId}
                      onChange={(e) => setSaleEditCustomerId(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
                    >
                      <option value="">Sin cliente</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saleSaving}
                    onClick={() => void handleSaveSaleMeta()}
                    className="px-4 py-2 rounded-lg btn-brand text-sm font-medium disabled:opacity-50"
                  >
                    {saleSaving ? 'Guardando…' : 'Guardar cambios de la venta'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSale()}
                    className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 text-sm hover:bg-red-950/50"
                  >
                    Eliminar venta completa
                  </button>
                </div>
                <p className="text-slate-500 text-xs">
                  El saldo de fiado se ajusta solo si la forma de pago es <strong className="text-slate-400">Fiado</strong> y hay cliente. Al editar ítems, el descuento no puede superar el subtotal (se recalcula solo).
                </p>
              </div>

              <div>
                <h3 className="text-slate-300 font-medium mb-2">Ítems</h3>
                <div className="overflow-x-auto rounded-lg border border-slate-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-700 bg-slate-800/50">
                        <th className="p-2">Producto</th>
                        <th className="p-2 text-right">Cant.</th>
                        <th className="p-2 text-right">P. unit.</th>
                        <th className="p-2 text-right">Subtotal</th>
                        <th className="p-2 text-right w-40">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {(viewSale.items ?? []).map((it) => {
                        const isEditing = editingItemId === it.id;
                        return (
                          <tr key={it.id}>
                            <td className="p-2 text-slate-200">
                              {it.product?.name ?? it.productName ?? 'Producto manual'}
                            </td>
                            <td className="p-2 text-right">
                              {isEditing ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={itemEditQty}
                                  onChange={(e) => setItemEditQty(e.target.value.replace(/\D/g, ''))}
                                  className="w-16 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-right text-slate-100"
                                />
                              ) : (
                                <span className="text-slate-300">{it.qty}</span>
                              )}
                            </td>
                            <td className="p-2 text-right">
                              {isEditing ? (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={itemEditPrice}
                                  onChange={(e) => setItemEditPrice(e.target.value)}
                                  className="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-right text-slate-100"
                                />
                              ) : (
                                <span className="text-slate-300">${Number(it.unitPrice ?? 0).toFixed(0)}</span>
                              )}
                            </td>
                            <td className="p-2 text-right text-slate-200">
                              ${Number(it.subtotal ?? 0).toFixed(0)}
                            </td>
                            <td className="p-2 text-right whitespace-nowrap">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={itemSaving}
                                    onClick={() => void handleSaveItem(viewSale.id, it.id)}
                                    className="text-brand hover:underline text-xs mr-2"
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditItem}
                                    className="text-slate-500 hover:underline text-xs"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEditItem(it)}
                                    className="text-emerald-400 hover:underline text-xs mr-2"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={itemSaving}
                                    onClick={() => void handleDeleteItem(viewSale.id, it.id)}
                                    className="text-red-400 hover:underline text-xs"
                                  >
                                    Quitar
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal ítems</span>
                  <span>${Number(viewSale.total ?? 0).toFixed(0)}</span>
                </div>
                {Number(viewSale.discount ?? 0) > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Descuento</span>
                    <span>-${Number(viewSale.discount).toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-brand">
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
