const LINES = [
  { name: 'Coca Cola 500ml', qty: 2, price: 1600 },
  { name: 'Marlboro Rojo', qty: 1, price: 2500 },
  { name: 'Alfajor Jorgito', qty: 3, price: 1050 },
  { name: 'Papas Lays', qty: 1, price: 850 },
];

export function PosMock() {
  const total = LINES.reduce((s, l) => s + l.price, 0);
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -left-3 top-8 hidden h-16 w-3 rounded-l-sm bg-[var(--mk-red)] sm:block" />
      <div className="overflow-hidden rounded-xl border border-black/20 bg-[var(--mk-ticket)] shadow-[0_24px_50px_-20px_rgba(28,25,20,0.55)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-[11px] text-white/50">
          <span className="font-medium text-white/80">Kiosco Don Pedro · caja 1</span>
          <span>14:32</span>
        </div>
        <div className="px-4 py-3">
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/40">
            Código o nombre…
          </div>
        </div>
        <div className="divide-y divide-white/8 px-2">
          {LINES.map((line) => (
            <div key={line.name} className="flex items-baseline justify-between gap-3 px-2 py-2.5">
              <div>
                <p className="text-sm text-white/90">{line.name}</p>
                <p className="text-[11px] text-white/40">× {line.qty}</p>
              </div>
              <p className="font-mono text-sm tabular-nums text-white/80">
                ${line.price.toLocaleString('es-AR')}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-1 border-t border-dashed border-white/15 px-4 py-4">
          <div className="flex items-end justify-between">
            <span className="text-xs uppercase tracking-wide text-white/40">Total</span>
            <span className="font-mono text-2xl tabular-nums text-white">
              ${total.toLocaleString('es-AR')}
            </span>
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="mt-3 w-full rounded-md bg-[#c43c2c] py-2.5 text-sm font-semibold text-white"
          >
            Cobrar · F4
          </button>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-[var(--mk-ink-3)]">Así se ve el POS a la hora pico. Tres toques y listo.</p>
    </div>
  );
}
