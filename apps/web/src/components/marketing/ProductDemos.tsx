'use client';

import { useState } from 'react';

const TABS = [
  { id: 'pos', label: 'Punto de venta', plan: 'BASIC' },
  { id: 'caja', label: 'Caja', plan: 'BASIC' },
  { id: 'factura', label: 'Facturación', plan: 'PRO' },
  { id: 'dist', label: 'Distribuidores', plan: 'PREMIUM' },
] as const;

export function ProductDemos() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('pos');

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === t.id ? 'bg-[var(--mk-red)] text-white' : 'bg-white text-[var(--mk-ink-2)] ring-1 ring-[var(--mk-line)]'
            }`}
          >
            {t.label}
            <span className={`ml-2 text-[10px] font-extrabold ${tab === t.id ? 'text-white/80' : 'text-[var(--mk-ink-3)]'}`}>
              {t.plan}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-[var(--mk-line)] bg-white shadow-[0_24px_60px_-28px_rgba(227,28,35,0.35)]">
        {tab === 'pos' ? <PosDemo /> : null}
        {tab === 'caja' ? <CajaDemo /> : null}
        {tab === 'factura' ? <FacturaDemo /> : null}
        {tab === 'dist' ? <DistDemo /> : null}
      </div>
      <p className="mt-3 text-center text-sm text-[var(--mk-ink-3)]">
        Ejemplo de un turno. Adentro se ve igual.
      </p>
    </div>
  );
}

function PosDemo() {
  const lines = [
    { name: 'Coca-Cola 500ml', code: '779089500099', qty: 2, price: 1600 },
    { name: 'Alfajor Bon o Bon', code: '779004011', qty: 3, price: 1350 },
    { name: 'Oreo 118g', code: '7622300', qty: 1, price: 1890 },
    { name: 'Marlboro Rojo', code: '7791234', qty: 1, price: 2500 },
  ];
  const total = lines.reduce((s, l) => s + l.price, 0);
  return (
    <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
      <div className="border-b border-black/5 p-4 lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center justify-between text-xs font-bold text-[var(--mk-ink-3)]">
          <span>Kiosco Don Pedro · caja 1</span>
          <span>F2 buscar · F4 cobrar</span>
        </div>
        <div className="rounded-2xl bg-[#fff4f0] px-4 py-3 text-[15px] text-[var(--mk-ink-3)]">7790895… Coca-Cola</div>
        <ul className="mt-3 divide-y divide-[var(--mk-line)]">
          {lines.map((l) => (
            <li key={l.code} className="flex items-baseline justify-between gap-3 py-2.5">
              <div>
                <p className="font-semibold">{l.name}</p>
                <p className="font-mono text-[11px] text-[var(--mk-ink-3)]">
                  {l.code} · ×{l.qty}
                </p>
              </div>
              <p className="font-mono font-bold tabular-nums">${l.price.toLocaleString('es-AR')}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-[var(--mk-red)] p-5 text-white">
        <p className="text-xs font-extrabold uppercase tracking-wide text-white/70">Total a cobrar</p>
        <p className="mt-1 font-mono text-4xl font-extrabold tabular-nums">${total.toLocaleString('es-AR')}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-bold">
          <span className="rounded-full bg-white/15 py-2 text-center">Efectivo</span>
          <span className="rounded-full bg-white py-2 text-center text-[var(--mk-red)]">Mercado Pago</span>
        </div>
        <div className="mt-3 rounded-full bg-[var(--mk-yellow)] py-3 text-center text-sm font-extrabold text-[#2a1412]">
          Cobrar · F4
        </div>
      </div>
    </div>
  );
}

function CajaDemo() {
  const rows = [
    ['Efectivo', '$ 84.200'],
    ['Mercado Pago', '$ 31.150'],
    ['Tarjeta', '$ 9.800'],
    ['Egresos', '− $ 4.500'],
  ];
  return (
    <div className="p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--mk-red)]">Cierre de turno</p>
          <h3 className="mt-1 text-2xl font-extrabold">Sábado 16/08 · 08:12 a 21:40</h3>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">Caja cuadrada</span>
      </div>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-[#fff4f0] px-4 py-3">
            <dt className="text-sm text-[var(--mk-ink-2)]">{k}</dt>
            <dd className="font-mono text-xl font-extrabold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-[var(--mk-ink-2)]">147 ventas. El cierre queda armado al terminar el turno.</p>
    </div>
  );
}

function FacturaDemo() {
  return (
    <div className="grid gap-0 lg:grid-cols-2">
      <div className="p-5 sm:p-7">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--mk-red)]">Módulo de facturación · PRO</p>
        <h3 className="mt-1 text-2xl font-extrabold">Factura C desde el mismo cobro</h3>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--mk-ink-2)]">
          En el POS elegís comprobante interno o Factura C. El CUIT, el punto de venta y el certificado están en el
          sistema. El cliente se lleva el comprobante; vos seguís en la misma pantalla.
        </p>
        <ul className="mt-4 space-y-2 text-sm font-semibold text-[var(--mk-ink)]">
          <li>• Punto de venta 00003</li>
          <li>• Reimpresión del comprobante</li>
          <li>• El ticket interno sigue disponible si no hace falta factura</li>
        </ul>
      </div>
      <div className="bg-[#fff4f0] p-5 font-mono text-[13px] leading-relaxed sm:p-7">
        <p className="font-sans text-xs font-extrabold uppercase tracking-wide text-[var(--mk-red)]">Factura C</p>
        <p className="mt-2 text-lg font-bold">00003-00001482</p>
        <p className="mt-3">Kiosco Don Pedro</p>
        <p>CUIT 20-28391044-9</p>
        <p className="mt-3">Coca-Cola 500ml ×2 · $1.600</p>
        <p>Alfajor Bon o Bon ×3 · $1.350</p>
        <p className="mt-3 font-bold">Total $6.000</p>
        <p className="mt-3 text-[var(--mk-ink-3)]">CAE 74192836510214</p>
      </div>
    </div>
  );
}

function DistDemo() {
  const rows = [
    { brand: 'Mondelez', name: 'Oreo 118g', cost: 1240, sale: 1890, stock: 24 },
    { brand: 'Arcor', name: 'Bon o Bon 30g', cost: 280, sale: 450, stock: 80 },
    { brand: 'Coca-Cola', name: 'Coca-Cola 500ml', cost: 980, sale: 1600, stock: 48 },
    { brand: 'Tokin', name: 'Lucky Strike box', cost: 1980, sale: 2500, stock: 12 },
  ];
  return (
    <div className="p-5 sm:p-7">
      <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--mk-red)]">PREMIUM</p>
      <h3 className="mt-1 text-2xl font-extrabold">Las listas de los mayoristas, adentro</h3>
      <p className="mt-2 max-w-2xl text-[15px] text-[var(--mk-ink-2)]">
        Tokin, Mondelez y Juntos+ entran al catálogo con el costo. Importás a Productos, armás el pedido y, si querés,
        cargás la factura de compra con una foto.
      </p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="text-[var(--mk-ink-3)]">
              <th className="pb-2 font-bold">Proveedor</th>
              <th className="pb-2 font-bold">Producto</th>
              <th className="pb-2 text-right font-bold">Costo</th>
              <th className="pb-2 text-right font-bold">Venta</th>
              <th className="pb-2 text-right font-bold">Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-[var(--mk-line)]">
                <td className="py-2.5 font-bold text-[var(--mk-red)]">{r.brand}</td>
                <td className="py-2.5 font-semibold">{r.name}</td>
                <td className="py-2.5 text-right font-mono">${r.cost.toLocaleString('es-AR')}</td>
                <td className="py-2.5 text-right font-mono">${r.sale.toLocaleString('es-AR')}</td>
                <td className="py-2.5 text-right font-mono">{r.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
