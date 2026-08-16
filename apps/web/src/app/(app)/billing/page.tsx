'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import {
  formatPlanPrice,
  PLAN_CATALOG,
  type BillingCycle,
  yearlyEquivalentMonthly,
} from '@/lib/plans';
import { useBilling, type BillingInvoice } from '@/components/billing/BillingProvider';

function statusLabel(status: string, trialActive: boolean) {
  if (trialActive) return 'Prueba de 14 días';
  if (status === 'active') return 'Activo';
  if (status === 'pending_payment') return 'Esperando el pago';
  if (status === 'past_due') return 'Pago vencido';
  if (status === 'canceled') return 'Cancelado';
  if (status === 'trial') return 'Prueba';
  return status;
}

function InvoiceRow({ inv }: { inv: BillingInvoice }) {
  const paid = inv.status === 'paid';
  return (
    <tr className="border-t border-hair-soft">
      <td className="py-2.5 pr-3 text-sm">{new Date(inv.createdAt).toLocaleDateString('es-AR')}</td>
      <td className="py-2.5 pr-3 text-sm">{inv.planName}</td>
      <td className="py-2.5 pr-3 text-sm">{inv.cycle === 'yearly' ? 'Anual' : 'Mensual'}</td>
      <td className="py-2.5 pr-3 text-right font-mono text-sm">{formatPlanPrice(inv.amount)}</td>
      <td className="py-2.5 text-right text-sm text-fg-muted">
        {paid ? 'Pagado' : inv.status === 'void' ? 'Anulado' : inv.status === 'failed' ? 'Falló' : 'Pendiente'}
      </td>
    </tr>
  );
}

