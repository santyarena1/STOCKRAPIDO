'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MarketingShell } from './MarketingShell';
import { LoginForm } from './LoginForm';
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
  { feature: 'publicCatalog', plans: [true, true, true] },
  { feature: 'deliveryIntegrations', plans: [false, true, true] },
  { feature: 'fiscal', plans: [false, true, true] },
  { feature: 'sync', plans: [false, false, true] },
  { feature: 'aiPurchases', plans: [false, false, true] },
];

const MODULES = [
  {
    plan: 'BASIC',
    title: 'Para vender todos los días',
    text: 'Cobrar, bajar stock, cerrar caja, cargar compras, fiado, promos y reportes. Además, en Productos importás fichas del catálogo comunitario (sin precio) con filtros y paginación.',
  },
  {
    plan: 'PRO',
    title: 'Cuando piden factura',
    text: 'Suma Factura C electrónica al mismo cobro y la central de delivery: Rappi y PedidosYa con módulos separados, bandeja unificada, menú, mapeos y venta con baja de stock.',
  },
  {
    plan: 'PREMIUM',
    title: 'Mayoristas, también acá',
    text: 'Entran las listas de Tokin, Mondelez y Juntos+. Pedidos, costos y compras con IA: subís el PDF o la foto de la factura y se arma la compra.',
  },
];

const WHY = [
  {
    title: 'La venta es más fácil',
    text: 'Pistoleás, cobrás y el stock se mueve solo. El sistema te ordena el turno: menos vueltas, menos errores, más tiempo en el mostrador.',
  },
  {
    title: 'Todo en un solo lugar',
    text: 'Ventas, caja, productos, compras, catálogo comunitario, delivery (Rappi y PedidosYa) y facturación viven juntos. No hace falta entrar a mil plataformas ni copiar datos de un lado al otro.',
  },
  {
    title: 'Lo hacemos nosotros',
    text: 'Somos desarrolladores reales, no un sistema cerrado. Las sugerencias están abiertas. Si algo suma, lo cambiamos. Hay ediciones y actualizaciones que no se cobran.',
  },
];

