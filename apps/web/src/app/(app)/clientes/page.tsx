'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, getApiBaseUrl, getToken } from '@/lib/api';
import { getPublicCuentaCorrienteUrl } from '@/lib/env-urls';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { confirmInvoiceAlertIfNeeded } from '@/lib/invoice-alert';

type Customer = {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  balance: string | number;
  shareToken?: string | null;
};
type SaleItem = {
  id: string;
  productName?: string | null;
  product?: { name: string } | null;
  qty: number;
  unitPrice: string | number;
  subtotal: string | number;
};
type FiscalDoc = {
  kind?: string;
  status?: string;
  receiptNumber?: number | null;
  pointOfSale?: number | null;
  errorMessage?: string | null;
};
type Sale = {
  id: string;
  createdAt: string;
  totalFinal: string | number;
  discount: string | number;
  paymentMethod?: string | null;
  status?: string;
  items: SaleItem[];
  fiscalDocument?: FiscalDoc | null;
};
type Payment = { id: string; createdAt: string; amount: string | number; note?: string | null };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatMoney(v: string | number) {
  return `$${Number(v).toFixed(0)}`;
}

function invoiceLabel(doc?: FiscalDoc | null) {
  if (!doc) return 'Sin facturar';
  if (doc.kind === 'FACTURA_C' && doc.status === 'AUTHORIZED') {
    return `Factura C ${doc.pointOfSale ?? ''}-${doc.receiptNumber ?? ''}`;
  }
  if (doc.kind === 'FACTURA_C' && doc.status === 'ERROR') return 'Factura con error';
  if (doc.kind === 'FACTURA_C') return 'Factura pendiente';
  return 'Comprobante interno';
}