function BillingInner() {
  const params = useSearchParams();
  const mp = params.get('mp');
  const { data, loading, refresh } = useBilling();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const subscribe = async (planId: string, method: 'mercadopago' | 'transfer') => {
    setBusy(planId + method);
    setError('');
    setMessage('');
    try {
      const res = await api<{ checkoutUrl?: string | null; message: string }>('/billing/subscribe', {
        method: 'POST',
        body: JSON.stringify({ planId, cycle, method }),
      });
      await refresh();
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo contratar');
    } finally {
      setBusy(null);
    }
  };

  if (loading || !data) {
    return (
      <Container>
        <PageHeader title="Plan y facturación" subtitle="Cargando tu plan…" />
      </Container>
    );
  }

  const trialLeft = data.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(data.trialEndsAt).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <Container className="space-y-8">
      <PageHeader
        title="Plan y facturación"
        subtitle="Mostrador es el kiosco. Fiscal suma AFIP. Pro trae las listas de los mayoristas y la IA."
      />

      {mp === 'success' ? (
        <p className="rounded-xl border border-hair-soft bg-[var(--ok-soft)] px-4 py-3 text-sm text-ok">
          Mercado Pago devolvió el pago. En unos minutos se confirma solo; si no, avisanos.
        </p>
      ) : null}
      {mp === 'failure' ? (
        <p className="rounded-xl border border-hair-soft bg-[var(--crit-soft)] px-4 py-3 text-sm text-crit">
          El pago en Mercado Pago no se completó. Podés reintentar o transferir.
        </p>
      ) : null}
      {mp === 'pending' ? (
        <p className="rounded-xl border border-hair-soft bg-[var(--warn-soft)] px-4 py-3 text-sm text-warn">
          Mercado Pago dejó el pago en revisión. Cuando acredite, el plan queda activo.
        </p>
      ) : null}

      <section data-tour="billing-info" className="rounded-xl border border-hair-soft bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Plan actual</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h2 className="text-2xl font-semibold">{data.plan.name}</h2>
          <span className="text-sm text-fg-muted">{statusLabel(data.status, data.trialActive)}</span>
        </div>
        <p className="mt-2 text-sm text-fg-muted">{data.plan.description}</p>
        {data.trialActive ? (
          <p className="mt-3 text-sm">
            Te quedan <strong>{trialLeft} día{trialLeft === 1 ? '' : 's'}</strong> de prueba
            {data.trialEndsAt ? ` (hasta el ${new Date(data.trialEndsAt).toLocaleDateString('es-AR')})` : ''}.
          </p>
        ) : null}
        {data.status === 'pending_payment' ? (
          <p className="mt-3 text-sm text-warn">Hay un pago pendiente. El plan ya está reservado; falta que acredite.</p>
        ) : null}
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-fg-faint">Usuarios</dt>
            <dd className="font-mono">
              {data.usage.users}
              {data.limits.maxUsers != null ? ` / ${data.limits.maxUsers}` : ' · sin tope'}
            </dd>
          </div>
          <div>
            <dt className="text-fg-faint">Productos</dt>
            <dd className="font-mono">
              {data.usage.products.toLocaleString('es-AR')}
              {data.limits.maxProducts != null ? ` / ${data.limits.maxProducts.toLocaleString('es-AR')}` : ' · sin tope'}
            </dd>
          </div>
          <div>
            <dt className="text-fg-faint">Syncs de mayorista</dt>
            <dd className="font-mono">
              {data.usage.syncProviders}
              {data.limits.maxSyncProviders === 0
                ? ' · no incluido'
                : data.limits.maxSyncProviders != null
                  ? ` / ${data.limits.maxSyncProviders}`
                  : ' · sin tope'}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Cambiar de plan</h3>
          <div className="inline-flex rounded-lg border border-hair p-1 text-sm">
            <button type="button" onClick={() => setCycle('monthly')} className={`rounded-md px-3 py-1.5 ${cycle === 'monthly' ? 'bg-raised text-fg' : 'text-fg-muted'}`}>
              Mensual
            </button>
            <button type="button" onClick={() => setCycle('yearly')} className={`rounded-md px-3 py-1.5 ${cycle === 'yearly' ? 'bg-raised text-fg' : 'text-fg-muted'}`}>
              Anual (2 meses off)
            </button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLAN_CATALOG.map((plan) => {
            const price = cycle === 'yearly' ? yearlyEquivalentMonthly(plan) : plan.monthlyPrice;
            const current = plan.id === data.planId;
            return (
              <article key={plan.id} className={`flex flex-col rounded-xl border bg-surface p-5 ${current ? 'border-[color:var(--brand-accent)]' : 'border-hair-soft'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-xl font-semibold">{plan.name}</h4>
                  {current ? <span className="text-xs text-fg-faint">este</span> : null}
                </div>
                <p className="mt-1 text-sm text-fg-muted">{plan.tagline}</p>
                <p className="mt-4 font-mono text-2xl tabular-nums">{formatPlanPrice(price)}<span className="text-sm text-fg-faint">/mes</span></p>
                <p className="text-xs text-fg-faint">+ IVA{cycle === 'yearly' ? ` · ${formatPlanPrice(plan.yearlyPrice)} el año` : ''}</p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm text-fg-muted">
                  {plan.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => subscribe(plan.id, data.mercadopagoEnabled ? 'mercadopago' : 'transfer')}
                    className="btn-brand w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    {busy?.startsWith(plan.id) ? 'Reservando…' : current ? 'Renovar este plan' : `Pasar a ${plan.name}`}
                  </button>
                  {data.mercadopagoEnabled ? (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => subscribe(plan.id, 'transfer')}
                      className="w-full rounded-lg border border-hair py-2 text-sm text-fg-muted hover:bg-raised disabled:opacity-50"
                    >
                      Prefiero transferir
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        {error ? <p className="mt-3 text-sm text-crit">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-ok">{message}</p> : null}
      </section>

      {(data.pendingInvoice || data.transfer.alias || data.transfer.cbu || data.transfer.whatsapp) && (
        <section className="rounded-xl border border-hair-soft bg-surface p-5">
          <h3 className="font-semibold">Cómo pagar</h3>
          {data.pendingInvoice ? (
            <p className="mt-2 text-sm text-fg-muted">
              Pendiente: {data.pendingInvoice.planName} · {formatPlanPrice(data.pendingInvoice.amount)} ·{' '}
              {data.pendingInvoice.cycle === 'yearly' ? 'anual' : 'mensual'}.
            </p>
          ) : null}
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {data.transfer.holder ? (
              <div>
                <dt className="text-fg-faint">Titular</dt>
                <dd>{data.transfer.holder}</dd>
              </div>
            ) : null}
            {data.transfer.alias ? (
              <div>
                <dt className="text-fg-faint">Alias Mercado Pago</dt>
                <dd className="font-mono">{data.transfer.alias}</dd>
              </div>
            ) : null}
            {data.transfer.cbu ? (
              <div>
                <dt className="text-fg-faint">CBU / CVU</dt>
                <dd className="font-mono">{data.transfer.cbu}</dd>
              </div>
            ) : null}
            {data.transfer.cuit ? (
              <div>
                <dt className="text-fg-faint">CUIT</dt>
                <dd className="font-mono">{data.transfer.cuit}</dd>
              </div>
            ) : null}
          </dl>
          {data.transfer.whatsapp ? (
            <a
              href={`https://wa.me/${data.transfer.whatsapp.replace(/\D/g, '')}`}
              className="mt-4 inline-block text-sm text-brand hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Avisar el pago por WhatsApp
            </a>
          ) : (
            <p className="mt-3 text-xs text-fg-faint">
              Cuando esté el alias o el CBU en el servidor, aparecen acá. Mientras tanto el plan queda reservado.
            </p>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-3 font-semibold">Comprobantes</h3>
        {data.invoices.length === 0 ? (
          <p className="text-sm text-fg-muted">Todavía no hay facturas de abono. Aparecen cuando contratás un plan.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-hair-soft">
            <table className="w-full min-w-[520px] text-left">
              <thead className="bg-raised text-xs uppercase text-fg-faint">
                <tr>
                  <th className="p-3 font-medium">Fecha</th>
                  <th className="p-3 font-medium">Plan</th>
                  <th className="p-3 font-medium">Ciclo</th>
                  <th className="p-3 text-right font-medium">Importe</th>
                  <th className="p-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <InvoiceRow key={inv.id} inv={inv} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Container>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<Container><PageHeader title="Plan y facturación" /></Container>}>
      <BillingInner />
    </Suspense>
  );
}
