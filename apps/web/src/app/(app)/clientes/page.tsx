'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, getApiBaseUrl, getToken } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';

type Customer = { id: string; name: string; phone?: string; balance: string | number };
type SaleItem = { id: string; productName?: string | null; product?: { name: string } | null; qty: number; unitPrice: string | number; subtotal: string | number };
type Sale = { id: string; createdAt: string; totalFinal: string | number; discount: string | number; paymentMethod?: string | null; items: SaleItem[] };
type Payment = { id: string; createdAt: string; amount: string | number; note?: string | null };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatMoney(v: string | number) {
  return `$${Number(v).toFixed(0)}`;
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

  // Detalle cliente
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [detailSales, setDetailSales] = useState<Sale[]>([]);
  const [detailPayments, setDetailPayments] = useState<Payment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'ventas' | 'pagos'>('ventas');

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

  const openDetail = async (customer: Customer) => {
    setDetailCustomer(customer);
    setDetailTab('ventas');
    setExpandedSaleId(null);
    setDetailSales([]);
    setDetailPayments([]);
    setDetailLoading(true);
    const token = getToken();
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [sales, payments] = await Promise.all([
        fetch(`${getApiBaseUrl()}/sales?customerId=${customer.id}&limit=100`, { headers }).then((r) => r.ok ? r.json() : []),
        fetch(`${getApiBaseUrl()}/customers/${customer.id}/payments?limit=100`, { headers }).then((r) => r.ok ? r.json() : []),
      ]);
      setDetailSales(Array.isArray(sales) ? sales : []);
      setDetailPayments(Array.isArray(payments) ? payments : []);
    } catch {
      setDetailSales([]);
      setDetailPayments([]);
    } finally {
      setDetailLoading(false);
    }
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
      setPaymentFor(null);
      setPaymentAmount('');
      setPaymentNote('');
      await loadCustomers();
      // Si el modal de detalle está abierto, refrescar
      if (detailCustomer?.id === paymentFor) {
        const updated = customers.find((c) => c.id === paymentFor);
        if (updated) await openDetail(updated);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const itemName = (item: SaleItem) =>
    item.product?.name ?? item.productName ?? 'Producto manual';

  return (
    <Container className="space-y-6">
      <PageHeader
        title="Clientes / Fiados"
        subtitle="Gestioná clientes, saldos pendientes y cobranzas."
        actions={<button type="button" onClick={() => setShowForm(!showForm)} data-tour="clientes-nuevo" className="px-4 py-2 rounded-lg btn-brand font-medium">
          {showForm ? 'Cerrar' : 'Nuevo cliente'}
        </button>}
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
        <form data-tour="clientes-form" onSubmit={handleCreate} className="max-w-md space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
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
          <button type="submit" className="px-4 py-2 rounded-lg btn-brand">Guardar</button>
        </form>
      )}

      {/* Modal registrar pago */}
      {paymentFor && (
        <form onSubmit={handlePayment} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface border border-hair-soft rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
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
              <button type="button" onClick={() => setPaymentFor(null)} className="flex-1 py-2 rounded-lg border border-hair-soft text-fg-muted">Cancelar</button>
              <button type="submit" className="flex-1 py-2 rounded-lg bg-[var(--ok-soft)] text-fg">Registrar</button>
            </div>
          </div>
        </form>
      )}

      {/* Modal detalle cliente */}
      {detailCustomer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDetailCustomer(null)}>
          <div
            className="bg-surface border border-hair-soft rounded-xl w-full max-w-2xl max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 p-5 border-b border-hair-soft">
              <div>
                <h2 className="text-xl font-bold text-fg">{detailCustomer.name}</h2>
                {detailCustomer.phone && <p className="text-fg-muted text-sm">{detailCustomer.phone}</p>}
                <p className={`text-sm font-medium mt-1 ${Number(detailCustomer.balance) > 0 ? 'text-warn' : 'text-fg-muted'}`}>
                  Saldo: {formatMoney(detailCustomer.balance)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {Number(detailCustomer.balance) > 0 && (
                  <button
                    type="button"
                    onClick={() => { setPaymentFor(detailCustomer.id); setDetailCustomer(null); }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--ok-soft)] text-fg text-sm font-medium hover:bg-[var(--ok-soft)]"
                  >
                    Registrar pago
                  </button>
                )}
                <button type="button" onClick={() => setDetailCustomer(null)} className="text-fg-muted hover:text-fg text-xl px-1">×</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-hair-soft px-5">
              <button
                type="button"
                onClick={() => setDetailTab('ventas')}
                className={`py-2.5 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${detailTab === 'ventas' ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg'}`}
              >
                Ventas al fiado {detailSales.length > 0 && `(${detailSales.length})`}
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('pagos')}
                className={`py-2.5 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${detailTab === 'pagos' ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg'}`}
              >
                Pagos {detailPayments.length > 0 && `(${detailPayments.length})`}
              </button>
            </div>

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto p-4">
              {detailLoading ? (
                <Loader size="sm" />
              ) : detailTab === 'ventas' ? (
                detailSales.length === 0 ? (
                  <p className="text-fg-faint text-sm p-4">Sin ventas registradas.</p>
                ) : (
                  <ul className="space-y-2">
                    {detailSales.map((sale) => {
                      const isOpen = expandedSaleId === sale.id;
                      return (
                        <li key={sale.id} className="rounded-lg border border-hair-soft bg-raised overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedSaleId(isOpen ? null : sale.id)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-raised2"
                          >
                            <span className="flex flex-col gap-0.5">
                              <span className="text-fg text-sm font-medium">{formatDate(sale.createdAt)}</span>
                              <span className="text-fg-faint text-xs">
                                {sale.items.length} {sale.items.length === 1 ? 'ítem' : 'ítems'}
                                {Number(sale.discount) > 0 && ` · Desc. ${formatMoney(sale.discount)}`}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-warn font-semibold">{formatMoney(sale.totalFinal)}</span>
                              <span className="text-fg-faint text-xs">{isOpen ? '▲' : '▼'}</span>
                            </span>
                          </button>
                          {isOpen && (
                            <ul className="border-t border-hair-soft divide-y divide-hair-soft/50">
                              {sale.items.map((item) => (
                                <li key={item.id} className="flex justify-between items-center px-4 py-2 text-sm">
                                  <span className="text-fg-muted flex-1 min-w-0 truncate">{itemName(item)}</span>
                                  <span className="text-fg-faint mx-3 shrink-0">×{item.qty}</span>
                                  <span className="text-fg-muted shrink-0">{formatMoney(item.subtotal)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : (
                detailPayments.length === 0 ? (
                  <p className="text-fg-faint text-sm p-4">Sin pagos registrados.</p>
                ) : (
                  <ul className="space-y-2">
                    {detailPayments.map((p) => (
                      <li key={p.id} className="flex justify-between items-center rounded-lg border border-hair-soft bg-raised px-4 py-3">
                        <span className="flex flex-col gap-0.5">
                          <span className="text-fg text-sm">{formatDate(p.createdAt)}</span>
                          {p.note && <span className="text-fg-faint text-xs">{p.note}</span>}
                        </span>
                        <span className="text-ok font-semibold">{formatMoney(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <Loader />
      ) : (
        <div data-tour="clientes-cobrar" className="overflow-x-auto rounded-xl border border-hair-soft bg-surface">
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
                  <td className={`p-3 text-right ${Number(c.balance) > 0 ? 'text-warn' : 'text-fg-muted'}`}>
                    ${Number(c.balance).toFixed(0)}
                  </td>
                  <td className="p-3 flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => openDetail(c)}
                      className="text-fg-muted hover:text-fg text-xs"
                    >
                      Ver detalle
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
      )}
    </Container>
  );
}