function canFacturar(sale: Sale) {
  if (sale.status === 'voided') return false;
  const doc = sale.fiscalDocument;
  if (!doc) return true;
  if (doc.kind === 'INTERNAL') return true;
  if (doc.kind === 'FACTURA_C' && doc.status !== 'AUTHORIZED') return true;
  return false;
}

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [morosos, setMorosos] = useState<Customer[]>([]);
  const [totalFiado, setTotalFiado] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [paymentFor, setPaymentFor] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [detailSales, setDetailSales] = useState<Sale[]>([]);
  const [detailPayments, setDetailPayments] = useState<Payment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'ventas' | 'pagos' | 'todo'>('ventas');
  const [busyAction, setBusyAction] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState('');
  const [shareErr, setShareErr] = useState('');
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [editDiscount, setEditDiscount] = useState('');

  const loadCustomers = useCallback(async () => {
    const [c, m, t] = await Promise.all([
      api<Customer[]>('/customers'),
      api<Customer[]>('/customers/morosos'),
      api<number>('/customers/total-fiado'),
    ]);
    setCustomers(c);
    setMorosos(m);
    setTotalFiado(Number(t));
  }, []);

  useEffect(() => {
    loadCustomers().catch(() => []).finally(() => setLoading(false));
  }, [loadCustomers]);

  const refreshDetail = async (customer: Customer) => {
    setDetailLoading(true);
    const token = getToken();
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [sales, payments] = await Promise.all([
        fetch(`${getApiBaseUrl()}/sales?customerId=${customer.id}&limit=100`, { headers }).then((r) =>
          r.ok ? r.json() : [],
        ),
        fetch(`${getApiBaseUrl()}/customers/${customer.id}/payments?limit=100`, { headers }).then((r) =>
          r.ok ? r.json() : [],
        ),
      ]);
      setDetailSales(Array.isArray(sales) ? sales : []);
      setDetailPayments(Array.isArray(payments) ? payments : []);
      const fresh = await api<Customer[]>('/customers');
      const updated = fresh.find((x) => x.id === customer.id) || customer;
      setDetailCustomer(updated);
      setCustomers(fresh);
    } catch {
      setDetailSales([]);
      setDetailPayments([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = async (customer: Customer) => {
    setDetailCustomer(customer);
    setExpandedSaleId(null);
    setDetailTab('ventas');
    setShareUrl(null);
    setShareMsg('');
    setShareErr('');
    setDetailSales([]);
    setDetailPayments([]);
    await refreshDetail(customer);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/customers', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, phone: form.phone || undefined, notes: form.notes || undefined }),
      });
      setForm({ name: '', phone: '', notes: '' });
      setShowForm(false);
      await loadCustomers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentFor) return;
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) return;
    try {
      await api(`/customers/${paymentFor}/payment`, {
        method: 'POST',
        body: JSON.stringify({ amount, note: paymentNote || undefined }),
      });
      const paidFor = paymentFor;
      setPaymentFor(null);
      setPaymentAmount('');
      setPaymentNote('');
      await loadCustomers();
      if (detailCustomer?.id === paidFor) {
        const updated = (await api<Customer[]>('/customers')).find((c) => c.id === paidFor);
        if (updated) await refreshDetail(updated);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const itemName = (item: SaleItem) => item.product?.name ?? item.productName ?? 'Producto manual';

  const movements = useMemo(() => {
    const charges = detailSales
      .filter((s) => s.paymentMethod === 'fiado' && s.status !== 'voided')
      .map((s) => ({ id: `sale-${s.id}`, kind: 'cargo' as const, date: s.createdAt, amount: Number(s.totalFinal), sale: s }));
    const pays = detailPayments.map((p) => ({
      id: `pay-${p.id}`,
      kind: 'pago' as const,
      date: p.createdAt,
      amount: Number(p.amount),
      payment: p,
    }));
    const all = [...charges, ...pays].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let run = 0;
    return all
      .map((m) => {
        run += m.kind === 'cargo' ? m.amount : -m.amount;
        return { ...m, balanceAfter: run };
      })
      .reverse();
  }, [detailSales, detailPayments]);

  const pendingFacturaSales = useMemo(
    () => detailSales.filter((s) => s.paymentMethod === 'fiado' && canFacturar(s)),
    [detailSales],
  );
  const pendingFacturaTotal = pendingFacturaSales.reduce((s, x) => s + Number(x.totalFinal), 0);

  const fiadoSales = useMemo(
    () =>
      detailSales
        .filter((s) => s.paymentMethod === 'fiado' && s.status !== 'voided')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [detailSales],
  );
  const fiadoTotal = fiadoSales.reduce((s, x) => s + Number(x.totalFinal), 0);
  const pagosTotal = detailPayments.reduce((s, x) => s + Number(x.amount), 0);

  const handleDeleteSale = async (sale: Sale) => {
    if (!confirm(`¿Eliminar esta venta de ${formatMoney(sale.totalFinal)}? Se revierte stock y saldo.`)) return;
    setBusyAction(`del-${sale.id}`);
    try {
      await api(`/sales/${sale.id}`, { method: 'DELETE' });
      if (detailCustomer) await refreshDetail(detailCustomer);
      await loadCustomers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar');
    } finally {
      setBusyAction('');
    }
  };

  const handleSaveEditSale = async () => {
    if (!editSale || !detailCustomer) return;
    const discount = Number(editDiscount);
    if (!Number.isFinite(discount) || discount < 0) {
      alert('Descuento inválido');
      return;
    }
    setBusyAction(`edit-${editSale.id}`);
    try {
      await api(`/sales/${editSale.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ discount }),
      });
      setEditSale(null);
      await refreshDetail(detailCustomer);
      await loadCustomers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo editar');
    } finally {
      setBusyAction('');
    }
  };

  const handleFacturarSale = async (sale: Sale) => {
    const okAlert = await confirmInvoiceAlertIfNeeded(Number(sale.totalFinal));
    if (!okAlert) return;
    if (!confirm(`¿Facturar esta venta de ${formatMoney(sale.totalFinal)}?`)) return;
    setBusyAction(`fac-${sale.id}`);
    try {
      const doc = await api<FiscalDoc>(`/fiscal/sales/${sale.id}/factura`, { method: 'POST' });
      if (doc.status === 'ERROR') {
        alert(doc.errorMessage || 'ARCA no autorizó la factura. La venta sigue en cuenta corriente.');
      }
      if (detailCustomer) await refreshDetail(detailCustomer);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo facturar');
    } finally {
      setBusyAction('');
    }
  };

  const handleFacturarPendientes = async () => {
    if (!pendingFacturaSales.length) {
      alert('No hay ventas pendientes de facturar.');
      return;
    }
    const okAlert = await confirmInvoiceAlertIfNeeded(pendingFacturaTotal);
    if (!okAlert) return;
    if (
      !confirm(
        `¿Facturar ${pendingFacturaSales.length} venta(s) pendientes por ${formatMoney(pendingFacturaTotal)}?`,
      )
    ) {
      return;
    }
    setBusyAction('fac-all');
    try {
      const result = await api<{
        authorized: number;
        errors: number;
        results: { saleId: string; status: string; errorMessage: string | null }[];
      }>('/fiscal/invoices/batch', {
        method: 'POST',
        body: JSON.stringify({ saleIds: pendingFacturaSales.map((s) => s.id) }),
      });
      const samples = result.results
        .filter((r) => r.status !== 'AUTHORIZED')
        .slice(0, 3)
        .map((r) => r.errorMessage || r.status)
        .join(' · ');
      alert(
        `Listo: ${result.authorized} autorizada(s)${result.errors ? `, ${result.errors} con error` : ''}.${
          samples ? `\n${samples}` : ''
        }`,
      );
      if (detailCustomer) await refreshDetail(detailCustomer);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo facturar el lote');
    } finally {
      setBusyAction('');
    }
  };

  const handleShareLink = async (regenerate = false) => {
    if (!detailCustomer) return;
    setBusyAction('share');
    setShareMsg('');
    setShareErr('');
    try {
      const data = await api<{ shareToken: string }>(`/customers/${detailCustomer.id}/share-link`, {
        method: 'POST',
        body: JSON.stringify({ regenerate }),
      });
      const url = getPublicCuentaCorrienteUrl(data.shareToken);
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg('Link copiado. El cliente puede ver su saldo y movimientos (solo lectura, sin vencimiento).');
      } catch {
        setShareMsg('Link listo. Copialo y mandáselo al cliente por WhatsApp.');
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'No se pudo generar el link';
      if (/cannot post|not found|404/i.test(raw)) {
        setShareErr('La API todavía no tiene este endpoint activo. En unos minutos, tras el redeploy, volvé a intentar.');
      } else {
        setShareErr(raw);
      }
    } finally {
      setBusyAction('');
    }
  };

  return (
    <Container className="space-y-6">
      <PageHeader
        title="Clientes / Cuenta corriente"
        subtitle="Saldos, detalle de ventas, facturación y link para que el cliente consulte su cuenta."
        actions={
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            data-tour="clientes-nuevo"
            className="px-4 py-2 rounded-lg btn-brand font-medium"
          >
            {showForm ? 'Cerrar' : 'Nuevo cliente'}
          </button>
        }
      />

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-warn/30 bg-[var(--warn-soft)] p-4">
          <h3 className="text-warn font-medium">Morosos ({morosos.length})</h3>
          <p className="text-sm text-fg-muted">Clientes con saldo pendiente</p>
        </div>
        <div data-tour="clientes-total" className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
          <h3 className="text-fg font-medium">Saldo total fiado</h3>
          <p className="text-2xl font-bold text-fg">${totalFiado.toFixed(0)}</p>
        </div>
      </div>

      {showForm && (
        <form
          data-tour="clientes-form"
          onSubmit={handleCreate}
          className="max-w-md space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5"
        >
          <input
            type="text"
            placeholder="Nombre *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
            required
          />
          <input
            type="text"
            placeholder="Teléfono"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
          />
          <input
            type="text"
            placeholder="Notas"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
          />
          <button type="submit" className="px-4 py-2 rounded-lg btn-brand">
            Guardar
          </button>
        </form>
      )}

      {paymentFor && (
        <form onSubmit={handlePayment} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div
            className="bg-surface border border-hair-soft rounded-xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-fg mb-4">Registrar pago</h3>
            <input
              type="number"
              step="0.01"
              placeholder="Monto"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg mb-2"
              autoFocus
            />
            <input
              type="text"
              placeholder="Nota"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentFor(null)}
                className="flex-1 py-2 rounded-lg border border-hair-soft text-fg-muted"
              >
                Cancelar
              </button>
              <button type="submit" className="flex-1 py-2 rounded-lg bg-[var(--ok-soft)] text-fg">
                Registrar
              </button>
            </div>
          </div>
        </form>
      )}

      {editSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-hair bg-surface p-5">
            <h3 className="text-lg font-bold text-fg mb-1">Editar venta</h3>
            <p className="text-sm text-fg-muted mb-4">
              {formatDate(editSale.createdAt)} · Total actual {formatMoney(editSale.totalFinal)}
            </p>
            <label className="block text-xs text-fg-faint mb-1">Descuento ($)</label>
            <input
              type="number"
              step="0.01"
              value={editDiscount}
              onChange={(e) => setEditDiscount(e.target.value)}
              className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg mb-4"
            />
            <p className="text-xs text-fg-faint mb-4">
              El saldo de cuenta corriente y las estadísticas se recalculan. Para ítems, usá Historial de ventas.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditSale(null)}
                className="flex-1 rounded-lg border border-hair py-2 text-fg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busyAction.startsWith('edit')}
                onClick={() => void handleSaveEditSale()}
                className="flex-1 rounded-lg btn-brand py-2 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {detailCustomer && (
        <div className="fixed inset-0 z-50 flex bg-black/70 p-0 sm:items-center sm:justify-center sm:p-4">
          <div
            className="flex h-full w-full max-w-5xl flex-col bg-surface sm:h-[min(94dvh,920px)] sm:rounded-2xl sm:border sm:border-hair"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="shrink-0 border-b border-hair-soft px-4 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-fg-faint">Cuenta corriente</p>
                  <h2 className="truncate text-2xl font-bold text-fg">{detailCustomer.name}</h2>
                  {detailCustomer.phone && <p className="text-sm text-fg-muted">{detailCustomer.phone}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailCustomer(null)}
                  className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted hover:bg-raised"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-warn/30 bg-[var(--warn-soft)] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-warn/80">Saldo actual</p>
                  <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-warn">
                    {Number(detailCustomer.balance) === 0
                      ? 'Al día'
                      : formatMoney(Math.abs(Number(detailCustomer.balance)))}
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {Number(detailCustomer.balance) > 0
                      ? 'Lo que debe el cliente'
                      : Number(detailCustomer.balance) < 0
                        ? 'Saldo a favor del cliente'
                        : 'Sin deuda'}
                  </p>
                </div>
                <div className="rounded-xl border border-hair-soft bg-raised px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-fg-faint">Ventas a cuenta</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-fg">{formatMoney(fiadoTotal)}</p>
                  <p className="mt-1 text-xs text-fg-muted">{fiadoSales.length} venta{fiadoSales.length === 1 ? '' : 's'}</p>
                </div>
                <div className="rounded-xl border border-hair-soft bg-raised px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-fg-faint">Pagos recibidos</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ok">{formatMoney(pagosTotal)}</p>
                  <p className="mt-1 text-xs text-fg-muted">{detailPayments.length} pago{detailPayments.length === 1 ? '' : 's'}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentFor(detailCustomer.id)}
                  className="rounded-lg bg-[var(--ok-soft)] px-4 py-2.5 text-sm font-semibold text-ok hover:brightness-110"
                >
                  Registrar pago
                </button>
                {pendingFacturaSales.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleFacturarPendientes()}
                    disabled={busyAction === 'fac-all'}
                    className="rounded-lg border border-ok/40 bg-surface px-4 py-2.5 text-sm font-semibold text-ok disabled:opacity-50"
                  >
                    Facturar pendientes ({pendingFacturaSales.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleShareLink(false)}
                  disabled={busyAction === 'share'}
                  className="rounded-lg btn-brand px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {busyAction === 'share' ? 'Generando…' : 'Compartir link con el cliente'}
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-hair-soft bg-raised/70 px-4 py-3">
                <p className="text-sm font-medium text-fg">Link para que el cliente vea su cuenta</p>
                <p className="mt-1 text-xs text-fg-muted">
                  Solo lectura, sin vencimiento. Ideal para mandar por WhatsApp.
                </p>
                {shareMsg && <p className="mt-2 text-sm text-ok">{shareMsg}</p>}
                {shareErr && <p className="mt-2 text-sm text-crit">{shareErr}</p>}
                {shareUrl && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={shareUrl}
                      className="min-w-0 flex-1 rounded-lg border border-hair bg-surface px-3 py-2 font-mono text-xs text-fg"
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-hair px-3 py-2 text-xs text-fg hover:bg-raised2"
                      onClick={() => void navigator.clipboard.writeText(shareUrl)}
                    >
                      Copiar
                    </button>
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-hair px-3 py-2 text-xs text-brand hover:bg-raised2"
                    >
                      Abrir
                    </a>
                    <button
                      type="button"
                      className="rounded-lg border border-hair px-3 py-2 text-xs text-warn hover:bg-raised2"
                      onClick={() => void handleShareLink(true)}
                    >
                      Regenerar
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 gap-1 border-b border-hair-soft px-4 pt-3 sm:px-6">
              {(
                [
                  ['ventas', `Ventas a cuenta (${fiadoSales.length})`],
                  ['pagos', `Pagos (${detailPayments.length})`],
                  ['todo', 'Historimiento'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDetailTab(id)}
                  className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
                    detailTab === id
                      ? 'bg-raised text-fg border border-b-0 border-hair-soft'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {detailLoading ? (
                <Loader size="sm" />
              ) : detailTab === 'ventas' ? (
                fiadoSales.length === 0 ? (
                  <p className="py-10 text-center text-sm text-fg-faint">Todavía no hay ventas a cuenta corriente.</p>
                ) : (
                  <ul className="space-y-3">
                    {fiadoSales.map((sale) => {
                      const isOpen = expandedSaleId === sale.id;
                      const facturable = canFacturar(sale);
                      const preview = sale.items.slice(0, isOpen ? sale.items.length : 3);
                      return (
                        <li key={sale.id} className="rounded-xl border border-hair-soft bg-raised overflow-hidden">
                          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-fg">
                                Venta · {formatDate(sale.createdAt)}
                              </p>
                              <p className="mt-0.5 text-xs text-fg-faint">
                                {sale.items.length} ítem{sale.items.length === 1 ? '' : 's'}
                                {Number(sale.discount) > 0 ? ` · Desc. ${formatMoney(sale.discount)}` : ''}
                                {` · ${invoiceLabel(sale.fiscalDocument)}`}
                              </p>
                            </div>
                            <p className="font-mono text-xl font-bold tabular-nums text-warn">
                              {formatMoney(sale.totalFinal)}
                            </p>
                          </div>

                          <ul className="border-t border-hair-soft divide-y divide-hair-soft/60 bg-surface/40">
                            {preview.map((item) => (
                              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                                <span className="min-w-0 flex-1 truncate text-fg">{itemName(item)}</span>
                                <span className="shrink-0 text-fg-faint">×{item.qty}</span>
                                <span className="shrink-0 font-mono tabular-nums text-fg-muted w-20 text-right">
                                  {formatMoney(item.subtotal)}
                                </span>
                              </li>
                            ))}
                            {!isOpen && sale.items.length > 3 && (
                              <li className="px-4 py-2 text-xs text-fg-faint">
                                +{sale.items.length - 3} ítems más…
                              </li>
                            )}
                          </ul>

                          <div className="flex flex-wrap items-center gap-2 border-t border-hair-soft px-4 py-3">
                            {sale.items.length > 3 && (
                              <button
                                type="button"
                                className="rounded-md border border-hair px-2.5 py-1.5 text-xs text-fg-muted hover:bg-raised2"
                                onClick={() => setExpandedSaleId(isOpen ? null : sale.id)}
                              >
                                {isOpen ? 'Ver menos' : 'Ver todos los ítems'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded-md border border-hair px-2.5 py-1.5 text-xs text-fg hover:bg-raised2"
                              onClick={() => {
                                setEditSale(sale);
                                setEditDiscount(String(Number(sale.discount) || 0));
                              }}
                            >
                              Editar
                            </button>
                            {facturable && (
                              <button
                                type="button"
                                disabled={busyAction === `fac-${sale.id}`}
                                className="rounded-md border border-ok/40 bg-[var(--ok-soft)] px-2.5 py-1.5 text-xs text-ok disabled:opacity-50"
                                onClick={() => void handleFacturarSale(sale)}
                              >
                                Facturar
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyAction === `del-${sale.id}`}
                              className="rounded-md border border-crit/30 px-2.5 py-1.5 text-xs text-crit disabled:opacity-50"
                              onClick={() => void handleDeleteSale(sale)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : detailTab === 'pagos' ? (
                detailPayments.length === 0 ? (
                  <p className="py-10 text-center text-sm text-fg-faint">Todavía no hay pagos registrados.</p>
                ) : (
                  <ul className="space-y-2">
                    {[...detailPayments]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ok)]/25 bg-[var(--ok-soft)] px-4 py-3"
                        >
                          <span>
                            <span className="block text-sm font-medium text-fg">Pago recibido</span>
                            <span className="text-xs text-fg-faint">
                              {formatDate(p.createdAt)}
                              {p.note ? ` · ${p.note}` : ''}
                            </span>
                          </span>
                          <span className="font-mono text-lg font-semibold tabular-nums text-ok">
                            −{formatMoney(p.amount)}
                          </span>
                        </li>
                      ))}
                  </ul>
                )
              ) : movements.length === 0 ? (
                <p className="py-10 text-center text-sm text-fg-faint">Sin movimientos.</p>
              ) : (
                <ul className="space-y-2">
                  {movements.map((m) =>
                    m.kind === 'pago' ? (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--ok)]/25 bg-[var(--ok-soft)] px-4 py-3"
                      >
                        <span className="text-sm text-fg">
                          Pago · {formatDate(m.date)}
                          {m.payment.note ? ` · ${m.payment.note}` : ''}
                        </span>
                        <span className="text-right">
                          <span className="block font-mono font-semibold text-ok">−{formatMoney(m.amount)}</span>
                          <span className="font-mono text-xs text-fg-faint">Saldo {formatMoney(m.balanceAfter)}</span>
                        </span>
                      </li>
                    ) : (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-hair-soft bg-raised px-4 py-3"
                      >
                        <span className="text-sm text-fg">
                          Venta · {formatDate(m.date)} · {m.sale.items.length} ítems · {invoiceLabel(m.sale.fiscalDocument)}
                        </span>
                        <span className="text-right">
                          <span className="block font-mono font-semibold text-warn">+{formatMoney(m.amount)}</span>
                          <span className="font-mono text-xs text-fg-faint">Saldo {formatMoney(m.balanceAfter)}</span>
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <Loader />
      ) : (
        <div data-tour="clientes-cobrar">
          <div className="hidden overflow-x-auto rounded-xl border border-hair-soft bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-raised text-fg-muted">
                <tr>
                  <th className="text-left p-3">Nombre</th>
                  <th className="text-left p-3">Teléfono</th>
                  <th className="text-right p-3 font-mono tabular-nums">Saldo</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-soft">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-raised">
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => openDetail(c)}
                        className="text-fg hover:text-fg hover:underline text-left"
                      >
                        {c.name}
                      </button>
                    </td>
                    <td className="p-3 text-fg-muted">{c.phone || '-'}</td>
                    <td
                      className={`p-3 text-right ${Number(c.balance) > 0 ? 'text-warn' : 'text-fg-muted'}`}
                    >
                      ${Number(c.balance).toFixed(0)}
                    </td>
                    <td className="p-3 flex gap-3 justify-end">
                      <button
                        type="button"
                        onClick={() => openDetail(c)}
                        className="text-fg-muted hover:text-fg text-xs"
                      >
                        Ver cuenta
                      </button>
                      {Number(c.balance) > 0 && (
                        <button
                          type="button"
                          onClick={() => setPaymentFor(c.id)}
                          className="text-ok hover:underline text-xs"
                        >
                          Registrar pago
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {customers.map((customer) => (
              <article key={customer.id} className="rounded-xl border border-hair-soft bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => openDetail(customer)}
                    className="min-w-0 text-left font-semibold text-fg hover:underline"
                  >
                    {customer.name}
                  </button>
                  <span
                    className={`shrink-0 font-mono font-semibold tabular-nums ${
                      Number(customer.balance) > 0 ? 'text-warn' : 'text-fg-muted'
                    }`}
                  >
                    ${Number(customer.balance).toFixed(0)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-fg-muted">{customer.phone || 'Sin teléfono'}</p>
                <div className="mt-3 flex flex-wrap justify-end gap-3 border-t border-hair-soft pt-3">
                  <button type="button" onClick={() => openDetail(customer)} className="text-sm text-brand">
                    Ver cuenta
                  </button>
                  {Number(customer.balance) > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentFor(customer.id)}
                      className="text-sm text-ok"
                    >
                      Registrar pago
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}
