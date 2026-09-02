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
  if (status === 'complimentary') return 'Cortesía · no se cobra';
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
  const discount = Number(inv.discount ?? 0);
  return (
    <tr className="border-t border-hair-soft">
      <td className="py-2.5 pr-3 text-sm">{new Date(inv.createdAt).toLocaleDateString('es-AR')}</td>
      <td className="py-2.5 pr-3 text-sm">{inv.planName}</td>
      <td className="py-2.5 pr-3 text-sm">{inv.cycle === 'yearly' ? 'Anual' : 'Mensual'}</td>
      <td className="py-2.5 pr-3 text-right font-mono text-sm">
        {formatPlanPrice(inv.amount)}
        {discount > 0 ? (
          <span className="block text-[11px] text-ok">−{formatPlanPrice(discount)} referidos</span>
        ) : null}
      </td>
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
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const copyText = async (value: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError('No se pudo copiar. Seleccioná el texto a mano.');
    }
  };

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
        subtitle="Acá ves el plan, el estado del pago y los comprobantes del abono."
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
        <div className="mt-4 rounded-lg border border-hair-soft bg-raised px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Estado del pago</p>
          <p className="mt-1 text-lg font-semibold">{data.paymentStatusLabel}</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-faint">Último pago acreditado</dt>
              <dd>{data.lastPaidAt ? new Date(data.lastPaidAt).toLocaleDateString('es-AR') : 'Todavía no hay un pago acreditado'}</dd>
            </div>
            <div>
              <dt className="text-fg-faint">Próxima renovación</dt>
              <dd>{data.planRenewsAt ? new Date(data.planRenewsAt).toLocaleDateString('es-AR') : '—'}</dd>
            </div>
          </dl>
          {data.status === 'complimentary' ? (
            <p className="mt-3 text-sm text-ok">Esta cuenta no se cobra. El plan lo define el equipo de StockRápido.</p>
          ) : data.status === 'pending_payment' || data.pendingInvoice ? (
            <p className="mt-3 text-sm text-warn">Hay un pago pendiente. El plan ya está reservado; falta que acredite.</p>
          ) : null}
          {data.status !== 'complimentary' ? (
          <a href="/soporte/nuevo?categoria=pago&asunto=Consulta%20por%20el%20pago%20del%20plan" className="mt-3 inline-block text-sm text-brand hover:underline">
            ¿Un problema con el pago? Abrí un ticket
          </a>
          ) : null}
        </div>
        {data.trialActive ? (
          <p className="mt-3 text-sm">
            Te quedan <strong>{trialLeft} día{trialLeft === 1 ? '' : 's'}</strong> de prueba
            {data.trialEndsAt ? ` (hasta el ${new Date(data.trialEndsAt).toLocaleDateString('es-AR')})` : ''}.
          </p>
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

      {data.referral ? (
        <section data-tour="billing-referral" className="rounded-xl border border-hair-soft bg-surface p-5">
          <h3 className="text-lg font-semibold">Invitá otros locales</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Cada local nuevo que se registre con tu código recibe {formatPlanPrice(data.referral.discountPerMonth)} de
            descuento durante {data.referral.discountMonths} meses. Vos también: {formatPlanPrice(data.referral.discountPerMonth)} por
            mes, por cada uno, durante {data.referral.discountMonths} meses.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-lg tracking-widest">
              {data.referral.code}
            </span>
            <button
              type="button"
              onClick={() => void copyText(data.referral!.code, 'code')}
              className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised"
            >
              {copied === 'code' ? 'Copiado' : 'Copiar código'}
            </button>
            <button
              type="button"
              onClick={() => void copyText(data.referral!.shareUrl, 'link')}
              className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised"
            >
              {copied === 'link' ? 'Link copiado' : 'Copiar link'}
            </button>
          </div>
          {data.referral.activeDiscount.monthlyAmount > 0 ? (
            <p className="mt-3 text-sm text-ok">
              Descuento activo: {formatPlanPrice(data.referral.activeDiscount.monthlyAmount)} por mes en los próximos
              pagos
              {data.referral.activeDiscount.monthsLeftAsReferee > 0
                ? ` · ${data.referral.activeDiscount.monthsLeftAsReferee} mes${data.referral.activeDiscount.monthsLeftAsReferee === 1 ? '' : 'es'} como local nuevo`
                : ''}
              {data.referral.referralsMade.filter((r) => r.monthsLeft > 0).length > 0
                ? ` · ${data.referral.referralsMade.filter((r) => r.monthsLeft > 0).length} referido${data.referral.referralsMade.filter((r) => r.monthsLeft > 0).length === 1 ? '' : 's'} vigentes`
                : ''}
              .
            </p>
          ) : null}
          {data.referral.referredBy ? (
            <p className="mt-2 text-sm text-fg-muted">
              Te invitó {data.referral.referredBy.businessName} ({data.referral.referredBy.code}).
              {data.referral.referredBy.monthsLeft > 0
                ? ` Te quedan ${data.referral.referredBy.monthsLeft} mes${data.referral.referredBy.monthsLeft === 1 ? '' : 'es'} de descuento.`
                : ' Ese descuento ya se usó.'}
            </p>
          ) : null}
          {data.referral.referralsMade.length > 0 ? (
            <ul className="mt-4 space-y-1.5 text-sm">
              {data.referral.referralsMade.map((row) => (
                <li key={row.id} className="flex flex-wrap justify-between gap-2 border-t border-hair-soft pt-2">
                  <span>{row.businessName}</span>
                  <span className="text-fg-muted">
                    {new Date(row.createdAt).toLocaleDateString('es-AR')}
                    {' · '}
                    {row.monthsLeft > 0
                      ? `${row.monthsLeft} mes${row.monthsLeft === 1 ? '' : 'es'} de descuento`
                      : 'descuento cumplido'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-faint">Todavía no hay locales registrados con tu código.</p>
          )}
        </section>
      ) : null}

      {data.status === 'complimentary' ? (
        <section className="rounded-xl border border-hair-soft bg-surface p-5">
          <h3 className="text-lg font-semibold">Plan de cortesía</h3>
          <p className="mt-2 text-sm text-fg-muted">
            Esta cuenta no se cobra. Si necesitás otro plan o volver a un abono, escribí a soporte: lo cambia el equipo de StockRápido.
          </p>
        </section>
      ) : (
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
                {data.referral && data.referral.activeDiscount.monthlyAmount > 0 ? (
                  <p className="mt-1 text-xs text-ok">
                    Con referidos: −{formatPlanPrice(data.referral.activeDiscount.monthlyAmount)}
                    {cycle === 'yearly' ? ' × hasta 3 meses en el pago anual' : '/mes'}
                  </p>
                ) : null}
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
      )}

      {data.status !== 'complimentary' && (data.pendingInvoice || data.transfer.alias || data.transfer.cbu || data.transfer.whatsapp) && (
        <section className="rounded-xl border border-hair-soft bg-surface p-5">
          <h3 className="font-semibold">Cómo pagar</h3>
          {data.pendingInvoice ? (
            <p className="mt-2 text-sm text-fg-muted">
              Pendiente: {data.pendingInvoice.planName} · {formatPlanPrice(data.pendingInvoice.amount)}
              {Number(data.pendingInvoice.discount) > 0
                ? ` (incluye −${formatPlanPrice(Number(data.pendingInvoice.discount))} de referidos)`
                : ''}{' '}
              · {data.pendingInvoice.cycle === 'yearly' ? 'anual' : 'mensual'}.
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
