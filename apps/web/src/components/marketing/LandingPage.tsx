'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MarketingShell } from './MarketingShell';
import { LoginForm } from './LoginForm';
import { PosMock } from './PosMock';
import {
  FEATURE_LABELS,
  formatPlanPrice,
  PLAN_CATALOG,
  type BillingCycle,
  type PlanFeature,
  yearlyEquivalentMonthly,
} from '@/lib/plans';

const COMPARE: { feature: PlanFeature; plans: [boolean, boolean, boolean] }[] = [
  { feature: 'pos', plans: [true, true, true] },
  { feature: 'products', plans: [true, true, true] },
  { feature: 'caja', plans: [true, true, true] },
  { feature: 'customers', plans: [true, true, true] },
  { feature: 'promotions', plans: [true, true, true] },
  { feature: 'reports', plans: [true, true, true] },
  { feature: 'fiscal', plans: [false, true, true] },
  { feature: 'sync', plans: [false, false, true] },
  { feature: 'aiPurchases', plans: [false, false, true] },
];

const FAQ = [
  {
    q: '¿Hace falta instalar algo en la PC del kiosco?',
    a: 'No. Entras desde el navegador, en la máquina del mostrador o en el celu. El lector de códigos funciona como teclado: pistoleás y el producto cae al carrito.',
  },
  {
    q: '¿Qué entra en Mostrador?',
    a: 'Cobrar, stock, caja, compras a mano, proveedores cargados por vos, fiado, promos, reportes, figuritas y hasta 5 usuarios. Es el kiosco funcionando, sin AFIP ni listas automáticas de mayoristas.',
  },
  {
    q: '¿Y si el cliente pide factura?',
    a: 'Ahí va Fiscal: misma operatoria, más Factura C electrónica a AFIP. El ticket interno sigue existiendo para quien no la pide.',
  },
  {
    q: '¿Tokin, Mondelez o Juntos+ en qué plan están?',
    a: 'En Pro. Ahí se sincronizan catálogos y precios B2B. El runner local (en tu PC) sigue haciendo falta para algunos precios reales; la app es la que los recibe.',
  },
  {
    q: '¿La IA qué hace, concreto?',
    a: 'En Pro subís el PDF o la foto de la factura del proveedor y el sistema arma la compra: productos, cantidades y costos. No escribe textos ni “te asesora”.',
  },
  {
    q: '¿Hay prueba? ¿Piden tarjeta?',
    a: '14 días del plan que elijas, sin tarjeta. Si no sigue, el kiosco no se cobra.',
  },
];

