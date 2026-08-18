'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlatformGate } from '@/components/admin/PlatformGate';
import { api } from '@/lib/api';
import {
  formatWhen,
  INVOICE_STATUS_LABELS,
  moneyArs,
  PLAN_STATUS_LABELS,
  TICKET_STATUSES,
} from '@/lib/support-labels';

type Detail = {
  id: string;
  name: string;
  cuit: string | null;
  address: string | null;
  createdAt: string;
  planId: string;
  planName: string;
  planStatus: string;
  billingCycle: string;
  trialEndsAt: string | null;
  planRenewsAt: string | null;
  paymentStatus: { key: string; label: string };
  lastPaidAt: string | null;
  pendingInvoice: { id: string; amount: number; planName: string; method: string | null } | null;
  invoices: Array<{
    id: string;
    planName: string;
    cycle: string;
    amount: number;
    status: string;
    createdAt: string;
    paidAt: string | null;
    method: string | null;
  }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    isPlatformAdmin: boolean;
    createdAt: string;
  }>;
  tickets: Array<{ id: string; subject: string; status: string; updatedAt: string; user: { name: string } }>;
  stats: {
    products: number;
    salesTodayCount: number;
    salesTodayAmount: number;
    salesMonthCount: number;
    salesMonthAmount: number;
    openCajas: number;
  };
  recentSales: Array<{
    id: string;
    totalFinal: number;
    paymentMethod: string | null;
    status: string;
    createdAt: string;
    user: { name: string };
  }>;
  openCajas: Array<{ id: string; openedAt: string; openingCash: number; userId: string | null }>;
};

export default function AdminBusinessDetailPage() {
  return (
    <PlatformGate>
      <DetailInner />
    </PlatformGate>
  );
}

