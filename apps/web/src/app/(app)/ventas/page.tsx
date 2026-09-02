'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { printFiscalReceipt } from '@/components/FiscalCheckout';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { usePersistedState } from '@/lib/use-persisted-state';
import {
  confirmInvoiceAlertIfNeeded,
  fetchInvoiceAlert,
  type InvoiceAlertBucket,
  type InvoiceAlertStatus,
} from '@/lib/invoice-alert';
import { formatMoneyArs as formatMoneyArsShared, formatMoneyInputArs, parseMoneyInputArs } from '@/lib/units';

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
  status?: string;
  voidedAt?: string | null;
  items: SaleItem[];
  user?: { name: string };
  seller?: { name: string } | null;
  customer?: { id: string; name: string; balance?: string | number } | null;
  fiscalDocument?: {
    kind: 'INTERNAL' | 'FACTURA_C';
    status: 'INTERNAL' | 'PENDING' | 'AUTHORIZED' | 'ERROR';
    pointOfSale?: number | null;
    receiptNumber?: number | null;
    errorMessage?: string | null;
    creditNoteNumber?: number | null;
    creditNoteType?: number | null;
    voidedAt?: string | null;
  } | null;
};

type Customer = { id: string; name: string; balance?: string | number };

type ProductHit = { id: string; name: string; barcode?: string | null };

type ExternalFiscalEntry = {
  id: string;
  amount: number;
  note: string | null;
  invoicedAt: string;
  createdAt: string;
};

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_debito: 'Tarjeta débito',
  tarjeta_credito: 'Tarjeta crédito',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  fiado: 'Fiado',
};

const PAYMENT_OPTIONS = Object.entries(PAYMENT_LABELS);