export function LandingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('accessToken')) {
      window.location.replace('/dashboard');
    }
  }, []);

  return (
    <MarketingShell>
      <section className="mx-auto grid max-w-6xl items-start gap-12 px-4 pb-8 pt-10 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:pt-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mk-red)]">Kioscos · Argentina</p>
          <h1 className="mk-display mt-3 max-w-[16ch] text-[2.6rem] leading-[1.05] text-[var(--mk-ink)] sm:text-6xl">
            El mostrador no espera. El sistema tampoco.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[var(--mk-ink-2)]">
            Cobrá con lector, mirá si queda stock y cerrá la caja a la noche. Hecho para el kiosco de la esquina, no para un curso de software.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/register?plan=mostrador"
              className="rounded-md bg-[var(--mk-red)] px-5 py-2.5 text-sm font-semibold text-[#f7f1e4] hover:bg-[var(--mk-red-dark)]"
            >
              Probar 14 días
            </Link>
            <a href="#planes" className="rounded-md border border-[var(--mk-ink)]/15 px-5 py-2.5 text-sm font-medium text-[var(--mk-ink)] hover:bg-black/5">
              Ver planes
            </a>
          </div>
          <p className="mt-3 text-xs text-[var(--mk-ink-3)]">Sin tarjeta · cancelás cuando quieras · pesos argentinos + IVA</p>
        </div>
        <div id="ingresar" className="scroll-mt-24">
          <div className="rounded-xl border border-[var(--mk-line)] bg-[var(--mk-paper-2)] p-5 shadow-[0_12px_40px_-24px_rgba(28,25,20,0.45)] sm:p-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--mk-ink-3)]">Ya tenés cuenta</p>
            <LoginForm compact />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <PosMock />
      </section>

      <section id="producto" className="scroll-mt-24 border-t border-[var(--mk-line)] bg-[var(--mk-paper-2)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mk-red)]">Qué resuelve</p>
          <h2 className="mk-display mt-2 max-w-[18ch] text-4xl sm:text-5xl">Las cuatro cosas que te comen el día.</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2">
            {[
              { n: '01', t: 'La cola del mediodía', d: 'Pistoleás, Enter, cobrás. Atajos de teclado (F2, F4) para no mirar el mouse con gente esperando.' },
              { n: '02', t: 'El “había” y no hay', d: 'Cada venta baja stock. Compras a mano o, en Pro, la lista del mayorista. Sabés qué pedir antes de que falte.' },
              { n: '03', t: 'La caja que no cierra', d: 'Apertura, efectivo, Mercado Pago, egresos. Al final del turno el número está, no lo reconstruís de memoria.' },
              { n: '04', t: 'La factura y el Excel del proveedor', d: 'Fiscal emite Factura C. Pro trae Tokin, Mondelez y Juntos+ y lee la factura de compra con IA.' },
            ].map((item) => (
              <li key={item.n} className="border-t border-[var(--mk-line)] pt-5">
                <p className="font-mono text-xs text-[var(--mk-red)]">{item.n}</p>
                <h3 className="mt-2 text-lg font-semibold">{item.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--mk-ink-2)]">{item.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="planes" className="scroll-mt-24 border-t border-[var(--mk-line)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mk-red)]">Planes</p>
              <h2 className="mk-display mt-2 text-4xl sm:text-5xl">Tres capas. Sin combos raros.</h2>
              <p className="mt-3 max-w-xl text-[var(--mk-ink-2)]">
                Arrancás operando el kiosco. Si AFIP entra en juego, sumás factura. Si comprás a mayoristas, Pro trae las listas y la IA.
              </p>
            </div>
            <div className="inline-flex rounded-md border border-[var(--mk-line)] p-1 text-sm">
              <button
                type="button"
                onClick={() => setCycle('monthly')}
                className={`rounded px-3 py-1.5 ${cycle === 'monthly' ? 'bg-[var(--mk-ink)] text-[var(--mk-paper)]' : 'text-[var(--mk-ink-2)]'}`}
              >
                Por mes
              </button>
              <button
                type="button"
                onClick={() => setCycle('yearly')}
                className={`rounded px-3 py-1.5 ${cycle === 'yearly' ? 'bg-[var(--mk-ink)] text-[var(--mk-paper)]' : 'text-[var(--mk-ink-2)]'}`}
              >
                Por año · 2 meses de regalo
              </button>
            </div>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLAN_CATALOG.map((plan) => {
              const price = cycle === 'yearly' ? yearlyEquivalentMonthly(plan) : plan.monthlyPrice;
              return (
                <article
                  key={plan.id}
                  className={`flex flex-col rounded-xl border bg-[var(--mk-paper-2)] p-6 ${
                    plan.highlighted ? 'border-[var(--mk-red)] shadow-[0_16px_40px_-28px_rgba(196,60,44,0.7)]' : 'border-[var(--mk-line)]'
                  }`}
                >
                  {plan.highlighted ? (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--mk-red)]">Para arrancar</p>
                  ) : null}
                  <h3 className="mk-display text-3xl">{plan.name}</h3>
                  <p className="mt-1 text-sm text-[var(--mk-ink-2)]">{plan.tagline}</p>
                  <p className="mt-5">
                    <span className="font-mono text-3xl tabular-nums">{formatPlanPrice(price)}</span>
                    <span className="text-sm text-[var(--mk-ink-3)]"> /mes{cycle === 'yearly' ? ' · facturado anual' : ''}</span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--mk-ink-3)]">+ IVA · {cycle === 'yearly' ? formatPlanPrice(plan.yearlyPrice) + ' el año' : 'o 10 meses si pagás el año'}</p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-[var(--mk-ink-2)]">
                    {plan.bullets.map((b) => (
                      <li key={b} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--mk-red)]" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/register?plan=${plan.id}`}
                    className={`mt-6 block rounded-md py-2.5 text-center text-sm font-semibold ${
                      plan.highlighted
                        ? 'bg-[var(--mk-red)] text-[#f7f1e4] hover:bg-[var(--mk-red-dark)]'
                        : 'border border-[var(--mk-ink)]/15 text-[var(--mk-ink)] hover:bg-black/5'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </article>
              );
            })}
          </div>

          <div className="mt-14 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--mk-line)] text-[var(--mk-ink-3)]">
                  <th className="py-3 pr-4 font-medium">Qué incluye</th>
                  {PLAN_CATALOG.map((p) => (
                    <th key={p.id} className="px-3 py-3 font-semibold text-[var(--mk-ink)]">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.feature} className="border-b border-[var(--mk-line)]/80">
                    <td className="py-3 pr-4 text-[var(--mk-ink-2)]">{FEATURE_LABELS[row.feature]}</td>
                    {row.plans.map((ok, i) => (
                      <td key={PLAN_CATALOG[i].id} className="px-3 py-3 font-mono text-[var(--mk-ink)]">
                        {ok ? 'sí' : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="preguntas" className="scroll-mt-24 border-t border-[var(--mk-line)] bg-[var(--mk-paper-2)]">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="mk-display text-4xl">Preguntas de dueño de kiosco</h2>
          <div className="mt-8 divide-y divide-[var(--mk-line)]">
            {FAQ.map((item, i) => (
              <div key={item.q}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-4 py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span className="font-medium">{item.q}</span>
                  <span className="font-mono text-sm text-[var(--mk-ink-3)]">{openFaq === i ? '–' : '+'}</span>
                </button>
                {openFaq === i ? <p className="pb-4 text-[15px] leading-relaxed text-[var(--mk-ink-2)]">{item.a}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
