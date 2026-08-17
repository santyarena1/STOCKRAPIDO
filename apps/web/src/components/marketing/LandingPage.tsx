'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MarketingShell } from './MarketingShell';
import { LoginForm } from './LoginForm';
import { StockRapidoLogo } from '@/components/brand/StockRapidoLogo';
import { ProductDemos } from './ProductDemos';
import {
  formatPlanPrice,
  type BillingCycle,
  type PlanFeature,
  yearlyEquivalentMonthly,
} from '@/lib/plans';
import { LANDING_FEATURE_LABELS, landingPlans } from '@/lib/landing-copy';

const PLANS = landingPlans();

const COMPARE: { feature: PlanFeature; plans: [boolean, boolean, boolean] }[] = [
  { feature: 'pos', plans: [true, true, true] },
  { feature: 'products', plans: [true, true, true] },
  { feature: 'caja', plans: [true, true, true] },
  { feature: 'purchases', plans: [true, true, true] },
  { feature: 'customers', plans: [true, true, true] },
  { feature: 'promotions', plans: [true, true, true] },
  { feature: 'reports', plans: [true, true, true] },
  { feature: 'fiscal', plans: [false, true, true] },
  { feature: 'sync', plans: [false, false, true] },
  { feature: 'aiPurchases', plans: [false, false, true] },
];

const MODULES = [
  {
    plan: 'BASIC',
    title: 'Gestión del kiosco',
    text: 'Cobrar, bajar stock, cerrar caja, cargar compras a mano, fiado, promos y reportes. Es el sistema de gestión del local, listo para el mostrador.',
  },
  {
    plan: 'PRO',
    title: 'Módulo de facturación',
    text: 'Encima de BASIC, Factura C electrónica desde el mismo cobro. Cargás CUIT, punto de venta y certificado una vez. Si el cliente no pide factura, el ticket interno sigue ahí.',
  },
  {
    plan: 'PREMIUM',
    title: 'Distribuidores e IA',
    text: 'Encima de PRO, entran las listas de Tokin, Mondelez y Juntos+. Pedidos, costos B2B y compras con IA: subís el PDF o la foto de la factura del mayorista y se arma la compra.',
  },
];