function saleSellerLabel(sale: Sale) {
  return sale.seller?.name?.trim() || '—';
}

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
  return formatMoneyArsShared(n, 0);
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
  const [listTab, setListTab] = usePersistedState<'todas' | 'facturas'>('sr-filters:ventas:tab', 'todas');
  const [facturasView, setFacturasView] = usePersistedState<'emitidas' | 'pendientes'>(
    'sr-filters:ventas:facturas-view',
    'emitidas',
  );
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [invoiceSummary, setInvoiceSummary] = useState<{
    totalFacturado: number;
    pendingTotal: number;
    pendingCount: number;
    activeCount: number;
    voidedCount: number;
    creditNotes: number;
    invoicedGross: number;
    externalCount?: number;
    externalTotal?: number;
  } | null>(null);
  const [externalEntries, setExternalEntries] = useState<ExternalFiscalEntry[]>([]);
  const [externalAmount, setExternalAmount] = useState('');
  const [externalNote, setExternalNote] = useState('');
  const [externalBusy, setExternalBusy] = useState(false);
  const [invoiceAlert, setInvoiceAlert] = useState<InvoiceAlertStatus | null>(null);
  const [alertForm, setAlertForm] = useState({
    monthEnabled: false,
    monthLimit: '',
    monthPercent: 80,
    yearEnabled: false,
    yearLimit: '',
    yearPercent: 80,
  });
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [includeVoidedInvoices, setIncludeVoidedInvoices] = useState(false);
  const [filters, setFilters] = usePersistedState('sr-filters:ventas:list', {
    from: '',
    to: '',
    customerId: '',
    limit: '100',
  });
  const [productSearch, setProductSearch] = useState('');
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const [selectedProduct, setSelectedProduct] = usePersistedState<{ id: string; name: string } | null>('sr-filters:ventas:product', null);
  const [activeDatePreset, setActiveDatePreset] = usePersistedState<VentasDatePresetId | null>('sr-filters:ventas:date-preset', null);
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

      if (listTab === 'facturas') {
        const invParams: Record<string, string> = { limit: filters.limit };
        if (filters.from) invParams.from = filters.from;
        if (filters.to) invParams.to = filters.to;
        if (facturasView === 'emitidas' && includeVoidedInvoices) invParams.includeVoided = '1';

        const pendingParams: Record<string, string> = { limit: filters.limit };
        if (filters.from) pendingParams.from = filters.from;
        if (filters.to) pendingParams.to = filters.to;

        const summaryParams: Record<string, string> = {};
        if (filters.from) summaryParams.from = filters.from;
        if (filters.to) summaryParams.to = filters.to;

        const listUrl =
          facturasView === 'pendientes' ? '/fiscal/invoices/pending' : '/fiscal/invoices';
        const listParams = facturasView === 'pendientes' ? pendingParams : invParams;

        const [salesRes, alertRes, summaryRes, externalRes] = await Promise.allSettled([
          api<Sale[]>(listUrl, { params: listParams }),
          fetchInvoiceAlert(0),
          api<{
            totalFacturado: number;
            pendingTotal: number;
            pendingCount: number;
            activeCount: number;
            voidedCount: number;
            creditNotes: number;
            invoicedGross: number;
            externalCount?: number;
            externalTotal?: number;
          }>('/fiscal/invoices/summary', { params: summaryParams }),
          api<ExternalFiscalEntry[]>('/fiscal/external-invoices', { params: summaryParams }),
        ]);
        const listed =
          salesRes.status === 'fulfilled' && Array.isArray(salesRes.value) ? salesRes.value : [];
        setSales(listed);
        setSelectedSaleIds(new Set());
        setStats(null);

        if (summaryRes.status === 'fulfilled' && summaryRes.value) {
          setInvoiceSummary(summaryRes.value);
        } else {
          setInvoiceSummary(null);
        }

        setExternalEntries(
          externalRes.status === 'fulfilled' && Array.isArray(externalRes.value)
            ? externalRes.value
            : [],
        );

        if (alertRes.status === 'fulfilled') {
          const a = alertRes.value;
          setInvoiceAlert(a);
          const month = a.monthly ?? a;
          const year = a.yearly;
          setAlertForm({
            monthEnabled: month.alertEnabled ?? month.enabled,
            monthLimit: formatMoneyInputArs(month.limit),
            monthPercent: month.percent ?? 80,
            yearEnabled: year?.alertEnabled ?? year?.enabled ?? false,
            yearLimit: formatMoneyInputArs(year?.limit),
            yearPercent: year?.percent ?? 80,
          });
        } else {
          setInvoiceAlert(null);
        }
        return;
      }

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
  }, [
    filters.from,
    filters.to,
    filters.customerId,
    filters.limit,
    selectedProduct?.id,
    listTab,
    includeVoidedInvoices,
    facturasView,
  ]);

  const selectedBatchTotal = useMemo(() => {
    if (selectedSaleIds.size === 0) return 0;
    return sales
      .filter((s) => selectedSaleIds.has(s.id))
      .reduce((sum, s) => sum + Number(s.totalFinal || 0), 0);
  }, [sales, selectedSaleIds]);

  const toggleSaleSelected = (saleId: string) => {
    setSelectedSaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) next.delete(saleId);
      else next.add(saleId);
      return next;
    });
  };

  const toggleSelectAllPending = () => {
    const selectable = sales.filter(
      (s) =>
        s.status !== 'voided' &&
        (!s.fiscalDocument ||
          s.fiscalDocument.kind === 'INTERNAL' ||
          (s.fiscalDocument.kind === 'FACTURA_C' &&
            (s.fiscalDocument.status === 'ERROR' || s.fiscalDocument.status === 'PENDING'))),
    );
    if (selectedSaleIds.size === selectable.length) {
      setSelectedSaleIds(new Set());
      return;
    }
    setSelectedSaleIds(new Set(selectable.map((s) => s.id)));
  };

  const handleFacturarLote = async () => {
    const ids = [...selectedSaleIds];
    if (ids.length === 0) {
      alert('Seleccioná al menos una venta.');
      return;
    }
    const okAlert = await confirmInvoiceAlertIfNeeded(selectedBatchTotal);
    if (!okAlert) return;
    if (
      !confirm(
        `¿Facturar ${ids.length} venta(s) por ${formatMoneyArs(selectedBatchTotal)}? Se emiten de a una en ARCA.`,
      )
    ) {
      return;
    }
    setBatchBusy(true);
    try {
      const result = await api<{
        authorized: number;
        errors: number;
        totalAuthorized: number;
        results: { saleId: string; status: string; errorMessage: string | null }[];
      }>('/fiscal/invoices/batch', {
        method: 'POST',
        body: JSON.stringify({ saleIds: ids }),
      });
      const errorSamples = result.results
        .filter((r) => r.status !== 'AUTHORIZED')
        .slice(0, 3)
        .map((r) => r.errorMessage || r.status)
        .join(' · ');
      alert(
        `Lote listo: ${result.authorized} autorizada(s)${
          result.errors ? `, ${result.errors} con error` : ''
        }.${errorSamples ? `\n${errorSamples}` : ''}`,
      );
      await fetchSales();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo facturar el lote.');
    } finally {
      setBatchBusy(false);
    }
  };

  const handleAddExternalInvoice = async () => {
    const amount = parseMoneyInputArs(externalAmount);
    if (!amount || amount <= 0) {
      alert('Ingresá un monto mayor a 0.');
      return;
    }
    setExternalBusy(true);
    try {
      await api('/fiscal/external-invoices', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          note: externalNote.trim() || undefined,
        }),
      });
      setExternalAmount('');
      setExternalNote('');
      await fetchSales();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo registrar el monto.');
    } finally {
      setExternalBusy(false);
    }
  };

  const handleDeleteExternalInvoice = async (id: string) => {
    if (!confirm('¿Quitar este monto del total facturado?')) return;
    setExternalBusy(true);
    try {
      await api(`/fiscal/external-invoices/${id}`, { method: 'DELETE' });
      await fetchSales();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo eliminar el registro.');
    } finally {
      setExternalBusy(false);
    }
  };

  const handleSaveInvoiceAlert = async () => {
    setAlertSaving(true);
    setAlertMessage('');
    try {
      const updated = await api<InvoiceAlertStatus>('/fiscal/invoice-alert', {
        method: 'PUT',
        body: JSON.stringify({
          invoiceAlertEnabled: alertForm.monthEnabled,
          invoiceAlertLimit: parseMoneyInputArs(alertForm.monthLimit),
          invoiceAlertPercent: alertForm.monthPercent,
          invoiceYearAlertEnabled: alertForm.yearEnabled,
          invoiceYearAlertLimit: parseMoneyInputArs(alertForm.yearLimit),
          invoiceYearAlertPercent: alertForm.yearPercent,
        }),
      });
      setInvoiceAlert(updated);
      const month = updated.monthly ?? updated;
      const year = updated.yearly;
      setAlertForm({
        monthEnabled: month.alertEnabled ?? month.enabled,
        monthLimit: formatMoneyInputArs(month.limit),
        monthPercent: month.percent ?? 80,
        yearEnabled: year?.alertEnabled ?? year?.enabled ?? false,
        yearLimit: formatMoneyInputArs(year?.limit),
        yearPercent: year?.percent ?? 80,
      });
      setAlertMessage('Topes mensual y anual guardados.');
    } catch (e) {
      setAlertMessage(e instanceof Error ? e.message : 'No se pudo guardar el aviso');
    } finally {
      setAlertSaving(false);
    }
  };

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

  const handleFacturar = async (saleId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const sale = sales.find((s) => s.id === saleId) ?? (viewSale?.id === saleId ? viewSale : null);
    const amount = sale ? Number(sale.totalFinal) : 0;
    const ok = await confirmInvoiceAlertIfNeeded(amount);
    if (!ok) return;
    try {
      const fiscalDocument = await api<NonNullable<Sale['fiscalDocument']>>(
        `/fiscal/sales/${saleId}/factura`,
        { method: 'POST' },
      );
      await fetchSales();
      if (viewSale?.id === saleId) await refreshSaleInModal(saleId);
      if (fiscalDocument.status === 'ERROR') {
        alert(fiscalDocument.errorMessage || 'ARCA no pudo autorizar la Factura C.');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo facturar la venta.');
    }
  };

  const handleAnular = async (saleId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!confirm('¿Anular la factura con una nota de crédito? Se revierte stock y fiado y no se puede deshacer.')) return;
    try {
      const updated = await api<Sale>(`/sales/${saleId}/void`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (viewSale?.id === saleId) setViewSale(updated);
      await fetchSales();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo emitir la nota de crédito en ARCA.');
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
    <Container className="max-w-[1400px] space-y-6">
      <PageHeader title="Historial de ventas" subtitle="Consultá operaciones, comprobantes y detalle de cada venta." />

      <div className="inline-flex rounded-lg border border-hair overflow-hidden">
        <button
          type="button"
          onClick={() => setListTab('todas')}
          className={`px-4 py-2 text-sm font-semibold ${
            listTab === 'todas' ? 'bg-brand-hi text-fg' : 'bg-raised text-fg-muted hover:text-fg'
          }`}
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => setListTab('facturas')}
          className={`px-4 py-2 text-sm font-semibold ${
            listTab === 'facturas' ? 'bg-[var(--ok-soft)] text-ok' : 'bg-raised text-fg-muted hover:text-fg'
          }`}
        >
          Facturas
        </button>
      </div>

      {listTab === 'facturas' && (
        <div className="space-y-4">
          {(() => {
            const totalFacturado = invoiceSummary?.totalFacturado ?? 0;
            const quedaPorFacturar = invoiceSummary?.pendingTotal ?? 0;
            const pendingCount = invoiceSummary?.pendingCount ?? 0;
            const activeCount = invoiceSummary?.activeCount ?? 0;
            const creditNotes = invoiceSummary?.creditNotes ?? 0;
            const externalTotal = invoiceSummary?.externalTotal ?? 0;
            const externalCount = invoiceSummary?.externalCount ?? 0;
            const monthly = invoiceAlert?.monthly ?? invoiceAlert;
            const yearly = invoiceAlert?.yearly ?? null;
            const anyWarn =
              Boolean(monthly && monthly.limit != null && monthly.percentUsed >= monthly.percent && monthly.percentUsed < 100) ||
              Boolean(yearly && yearly.limit != null && yearly.percentUsed >= yearly.percent && yearly.percentUsed < 100);
            const anyOver =
              Boolean(monthly && monthly.limit != null && monthly.percentUsed >= 100) ||
              Boolean(yearly && yearly.limit != null && yearly.percentUsed >= 100);
            const filterLabel =
              filters.from || filters.to
                ? `Filtro de lista: ${filters.from || '…'} → ${filters.to || '…'}`
                : 'Sin filtro de fechas en la lista';

            const renderLimitBar = (bucket: InvoiceAlertBucket | null | undefined, title: string) => {
              if (!bucket || bucket.limit == null || bucket.limit <= 0) return null;
              const limit = bucket.limit;
              const warnFrom = bucket.percent ?? 80;
              const topeFacturado = bucket.invoicedNet ?? 0;
              const barPct = Math.min(100, Math.max(0, (topeFacturado / limit) * 100));
              const barWarn = barPct >= warnFrom && barPct < 100;
              const barOver = barPct >= 100;
              const barColor = barOver ? 'bg-crit' : barWarn ? 'bg-amber-500' : 'bg-emerald-600';
              return (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-fg-faint">
                    <span>
                      {title}
                      {bucket.periodFrom ? ` · ${bucket.periodFrom}` : ''}
                      {bucket.periodTo ? ` → ${bucket.periodTo}` : ''}
                      {barWarn || barOver
                        ? ` · ${barOver ? 'límite alcanzado' : `aviso ≥${warnFrom}%`}`
                        : ` · aviso desde ${warnFrom}%`}
                    </span>
                    <span
                      className={`font-mono tabular-nums ${
                        barOver ? 'text-crit' : barWarn ? 'text-amber-300' : ''
                      }`}
                    >
                      {formatMoneyArs(topeFacturado)} / {formatMoneyArs(limit)} ({barPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="relative h-3 rounded-full bg-raised overflow-hidden border border-hair-soft">
                    <div
                      className="absolute top-0 bottom-0 w-px bg-amber-400/80 z-10"
                      style={{ left: `${Math.min(100, Math.max(0, warnFrom))}%` }}
                      title={`Aviso desde ${warnFrom}%`}
                    />
                    <div
                      className={`h-full rounded-full transition-[width] ${barColor}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            };

            return (
              <div
                className={`rounded-xl border px-4 py-4 ${
                  anyOver
                    ? 'border-crit/40 bg-[var(--crit-soft)]'
                    : anyWarn
                      ? 'border-amber-600/40 bg-amber-950/25'
                      : 'border-hair-soft bg-surface'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-fg">Progreso de facturación</h2>
                    <p className="text-sm text-fg-faint mt-0.5">{filterLabel}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-hair-soft bg-raised p-4">
                    <p className="text-xs text-fg-muted">Total facturado</p>
                    <p className="font-mono text-2xl font-bold tabular-nums text-ok">
                      {formatMoneyArs(totalFacturado)}
                    </p>
                    <p className="text-xs text-fg-faint mt-1">
                      {activeCount} factura(s) activa(s) en el sistema
                      {externalCount > 0 ? ` · ${externalCount} externa(s) +${formatMoneyArs(externalTotal)}` : ''}
                      {creditNotes > 0 ? ` · NC −${formatMoneyArs(creditNotes)}` : ''}
                    </p>
                  </div>
                  <div className="rounded-lg border border-hair-soft bg-raised p-4">
                    <p className="text-xs text-fg-muted">Queda por facturar</p>
                    <p className="font-mono text-2xl font-bold tabular-nums text-warn">
                      {formatMoneyArs(quedaPorFacturar)}
                    </p>
                    <p className="text-xs text-fg-faint mt-1">{pendingCount} venta(s) pendiente(s)</p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {renderLimitBar(monthly, 'Tope mensual')}
                  {renderLimitBar(yearly, 'Tope anual')}
                  {!monthly?.limit && !yearly?.limit && (
                    <p className="text-sm text-fg-faint">
                      Definí un tope mensual y/o anual abajo (o en Config → Fiscal) para ver las barras.
                    </p>
                  )}
                </div>

                {invoiceAlert?.shouldAlert && invoiceAlert.message && (
                  <p className="mt-3 text-sm text-amber-200">{invoiceAlert.message}</p>
                )}
              </div>
            );
          })()}

          <div className="rounded-xl border border-hair-soft bg-surface px-4 py-4 space-y-4">
            <div>
              <h3 className="font-medium text-fg">Facturado fuera del sistema</h3>
              <p className="text-xs text-fg-faint mt-0.5">
                Si emitiste una factura por tu cuenta (sin pasar por StockRápido), cargá solo el monto para que cuente en el total y en tus topes mensual/anual.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-fg-muted">
                Monto
                <input
                  type="text"
                  inputMode="decimal"
                  value={externalAmount}
                  onChange={(e) => setExternalAmount(e.target.value)}
                  placeholder="Ej. 15000"
                  className="mt-1 block w-full min-w-[140px] rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono text-fg sm:w-40"
                />
              </label>
              <label className="text-sm text-fg-muted flex-1 min-w-[180px]">
                Nota <span className="text-fg-faint">(opcional)</span>
                <input
                  type="text"
                  value={externalNote}
                  onChange={(e) => setExternalNote(e.target.value)}
                  placeholder="Ej. Factura manual en ARCA"
                  className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 text-fg"
                />
              </label>
              <button
                type="button"
                disabled={externalBusy}
                onClick={() => void handleAddExternalInvoice()}
                className="rounded-lg btn-brand px-4 py-2 text-sm disabled:opacity-50"
              >
                {externalBusy ? 'Guardando…' : 'Registrar monto'}
              </button>
            </div>
            {externalEntries.length > 0 ? (
              <ul className="divide-y divide-hair-soft rounded-lg border border-hair-soft overflow-hidden">
                {externalEntries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 bg-raised px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold tabular-nums text-fg">
                        {formatMoneyArs(entry.amount)}
                      </p>
                      <p className="text-xs text-fg-faint">
                        {new Date(entry.invoicedAt).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {entry.note ? ` · ${entry.note}` : ' · Sin nota'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={externalBusy}
                      onClick={() => void handleDeleteExternalInvoice(entry.id)}
                      className="rounded-lg border border-hair px-3 py-1.5 text-xs text-fg-muted hover:bg-surface disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-faint">Todavía no cargaste montos externos en este período.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-hair overflow-hidden">
              <button
                type="button"
                onClick={() => setFacturasView('emitidas')}
                className={`px-3 py-1.5 text-sm font-semibold ${
                  facturasView === 'emitidas' ? 'bg-[var(--ok-soft)] text-ok' : 'bg-raised text-fg-muted'
                }`}
              >
                Emitidas
              </button>
              <button
                type="button"
                onClick={() => setFacturasView('pendientes')}
                className={`px-3 py-1.5 text-sm font-semibold ${
                  facturasView === 'pendientes' ? 'bg-[var(--warn-soft)] text-warn' : 'bg-raised text-fg-muted'
                }`}
              >
                Pendientes ({invoiceSummary?.pendingCount ?? 0})
              </button>
            </div>
            {facturasView === 'pendientes' && (
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={toggleSelectAllPending}
                  className="px-3 py-1.5 text-sm rounded-lg border border-hair text-fg-muted hover:bg-raised"
                >
                  {selectedSaleIds.size > 0 && selectedSaleIds.size === sales.length
                    ? 'Quitar selección'
                    : 'Seleccionar todas'}
                </button>
                <button
                  type="button"
                  disabled={batchBusy || selectedSaleIds.size === 0}
                  onClick={() => void handleFacturarLote()}
                  className="px-4 py-1.5 text-sm rounded-lg btn-brand disabled:opacity-50"
                >
                  {batchBusy
                    ? 'Facturando lote…'
                    : `Facturar en lote${
                        selectedSaleIds.size
                          ? ` (${selectedSaleIds.size} · ${formatMoneyArs(selectedBatchTotal)})`
                          : ''
                      }`}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-hair-soft bg-surface px-4 py-4 space-y-4">
            <div>
              <h3 className="font-medium text-fg">Configurar topes y avisos</h3>
              <p className="text-xs text-fg-faint">
                Mensual y anual pueden estar activos a la vez. Se avisa en el POS y al facturar antes de emitir.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-hair-soft bg-raised p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-fg">Tope mensual</p>
                  <label className="flex items-center gap-2 text-sm text-fg-muted">
                    <input
                      type="checkbox"
                      checked={alertForm.monthEnabled}
                      onChange={(e) => setAlertForm((f) => ({ ...f, monthEnabled: e.target.checked }))}
                    />
                    Activado
                  </label>
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                  <label className="text-sm text-fg-muted">
                    Monto límite
                    <input
                      className="mt-1 block w-48 rounded-lg border border-hair bg-surface px-2 py-1.5 font-mono text-sm tabular-nums text-fg"
                      inputMode="numeric"
                      value={alertForm.monthLimit}
                      onChange={(e) =>
                        setAlertForm((f) => ({ ...f, monthLimit: formatMoneyInputArs(e.target.value) }))
                      }
                      placeholder="$ 0"
                    />
                  </label>
                  <label className="text-sm text-fg-muted">
                    Avisar desde (%)
                    <input
                      className="mt-1 block w-24 rounded-lg border border-hair bg-surface px-2 py-1.5 font-mono text-sm text-fg"
                      type="number"
                      min={1}
                      max={100}
                      value={alertForm.monthPercent}
                      onChange={(e) =>
                        setAlertForm((f) => ({ ...f, monthPercent: Number(e.target.value) || 80 }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-hair-soft bg-raised p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-fg">Tope anual</p>
                  <label className="flex items-center gap-2 text-sm text-fg-muted">
                    <input
                      type="checkbox"
                      checked={alertForm.yearEnabled}
                      onChange={(e) => setAlertForm((f) => ({ ...f, yearEnabled: e.target.checked }))}
                    />
                    Activado
                  </label>
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                  <label className="text-sm text-fg-muted">
                    Monto límite
                    <input
                      className="mt-1 block w-48 rounded-lg border border-hair bg-surface px-2 py-1.5 font-mono text-sm tabular-nums text-fg"
                      inputMode="numeric"
                      value={alertForm.yearLimit}
                      onChange={(e) =>
                        setAlertForm((f) => ({ ...f, yearLimit: formatMoneyInputArs(e.target.value) }))
                      }
                      placeholder="$ 0"
                    />
                  </label>
                  <label className="text-sm text-fg-muted">
                    Avisar desde (%)
                    <input
                      className="mt-1 block w-24 rounded-lg border border-hair bg-surface px-2 py-1.5 font-mono text-sm text-fg"
                      type="number"
                      min={1}
                      max={100}
                      value={alertForm.yearPercent}
                      onChange={(e) =>
                        setAlertForm((f) => ({ ...f, yearPercent: Number(e.target.value) || 80 }))
                      }
                    />
                  </label>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={alertSaving}
              onClick={() => void handleSaveInvoiceAlert()}
              className="px-4 py-2 rounded-lg btn-brand text-sm disabled:opacity-50"
            >
              {alertSaving ? 'Guardando…' : 'Guardar topes'}
            </button>
            {alertMessage && (
              <p className={`text-sm ${alertMessage.includes('guardado') ? 'text-ok' : 'text-warn'}`}>
                {alertMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {!loading && listTab === 'todas' && stats && (
        <div data-tour="ventas-stats" className="mb-6 space-y-4">
          <div>
            <h2 className="mb-1 text-lg font-semibold text-fg">Estadísticas del período</h2>
            <p className="text-sm text-fg-faint">
              Totales según fecha, cliente
              {selectedProduct ? (
                <>
                  {' '}
                y producto <strong className="text-fg-muted">{selectedProduct.name}</strong>
                </>
              ) : (
                ''
              )}
              . Las filas de la tabla respetan el mismo filtro (unidades vendidas = solo ese producto si aplica).
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
              <p className="mb-1 text-xs text-fg-muted">Ventas</p>
              <p className="font-mono text-3xl font-bold tabular-nums text-fg">{stats.saleCount}</p>
            </div>
            <div className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
              <p className="text-fg-muted text-xs mb-1">Total cobrado</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-brand">{formatMoneyArs(stats.sumTotalFinal)}</p>
            </div>
            <div className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
              <p className="text-fg-muted text-xs mb-1">Subtotal bruto</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-fg">{formatMoneyArs(stats.sumSubtotal)}</p>
            </div>
            <div className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
              <p className="text-fg-muted text-xs mb-1">Descuentos</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-warn">-{formatMoneyArs(stats.sumDiscount)}</p>
            </div>
            <div className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
              <p className="text-fg-muted text-xs mb-1">Ticket promedio</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-ok">{formatMoneyArs(stats.averageTicket)}</p>
            </div>
            <div className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
              <p className="text-fg-muted text-xs mb-1">Unidades vendidas</p>
              <p className="font-mono text-3xl font-bold tabular-nums text-fg">{stats.unitsSold}</p>
            </div>
          </div>
          {Object.keys(stats.byPaymentMethod).length > 0 && (
            <div className="rounded-xl border border-hair-soft bg-surface px-4 py-3">
              <p className="text-fg-muted text-xs mb-2">Por forma de pago</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-fg-muted">
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

      {!loading && listTab === 'todas' && duplicateIds.size > 0 && (
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
            className="px-4 py-2 rounded-lg bg-amber-600 text-fg font-medium text-sm hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {cleaningDuplicates ? 'Limpiando…' : 'Eliminar duplicados'}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-hair-soft bg-surface">
        <div data-tour="ventas-filters" className="space-y-3 border-b border-hair-soft px-4 py-4 sm:px-5">
          <h2 className="text-lg font-medium text-fg">Filtros</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-fg-faint shrink-0">Período rápido:</span>
            {VENTAS_DATE_PRESETS.map(({ id, label, title }) => (
              <button
                key={id}
                type="button"
                title={title}
                onClick={() => applyDatePreset(id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                  activeDatePreset === id
                    ? 'bg-emerald-900/50 border-emerald-600 text-emerald-200'
                    : 'border-hair bg-raised text-fg-muted hover:bg-raised2 hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex w-full items-center justify-between gap-2 text-sm text-fg-muted sm:w-auto sm:justify-start">
              Desde
              <input
                type="date"
                value={filters.from}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, from: e.target.value }));
                  setActiveDatePreset(null);
                }}
                className="rounded-lg border border-hair bg-raised px-2 py-1.5 font-mono text-sm tabular-nums text-fg"
              />
            </label>
            <label className="flex w-full items-center justify-between gap-2 text-sm text-fg-muted sm:w-auto sm:justify-start">
              Hasta
              <input
                type="date"
                value={filters.to}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, to: e.target.value }));
                  setActiveDatePreset(null);
                }}
                className="rounded-lg border border-hair bg-raised px-2 py-1.5 font-mono text-sm tabular-nums text-fg"
              />
            </label>
            <select
              value={filters.customerId}
              onChange={(e) => setFilters((f) => ({ ...f, customerId: e.target.value }))}
              className="w-full rounded-lg border border-hair bg-raised px-2 py-1.5 text-sm text-fg sm:w-auto sm:min-w-[180px]"
              title="Filtrar por cliente (ventas al fiado)"
              disabled={listTab === 'facturas'}
            >
              <option value="">Todos los clientes</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {listTab === 'facturas' && facturasView === 'emitidas' && (
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  checked={includeVoidedInvoices}
                  onChange={(e) => setIncludeVoidedInvoices(e.target.checked)}
                />
                Incluir anuladas (NC)
              </label>
            )}
            <div className={`flex w-full flex-col gap-1 sm:w-auto sm:min-w-[220px] ${listTab === 'facturas' ? 'opacity-40 pointer-events-none' : ''}`}>
              <span className="text-xs text-fg-faint">Producto</span>
              {selectedProduct ? (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-raised border border-emerald-700/50 text-sm">
                  <Link
                    href={`/productos/${selectedProduct.id}`}
                    className="text-emerald-400 hover:underline truncate flex-1 min-w-0"
                    title={selectedProduct.name}
                  >
                    {selectedProduct.name}
                  </Link>
                  <button
                    type="button"
                    className="text-fg-faint hover:text-fg shrink-0"
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
                  className="w-full rounded-lg border border-hair bg-raised px-2 py-1.5 text-sm text-fg placeholder:text-fg-faint"
                    autoComplete="off"
                  />
                  {productHits.length > 0 && (
                    <ul className="absolute top-full left-0 right-0 mt-0.5 z-30 max-h-52 overflow-auto rounded-lg border border-hair bg-surface shadow-xl">
                      {productHits.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-fg hover:bg-raised border-b border-hair-soft last:border-0"
                            onClick={() => {
                              setSelectedProduct({ id: p.id, name: p.name });
                              setProductSearch('');
                              setProductHits([]);
                            }}
                          >
                            <span className="block truncate">{p.name}</span>
                            {p.barcode && (
                              <span className="text-xs text-fg-faint">{p.barcode}</span>
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
              className="w-full rounded-lg border border-hair bg-raised px-2 py-1.5 text-sm text-fg sm:w-auto"
              title="Cantidad máxima de ventas"
            >
              <option value="50">Últimas 50</option>
              <option value="100">Últimas 100</option>
              <option value="200">Últimas 200</option>
              <option value="500">Últimas 500</option>
            </select>
          </div>
        </div>

        <div data-tour="ventas-table">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-raised text-xs uppercase tracking-wide text-fg-faint">
              <tr>
                {listTab === 'facturas' && facturasView === 'pendientes' && (
                  <th className="text-left p-3 w-10">
                    <input
                      type="checkbox"
                      checked={sales.length > 0 && selectedSaleIds.size === sales.length}
                      onChange={toggleSelectAllPending}
                      title="Seleccionar todas"
                    />
                  </th>
                )}
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
            <tbody className="divide-y divide-hair-soft">
              {loading ? (
                <tr>
                  <td colSpan={listTab === 'facturas' && facturasView === 'pendientes' ? 11 : 10} className="p-6"><Loader size="sm" label="Ventas" /></td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={listTab === 'facturas' && facturasView === 'pendientes' ? 11 : 10} className="p-6 text-fg-faint text-center">
                    {listTab === 'facturas' && facturasView === 'pendientes'
                      ? 'No hay ventas pendientes de facturar con estos filtros.'
                      : `No hay ventas en el período o con los filtros seleccionados${
                          selectedProduct ? ` (que incluyan "${selectedProduct.name}")` : ''
                        }.`}
                  </td>
                </tr>
              ) : (
                sales.map((s) => {
                  const itemCount = s.items?.reduce((sum, i) => sum + (i.qty ?? 0), 0) ?? 0;
                  const subtotalNum = Number(s.total ?? 0);
                  const isDuplicate = duplicateIds.has(s.id);
                  const isVoided = s.status === 'voided';
                  const isAuthorizedFactura =
                    s.fiscalDocument?.kind === 'FACTURA_C' &&
                    s.fiscalDocument.status === 'AUTHORIZED';
                  const canSelectForBatch =
                    listTab === 'facturas' &&
                    facturasView === 'pendientes' &&
                    !isVoided &&
                    (!s.fiscalDocument ||
                      s.fiscalDocument.kind === 'INTERNAL' ||
                      (s.fiscalDocument.kind === 'FACTURA_C' &&
                        (s.fiscalDocument.status === 'ERROR' || s.fiscalDocument.status === 'PENDING')));
                  return (
                    <tr key={s.id} className={isDuplicate ? 'border-l-2 border-warn/60 bg-[var(--warn-soft)]' : 'hover:bg-raised/70'}>
                      {listTab === 'facturas' && facturasView === 'pendientes' && (
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedSaleIds.has(s.id)}
                            disabled={!canSelectForBatch}
                            onChange={() => toggleSaleSelected(s.id)}
                          />
                        </td>
                      )}
                      <td className="whitespace-nowrap p-3 font-mono text-xs tabular-nums text-fg-muted">
                        {new Date(s.createdAt).toLocaleString('es-AR')}
                      </td>
                      <td className="p-3 text-xs whitespace-nowrap">
                        {isVoided ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="rounded-md border border-crit/30 bg-[var(--crit-soft)] px-2 py-1 font-medium text-crit">Anulada</span>
                            {s.fiscalDocument?.creditNoteNumber != null && (
                              <span className="font-mono text-[10px] tabular-nums text-crit">
                                NC {String(s.fiscalDocument.pointOfSale ?? 0).padStart(5, '0')}-{String(s.fiscalDocument.creditNoteNumber).padStart(8, '0')}
                              </span>
                            )}
                          </div>
                        ) : isAuthorizedFactura ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="rounded-md border border-ok/30 bg-[var(--ok-soft)] px-2 py-1 font-medium text-ok">Factura C</span>
                            {s.fiscalDocument?.pointOfSale != null && s.fiscalDocument.receiptNumber != null && (
                              <span className="font-mono text-[10px] tabular-nums text-fg-faint">
                                {String(s.fiscalDocument.pointOfSale).padStart(5, '0')}-{String(s.fiscalDocument.receiptNumber).padStart(8, '0')}
                              </span>
                            )}
                          </div>
                        ) : s.fiscalDocument?.kind === 'FACTURA_C' ? (
                          <span className="rounded-md border border-crit/30 bg-[var(--crit-soft)] px-2 py-1 font-medium text-crit">
                            {s.fiscalDocument.status === 'PENDING' ? 'Pendiente ARCA' : 'Error ARCA'}
                          </span>
                        ) : s.fiscalDocument?.kind === 'INTERNAL' ? (
                          <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 font-medium text-warn">Comprobante interno</span>
                        ) : (
                          <span className="rounded-md border border-hair bg-raised2 px-2 py-1 text-fg-muted">Sin comprobante</span>
                        )}
                        {isDuplicate && <span className="ml-1.5 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1 py-0.5">dup</span>}
                      </td>
                      <td className="p-3 text-fg">
                        {s.customer?.name ?? '—'}
                      </td>
                      <td className="p-3 text-xs text-fg-muted">
                        {s.paymentMethod ? (PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod) : '—'}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-fg-muted">{itemCount}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-fg-muted">
                        ${subtotalNum.toFixed(0)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-warn">
                        {Number(s.discount ?? 0) > 0 ? `-$${Number(s.discount).toFixed(0)}` : '—'}
                      </td>
                      <td className="p-3 text-right font-mono font-medium tabular-nums text-brand">
                        ${Number(s.totalFinal ?? 0).toFixed(0)}
                      </td>
                      <td className="p-3 text-xs text-fg-muted">
                        {saleSellerLabel(s)}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap space-x-2">
                        {!isVoided && (!s.fiscalDocument || s.fiscalDocument.kind === 'INTERNAL') && (
                          <button
                            type="button"
                            onClick={(e) => void handleFacturar(s.id, e)}
                            className="text-sm text-ok hover:underline"
                          >
                            Facturar
                          </button>
                        )}
                        {!isVoided && isAuthorizedFactura && (
                          <button
                            type="button"
                            onClick={(e) => void handleAnular(s.id, e)}
                            className="text-sm text-warn hover:underline"
                          >
                            Anular (NC)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => void handleReprint(s.id, e)}
                          className="text-sm text-brand hover:underline"
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
                        {!isVoided && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewSale(s);
                            }}
                            className="text-sm text-ok hover:underline"
                          >
                            Editar
                          </button>
                        )}
                        {!isVoided && !isAuthorizedFactura && (
                          <button
                            type="button"
                            onClick={(e) => void handleDeleteSaleFromRow(s, e)}
                            className="text-sm text-crit hover:underline"
                          >
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {loading ? <Loader size="sm" label="Ventas" /> : sales.length === 0 ? <p className="p-6 text-center text-sm text-fg-faint">{listTab === 'facturas' && facturasView === 'pendientes' ? 'No hay ventas pendientes de facturar con estos filtros.' : `No hay ventas en el período o con los filtros seleccionados${selectedProduct ? ` (que incluyan "${selectedProduct.name}")` : ''}.`}</p> : sales.map((sale) => {
            const itemCount = sale.items?.reduce((sum, item) => sum + (item.qty ?? 0), 0) ?? 0;
            const isDuplicate = duplicateIds.has(sale.id);
            const isVoided = sale.status === 'voided';
            const isAuthorizedFactura = sale.fiscalDocument?.kind === 'FACTURA_C' && sale.fiscalDocument.status === 'AUTHORIZED';
            const canSelectForBatch =
              listTab === 'facturas' &&
              facturasView === 'pendientes' &&
              !isVoided &&
              (!sale.fiscalDocument ||
                sale.fiscalDocument.kind === 'INTERNAL' ||
                (sale.fiscalDocument.kind === 'FACTURA_C' &&
                  (sale.fiscalDocument.status === 'ERROR' || sale.fiscalDocument.status === 'PENDING')));
            return <article key={sale.id} className={`rounded-xl border bg-surface p-3 ${isDuplicate ? 'border-warn/60 bg-[var(--warn-soft)]' : 'border-hair-soft'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {listTab === 'facturas' && facturasView === 'pendientes' && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedSaleIds.has(sale.id)}
                      disabled={!canSelectForBatch}
                      onChange={() => toggleSaleSelected(sale.id)}
                    />
                  )}
                  <div>
                    <p className="font-mono text-xs tabular-nums text-fg-muted">{new Date(sale.createdAt).toLocaleString('es-AR')}</p>
                    <p className="mt-1 font-semibold text-fg">{sale.customer?.name ?? 'Sin cliente'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">{isVoided ? <><span className="rounded-md border border-crit/30 bg-[var(--crit-soft)] px-2 py-1 text-xs font-medium text-crit">Anulada</span>{sale.fiscalDocument?.creditNoteNumber != null && <span className="font-mono text-[10px] text-crit">NC {String(sale.fiscalDocument.pointOfSale ?? 0).padStart(5, '0')}-{String(sale.fiscalDocument.creditNoteNumber).padStart(8, '0')}</span>}</> : isAuthorizedFactura ? <><span className="rounded-md border border-ok/30 bg-[var(--ok-soft)] px-2 py-1 text-xs font-medium text-ok">Factura C</span>{sale.fiscalDocument?.pointOfSale != null && sale.fiscalDocument.receiptNumber != null && <span className="font-mono text-[10px] text-fg-faint">{String(sale.fiscalDocument.pointOfSale).padStart(5, '0')}-{String(sale.fiscalDocument.receiptNumber).padStart(8, '0')}</span>}</> : sale.fiscalDocument?.kind === 'FACTURA_C' ? <span className="rounded-md border border-crit/30 bg-[var(--crit-soft)] px-2 py-1 text-xs text-crit">{sale.fiscalDocument.status === 'PENDING' ? 'Pendiente ARCA' : 'Error ARCA'}</span> : sale.fiscalDocument?.kind === 'INTERNAL' ? <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 text-xs text-warn">Comprobante interno</span> : <span className="rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-muted">Sin comprobante</span>}{isDuplicate && <span className="rounded border border-warn/30 bg-[var(--warn-soft)] px-1 text-[10px] text-warn">dup</span>}</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-hair-soft pt-3 text-sm"><div><span className="block text-xs text-fg-faint">Forma de pago</span><span className="text-fg-muted">{sale.paymentMethod ? (PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod) : '—'}</span></div><div><span className="block text-xs text-fg-faint">Ítems</span><span className="font-mono text-fg-muted">{itemCount}</span></div><div><span className="block text-xs text-fg-faint">Subtotal</span><span className="font-mono text-fg-muted">${Number(sale.total ?? 0).toFixed(0)}</span></div><div><span className="block text-xs text-fg-faint">Descuento</span><span className="font-mono text-warn">{Number(sale.discount ?? 0) > 0 ? `-$${Number(sale.discount).toFixed(0)}` : '—'}</span></div><div><span className="block text-xs text-fg-faint">Vendedor</span><span className="text-fg-muted">{saleSellerLabel(sale)}</span></div><div><span className="block text-xs text-fg-faint">Total</span><span className="font-mono text-lg font-semibold text-brand">${Number(sale.totalFinal ?? 0).toFixed(0)}</span></div></div>
              <div className="mt-3 flex flex-wrap justify-end gap-3 border-t border-hair-soft pt-3">{!isVoided && (!sale.fiscalDocument || sale.fiscalDocument.kind === 'INTERNAL') && <button type="button" onClick={(event) => void handleFacturar(sale.id, event)} className="text-sm text-ok">Facturar</button>}{!isVoided && isAuthorizedFactura && <button type="button" onClick={(event) => void handleAnular(sale.id, event)} className="text-sm text-warn">Anular (NC)</button>}<button type="button" onClick={(event) => void handleReprint(sale.id, event)} className="text-sm text-brand">Reimprimir</button><button type="button" onClick={() => setViewSale(sale)} className="text-sm text-brand">Detalle</button>{!isVoided && <button type="button" onClick={(event) => { event.stopPropagation(); setViewSale(sale); }} className="text-sm text-ok">Editar</button>}{!isVoided && !isAuthorizedFactura && <button type="button" onClick={(event) => void handleDeleteSaleFromRow(sale, event)} className="text-sm text-crit">Eliminar</button>}</div>
            </article>;
          })}
        </div>
        </div>

        {!loading && sales.length > 0 && (
          <div className="flex flex-wrap justify-between gap-2 border-t border-hair-soft px-4 py-2 font-mono text-sm tabular-nums text-fg-muted">
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
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-hair bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hair-soft bg-surface p-4">
              <h2 className="text-lg font-bold text-fg">
                Venta {viewSale.id.slice(-8)} · {new Date(viewSale.createdAt).toLocaleString('es-AR')}
              </h2>
              <button
                type="button"
                onClick={() => setViewSale(null)}
                className="text-2xl leading-none text-fg-muted hover:text-fg"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-6">
              {viewSale.status !== 'voided' && (
                <div className="space-y-3 rounded-xl border border-hair-soft bg-raised p-4">
                <h3 className="text-sm font-medium text-fg">Editar venta</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-fg-faint">Descuento global ($)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={saleEditDiscount}
                      onChange={(e) => setSaleEditDiscount(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-raised border border-hair text-fg"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-fg-faint">Forma de pago</span>
                    <select
                      value={saleEditPayment}
                      onChange={(e) => setSaleEditPayment(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-raised border border-hair text-fg"
                    >
                      <option value="">—</option>
                      {PAYMENT_OPTIONS.map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs text-fg-faint">Cliente (fiado / cuenta)</span>
                    <select
                      value={saleEditCustomerId}
                      onChange={(e) => setSaleEditCustomerId(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-raised border border-hair text-fg"
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
                  {(!viewSale.fiscalDocument || viewSale.fiscalDocument.kind === 'INTERNAL') && (
                    <button
                      type="button"
                      onClick={() => void handleFacturar(viewSale.id)}
                      className="px-4 py-2 rounded-lg border border-emerald-500/50 text-emerald-400 text-sm hover:bg-emerald-950/50"
                    >
                      Facturar
                    </button>
                  )}
                  {viewSale.fiscalDocument?.kind === 'FACTURA_C' && viewSale.fiscalDocument.status === 'AUTHORIZED' ? (
                    <button
                      type="button"
                      onClick={() => void handleAnular(viewSale.id)}
                      className="px-4 py-2 rounded-lg border border-orange-500/50 text-orange-400 text-sm hover:bg-orange-950/50"
                    >
                      Anular (NC)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleDeleteSale()}
                      className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 text-sm hover:bg-red-950/50"
                    >
                      Eliminar venta completa
                    </button>
                  )}
                </div>
                <p className="text-fg-faint text-xs">
                  El saldo de fiado se ajusta solo si la forma de pago es <strong className="text-fg-muted">Fiado</strong> y hay cliente. Al editar ítems, el descuento no puede superar el subtotal (se recalcula solo).
                </p>
                </div>
              )}

              <div>
                <h3 className="text-fg-muted font-medium mb-2">Ítems</h3>
                <div className="overflow-x-auto rounded-xl border border-hair-soft">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-fg-faint border-b border-hair bg-raised">
                        <th className="p-2">Producto</th>
                        <th className="p-2 text-right">Cant.</th>
                        <th className="p-2 text-right">P. unit.</th>
                        <th className="p-2 text-right">Subtotal</th>
                        <th className="p-2 text-right w-40">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--hair-soft)]">
                      {(viewSale.items ?? []).map((it) => {
                        const isEditing = editingItemId === it.id;
                        return (
                          <tr key={it.id}>
                            <td className="p-2 text-fg">
                              {it.product?.name ?? it.productName ?? 'Producto manual'}
                            </td>
                            <td className="p-2 text-right">
                              {isEditing ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={itemEditQty}
                                  onChange={(e) => setItemEditQty(e.target.value.replace(/\D/g, ''))}
                                  className="w-16 px-2 py-1 rounded bg-raised border border-hair text-right text-fg"
                                />
                              ) : (
                                <span className="text-fg-muted">{it.qty}</span>
                              )}
                            </td>
                            <td className="p-2 text-right">
                              {isEditing ? (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={itemEditPrice}
                                  onChange={(e) => setItemEditPrice(e.target.value)}
                                  className="w-24 px-2 py-1 rounded bg-raised border border-hair text-right text-fg"
                                />
                              ) : (
                                <span className="text-fg-muted">${Number(it.unitPrice ?? 0).toFixed(0)}</span>
                              )}
                            </td>
                            <td className="p-2 text-right text-fg">
                              ${Number(it.subtotal ?? 0).toFixed(0)}
                            </td>
                            <td className="p-2 text-right whitespace-nowrap">
                              {viewSale.status === 'voided' ? (
                                <span className="text-fg-faint">—</span>
                              ) : isEditing ? (
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
                                    className="text-fg-faint hover:underline text-xs"
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

              <div className="border-t border-hair pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-fg-muted">
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
    </Container>
  );
}