const FAQ = [
  {
    q: '¿Hace falta instalar algo en la PC del kiosco?',
    a: 'No. Entras desde el navegador, en la máquina del mostrador o en el celu. El lector de códigos funciona como teclado: pistoleás y el producto cae al carrito.',
  },
  {
    q: '¿Qué entra en BASIC?',
    a: 'Cobrar, stock, caja, compras a mano, proveedores, fiado, promos, reportes, figuritas y hasta 5 usuarios. Incluye el catálogo comunitario en Productos (importar fichas sin precio). La factura electrónica y las listas de mayoristas van en los planes de arriba.',
  },
  {
    q: '¿Y si el cliente pide factura?',
    a: 'Con PRO la emitís desde el mismo cobro (Factura C). El ticket interno sigue para quien no la pide. No tenés que abrir otro programa.',
  },
  {
    q: '¿Qué es el catálogo comunitario?',
    a: 'En Productos → Catálogo público ves fichas que otros locales comparten (nombre, marca, categoría, código e imagen, sin precio ni stock). Filtrás, paginás e importás a tu inventario. También podés publicar las tuyas. En BASIC: publicar ilimitado e importar hasta 300 fichas por mes; en PRO y PREMIUM, sin tope.',
  },
  {
    q: '¿Rappi y PedidosYa están integrados?',
    a: 'Sí, desde PRO y PREMIUM. Tenés una central de pedidos unificada y un módulo dedicado para cada app: conexión API, webhook, menú, mapeo de SKU con tu inventario, aceptar/rechazar, preparar, despachar y convertir en venta con baja de stock. Cada plataforma se configura por separado.',
  },
  {
    q: '¿Tokin, Mondelez o Juntos+ en qué plan están?',
    a: 'En PREMIUM. Ahí se importan catálogos y precios. Algunos costos reales piden el runner en tu PC; el sistema es el que los recibe y los usa.',
  },
  {
    q: '¿La IA qué hace?',
    a: 'En PREMIUM subís el PDF o la foto de la factura del proveedor y se arma la compra: productos, cantidades y costos.',
  },
  {
    q: '¿Puedo pedir un cambio o una función?',
    a: 'Sí. Lo desarrollamos nosotros. Las sugerencias están abiertas: si algo ayuda al kiosco, lo vemos y lo actualizamos. Hay ediciones y mejoras que no se cobran.',
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
      <section className="border-b border-[var(--mk-line)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-16">
          <div className="max-w-xl">
            <span className="mk-pill">Un solo sistema para el kiosco</span>
            <h1 className="mk-display mt-5 text-[2.7rem] text-[var(--mk-ink)] sm:text-6xl">
              La venta, más fácil.
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-[var(--mk-ink-2)]">
              StockRápido ordena el local: cobro, stock, caja y el resto, juntos. Dejás de saltar entre plataformas.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#planes" className="mk-cta">
                Ver planes
              </a>
              <Link href="/register?plan=mostrador" className="mk-cta-ghost">
                Probar 14 días
              </Link>
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--mk-ink-3)]">
              Sin tarjeta · BASIC, PRO y PREMIUM · pesos argentinos + IVA
            </p>
          </div>
          <div id="ingresar" className="scroll-mt-24 w-full lg:justify-self-end lg:max-w-[400px]">
            <div className="rounded-[1.75rem] border border-[var(--mk-line)] bg-white p-5 sm:p-6">
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-[var(--mk-red)]">Ingresar</p>
              <p className="mb-4 text-sm text-[var(--mk-ink-2)]">Si ya tenés cuenta, entrá acá.</p>
              <LoginForm compact />
            </div>
          </div>
        </div>
      </section>

      <section id="producto" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--mk-red)]">El sistema</p>
        <h2 className="mk-display mt-2 max-w-[18ch] text-4xl sm:text-5xl">Te ordena el día, desde el mostrador.</h2>
        <p className="mt-3 max-w-2xl text-[var(--mk-ink-2)]">
          Punto de venta, caja, catálogo comunitario, Rappi, PedidosYa, facturación y listas de mayoristas. Todo adentro.
          Así no te perdés entre mil pantallas.
        </p>
        <div className="mt-8">
          <ProductDemos />
        </div>
      </section>

      <section id="porque" className="scroll-mt-24 border-t border-[var(--mk-line)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--mk-red)]">Por qué StockRápido</p>
          <h2 className="mk-display mt-2 max-w-[18ch] text-4xl sm:text-5xl">Centralizamos. Y escuchamos.</h2>
          <p className="mt-3 max-w-2xl text-[var(--mk-ink-2)]">
            Lo desarrollamos nosotros. Si pedís un cambio que suma, se puede hacer. Hay ediciones y mejoras que no se
            cobran.
          </p>
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {WHY.map((item) => (
              <li key={item.title} className="rounded-[1.5rem] border border-[var(--mk-line)] bg-[var(--mk-paper)] p-6">
                <h3 className="text-xl font-extrabold">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--mk-ink-2)]">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="modulos" className="scroll-mt-24 border-t border-[var(--mk-line)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--mk-red)]">Qué incluye cada plan</p>
          <h2 className="mk-display mt-2 max-w-[16ch] text-4xl sm:text-5xl">BASIC, PRO y PREMIUM.</h2>
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
              <h2 className="mk-display mt-2 text-4xl sm:text-5xl">Elegí el que te sirve.</h2>
              <p className="mt-3 max-w-xl text-[var(--mk-ink-2)]">
                BASIC para el día a día. PRO si facturás. PREMIUM si comprás a mayoristas. 14 días de prueba, después
                contratás el que uses.
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
          <h2 className="mk-display text-4xl">Preguntas</h2>
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
            <p className="text-lg font-extrabold">¿Probamos?</p>
            <p className="mt-1 text-sm text-[var(--mk-ink-2)]">14 días, sin tarjeta. Después BASIC, PRO o PREMIUM.</p>
            <a href="#planes" className="mk-cta mt-4">
              Ver planes y contratar
            </a>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