const FAQ = [
  {
    q: '¿Hace falta instalar algo en la PC del kiosco?',
    a: 'No. Entras desde el navegador, en la máquina del mostrador o en el celu. El lector de códigos funciona como teclado: pistoleás y el producto cae al carrito.',
  },
  {
    q: '¿Qué entra en BASIC?',
    a: 'Cobrar, stock, caja, compras a mano, proveedores cargados por vos, fiado, promos, reportes, figuritas y hasta 5 usuarios. Es la gestión del kiosco, sin facturación electrónica ni listas automáticas de mayoristas.',
  },
  {
    q: '¿Y si el cliente pide factura?',
    a: 'Ahí va PRO: misma operatoria, más el módulo de facturación (Factura C). El ticket interno sigue existiendo para quien no la pide.',
  },
  {
    q: '¿Tokin, Mondelez o Juntos+ en qué plan están?',
    a: 'En PREMIUM. Ahí se importan catálogos y precios B2B. El runner local (en tu PC) sigue haciendo falta para algunos precios reales; la app es la que los recibe.',
  },
  {
    q: '¿La IA qué hace, concreto?',
    a: 'En PREMIUM subís el PDF o la foto de la factura del proveedor y el sistema arma la compra: productos, cantidades y costos. No escribe textos ni “te asesora”.',
  },
  {
    q: '¿Hay prueba? ¿Piden tarjeta?',
    a: '14 días del plan que elijas, sin tarjeta. Si no sigue, no se cobra. Después contratás desde acá o, ya adentro, en Plan y facturación.',
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
          <div className="mb-6 hidden sm:block">
            <StockRapidoLogo variant="landing" size="lg" href={null} />
          </div>
          <span className="mk-pill">Sistema de gestión · kioscos</span>
          <h1 className="mk-display mt-5 max-w-[14ch] text-[2.7rem] text-[var(--mk-ink)] sm:text-6xl">
            El kiosco, ordenado. Vos, cobrando.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[var(--mk-ink-2)]">
            StockRápido es el sistema de gestión del local: punto de venta, stock, caja, facturación y catálogos de
            distribuidores. Hecho para el mostrador, no para un curso de software.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#planes" className="mk-cta">
              Contratar un plan
            </a>
            <Link href="/register?plan=mostrador" className="mk-cta-ghost">
              Probar 14 días
            </Link>
          </div>
          <p className="mt-3 text-sm font-semibold text-[var(--mk-ink-3)]">
            Sin tarjeta · BASIC, PRO y PREMIUM · pesos argentinos + IVA
          </p>
        </div>
        <div id="ingresar" className="scroll-mt-24">
          <div className="rounded-[1.75rem] border border-[var(--mk-line)] bg-white p-5 shadow-[0_20px_50px_-28px_rgba(227,28,35,0.35)] sm:p-6">
            <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-[var(--mk-red)]">Ya tenés cuenta</p>
            <p className="mb-4 text-sm text-[var(--mk-ink-2)]">Ingresá y seguís en el sistema, igual que siempre.</p>
            <LoginForm compact />
          </div>
        </div>
      </section>

      <section id="producto" className="scroll-mt-24 mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--mk-red)]">Cómo se usa</p>
        <h2 className="mk-display mt-2 max-w-[18ch] text-4xl sm:text-5xl">Cuatro pantallas, un turno real.</h2>
        <p className="mt-3 max-w-2xl text-[var(--mk-ink-2)]">
          POS, caja, facturación y listas de mayoristas. Adentro del sistema la interfaz no cambia: esto es solo para
          que veas qué hace cada módulo.
        </p>
        <div className="mt-8">
          <ProductDemos />
        </div>
      </section>

      <section id="modulos" className="scroll-mt-24 border-t border-[var(--mk-line)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--mk-red)]">Tres capas</p>
          <h2 className="mk-display mt-2 max-w-[16ch] text-4xl sm:text-5xl">BASIC, PRO y PREMIUM. Sin combos raros.</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {MODULES.map((item) => (
              <li
                key={item.plan}
                className="rounded-[1.5rem] border border-[var(--mk-line)] bg-[var(--mk-paper)] p-6"
              >
                <span className="mk-pill">{item.plan}</span>
                <h3 className="mt-4 text-xl font-extrabold">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--mk-ink-2)]">{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="planes" className="scroll-mt-24 border-t border-[var(--mk-line)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--mk-red)]">Planes</p>
              <h2 className="mk-display mt-2 text-4xl sm:text-5xl">Elegí y contratá.</h2>
              <p className="mt-3 max-w-xl text-[var(--mk-ink-2)]">
                Arrancás con la gestión. Si hace falta factura, PRO. Si comprás a mayoristas, PREMIUM trae las listas y
                la IA. 14 días de prueba, después contratás el que uses.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-[var(--mk-line)] bg-white p-1 text-sm font-bold">
              <button
                type="button"
                onClick={() => setCycle('monthly')}
                className={`rounded-full px-4 py-1.5 ${cycle === 'monthly' ? 'bg-[var(--mk-red)] text-white' : 'text-[var(--mk-ink-2)]'}`}
              >
                Por mes
              </button>
              <button
                type="button"
                onClick={() => setCycle('yearly')}
                className={`rounded-full px-4 py-1.5 ${cycle === 'yearly' ? 'bg-[var(--mk-red)] text-white' : 'text-[var(--mk-ink-2)]'}`}
              >
                Por año · 2 meses de regalo
              </button>
            </div>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => {
              const price = cycle === 'yearly' ? yearlyEquivalentMonthly(plan) : plan.monthlyPrice;
              return (
                <article
                  key={plan.id}
                  className={`flex flex-col rounded-[1.75rem] border bg-white p-6 ${
                    plan.highlighted
                      ? 'border-[var(--mk-red)] shadow-[0_20px_50px_-28px_rgba(227,28,35,0.55)]'
                      : 'border-[var(--mk-line)]'
                  }`}
                >
                  {plan.highlightLabel ? (
                    <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--mk-red)]">
                      {plan.highlightLabel}
                    </p>
                  ) : null}
                  <h3 className="mk-display text-3xl">{plan.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-[var(--mk-ink-2)]">{plan.tagline}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--mk-ink-2)]">{plan.description}</p>
                  <p className="mt-5">
                    <span className="font-mono text-3xl font-extrabold tabular-nums">{formatPlanPrice(price)}</span>
                    <span className="text-sm text-[var(--mk-ink-3)]">
                      {' '}
                      /mes{cycle === 'yearly' ? ' · facturado anual' : ''}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--mk-ink-3)]">
                    + IVA · {cycle === 'yearly' ? `${formatPlanPrice(plan.yearlyPrice)} el año` : 'o 10 meses si pagás el año'}
                  </p>
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
                    className={`mt-6 block text-center ${plan.highlighted ? 'mk-cta' : 'mk-cta-ghost'}`}
                  >
                    {plan.cta}
                  </Link>
                </article>
              );
            })}
          </div>

          <div className="mt-14 overflow-x-auto rounded-[1.5rem] border border-[var(--mk-line)] bg-white px-4">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--mk-line)] text-[var(--mk-ink-3)]">
                  <th className="py-4 pr-4 font-bold">Qué incluye</th>
                  {PLANS.map((p) => (
                    <th key={p.id} className="px-3 py-4 font-extrabold text-[var(--mk-ink)]">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.feature} className="border-b border-[var(--mk-line)]/80 last:border-0">
                    <td className="py-3 pr-4 text-[var(--mk-ink-2)]">{LANDING_FEATURE_LABELS[row.feature]}</td>
                    {row.plans.map((ok, i) => (
                      <td key={PLANS[i].id} className="px-3 py-3 font-extrabold text-[var(--mk-ink)]">
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

      <section id="preguntas" className="scroll-mt-24 border-t border-[var(--mk-line)] bg-white">
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
                  <span className="font-bold">{item.q}</span>
                  <span className="font-mono text-sm text-[var(--mk-ink-3)]">{openFaq === i ? '–' : '+'}</span>
                </button>
                {openFaq === i ? <p className="pb-4 text-[15px] leading-relaxed text-[var(--mk-ink-2)]">{item.a}</p> : null}
              </div>
            ))}
          </div>
          <div className="mt-10 rounded-[1.5rem] bg-[var(--mk-paper)] p-6 text-center">
            <p className="text-lg font-extrabold">¿Listo para contratar?</p>
            <p className="mt-1 text-sm text-[var(--mk-ink-2)]">14 días de prueba. Después elegís BASIC, PRO o PREMIUM.</p>
            <a href="#planes" className="mk-cta mt-4">
              Ver planes y contratar
            </a>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