function DetailInner() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [planStatus, setPlanStatus] = useState('');
  const [planId, setPlanId] = useState('');

  const load = () =>
    api<Detail>(`/platform/businesses/${params.id}`)
      .then((d) => {
        setData(d);
        setPlanStatus(d.planStatus);
        setPlanId(d.planId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy('');
    }
  };

  if (!data) {
    return (
      <Container>
        <PageHeader title="Cuenta" subtitle={error || 'Cargando…'} />
      </Container>
    );
  }

  return (
    <Container className="space-y-8">
      <PageHeader
        title={data.name}
        subtitle={`${data.cuit || 'Sin CUIT'} · alta ${formatWhen(data.createdAt)}`}
        actions={
          <Link href="/admin/negocios" className="rounded-lg border border-hair px-3 py-1.5 text-sm hover:bg-raised">
            Volver
          </Link>
        }
      />
      {error ? <p className="text-sm text-crit">{error}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: 'Pago', v: data.paymentStatus.label },
          { l: 'Plan', v: `${data.planName} · ${data.billingCycle === 'yearly' ? 'anual' : 'mensual'}` },
          { l: 'Ventas hoy', v: `${moneyArs(data.stats.salesTodayAmount)} (${data.stats.salesTodayCount})` },
          { l: 'Ventas del mes', v: `${moneyArs(data.stats.salesMonthAmount)} (${data.stats.salesMonthCount})` },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border border-hair-soft bg-surface p-4">
            <p className="text-xs uppercase text-fg-faint">{c.l}</p>
            <p className="mt-1 font-semibold">{c.v}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="font-semibold">Plan y pago</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Estado interno: {PLAN_STATUS_LABELS[data.planStatus] || data.planStatus}. Último pago:{' '}
          {formatWhen(data.lastPaidAt)}. Renueva: {formatWhen(data.planRenewsAt)}.
        </p>
        {data.pendingInvoice ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-sm text-warn">
            <span>
              Pendiente {data.pendingInvoice.planName} · {moneyArs(data.pendingInvoice.amount)} ·{' '}
              {data.pendingInvoice.method || 'sin medio'}
            </span>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => act('paid', () => api(`/platform/invoices/${data.pendingInvoice!.id}/mark-paid`, { method: 'POST', body: '{}' }))}
              className="btn-brand rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-50"
            >
              {busy === 'paid' ? 'Confirmando…' : 'Marcar pagado'}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => act('void', () => api(`/platform/invoices/${data.pendingInvoice!.id}/void`, { method: 'POST', body: '{}' }))}
              className="rounded-lg border border-hair px-3 py-1 text-xs disabled:opacity-50"
            >
              Anular
            </button>
          </div>
        ) : null}
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act('plan', () =>
              api(`/platform/businesses/${data.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ planId, planStatus }),
              }),
            );
          }}
        >
          <label className="text-sm">
            Plan
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="mt-1 block rounded-lg border border-hair-soft bg-raised px-3 py-2">
              <option value="mostrador">Mostrador</option>
              <option value="kiosco">Fiscal</option>
              <option value="red">Pro</option>
            </select>
          </label>
          <label className="text-sm">
            Estado
            <select value={planStatus} onChange={(e) => setPlanStatus(e.target.value)} className="mt-1 block rounded-lg border border-hair-soft bg-raised px-3 py-2">
              <option value="trial">Prueba</option>
              <option value="active">Activo</option>
              <option value="complimentary">Cortesía (nunca se cobra)</option>
              <option value="pending_payment">Pago pendiente</option>
              <option value="past_due">Pago vencido</option>
              <option value="canceled">Cancelado</option>
            </select>
          </label>
          <button type="submit" disabled={!!busy} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            Guardar
          </button>
          {planStatus === 'complimentary' ? (
            <p className="w-full text-xs text-fg-faint">Cortesía: el kiosco usa el plan elegido sin pagar. Se anulan comprobantes pendientes y no puede contratar solo.</p>
          ) : null}
        </form>
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="mb-3 font-semibold">Usuarios</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase text-fg-faint">
              <tr>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Rol</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-t border-hair-soft">
                  <td className="py-2 pr-3">{u.name}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{u.email}</td>
                  <td className="py-2 pr-3">{u.role}</td>
                  <td className="py-2">{u.isActive ? 'Activo' : 'Baja'}{u.isPlatformAdmin ? ' · admin plataforma' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="mb-3 font-semibold">Últimos movimientos (ventas)</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Productos: {data.stats.products.toLocaleString('es-AR')} · Cajas abiertas: {data.stats.openCajas}
        </p>
        {data.openCajas.length ? (
          <ul className="mb-4 space-y-1 text-sm">
            {data.openCajas.map((c) => (
              <li key={c.id}>
                Caja abierta desde {formatWhen(c.openedAt)} · apertura {moneyArs(c.openingCash)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase text-fg-faint">
              <tr>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Cajero</th>
                <th className="py-2 pr-3">Medio</th>
                <th className="py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSales.map((s) => (
                <tr key={s.id} className="border-t border-hair-soft">
                  <td className="py-2 pr-3">{formatWhen(s.createdAt)}</td>
                  <td className="py-2 pr-3">{s.user.name}</td>
                  <td className="py-2 pr-3">{s.paymentMethod || '—'} · {s.status}</td>
                  <td className="py-2 text-right font-mono">{moneyArs(s.totalFinal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recentSales.length === 0 ? <p className="py-3 text-sm text-fg-muted">Todavía no hay ventas.</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="mb-3 font-semibold">Comprobantes del abono</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase text-fg-faint">
              <tr>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">Importe</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-hair-soft">
                  <td className="py-2 pr-3">{formatWhen(inv.createdAt)}</td>
                  <td className="py-2 pr-3">{inv.planName} · {inv.cycle}</td>
                  <td className="py-2 pr-3 font-mono">{moneyArs(inv.amount)}</td>
                  <td className="py-2">
                    {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                    {inv.status === 'pending' ? (
                      <button
                        type="button"
                        className="ml-2 text-xs text-brand hover:underline"
                        onClick={() => act(inv.id, () => api(`/platform/invoices/${inv.id}/mark-paid`, { method: 'POST', body: '{}' }))}
                      >
                        Marcar pagado
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="mb-3 font-semibold">Tickets</h2>
        {data.tickets.length === 0 ? (
          <p className="text-sm text-fg-muted">Esta cuenta no abrió tickets.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/tickets/${t.id}`} className="hover:underline">
                  {t.subject}
                </Link>
                <span className="text-fg-muted">
                  {' '}
                  · {TICKET_STATUSES[t.status] || t.status} · {t.user.name} · {formatWhen(t.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
