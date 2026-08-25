'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';

type PublicAccount = {
  business: {
    name: string;
    legalName: string;
    address: string | null;
    logoUrl: string | null;
    accentColor: string;
  };
  customer: { name: string; balance: number };
  movements: Array<{
    id: string;
    kind: 'cargo' | 'pago';
    date: string;
    amount: number;
    note?: string | null;
    items?: Array<{ name: string; qty: number; unitPrice: number; subtotal: number }>;
    invoiceLabel?: string | null;
    balanceAfter: number;
  }>;
  generatedAt: string;
  readOnly: true;
};

function money(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function PublicCuentaCorrientePage() {
  const params = useParams();
  const token = String(params.token ?? '');
  const [data, setData] = useState<PublicAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await publicApi<PublicAccount>(`/public/cuenta-corriente/${token}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la cuenta');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const accent = data?.business.accentColor || '#DC2626';
  const balance = data?.customer.balance ?? 0;
  const balanceTone =
    balance > 0 ? 'debe' : balance < 0 ? 'favor' : 'aldia';

  const summary = useMemo(() => {
    if (!data) return { cargos: 0, pagos: 0, count: 0 };
    let cargos = 0;
    let pagos = 0;
    for (const m of data.movements) {
      if (m.kind === 'cargo') cargos += m.amount;
      else pagos += m.amount;
    }
    return { cargos, pagos, count: data.movements.length };
  }, [data]);

  if (loading) {
    return (
      <div className="cc-public min-h-dvh flex items-center justify-center" style={{ ['--cc-accent' as string]: accent }}>
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--cc-accent)] border-t-transparent" />
        <style>{`
          .cc-public {
            background: radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--cc-accent) 16%, #0c0c0f), transparent 55%),
              radial-gradient(900px 500px at 100% 0%, rgba(255, 255, 255, 0.04), transparent 50%), #0c0c0f;
            color: #f3f1ec;
          }
        `}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="cc-public min-h-dvh flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-3xl text-[#f3f1ec]" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
            Link no disponible
          </p>
          <p className="mt-3 text-[#9a968c]">{error || 'Pedile al comercio que te comparta el acceso nuevamente.'}</p>
        </div>
        <style>{`.cc-public { background: #0c0c0f; }`}</style>
      </div>
    );
  }

  return (
    <div className="cc-public min-h-dvh" style={{ ['--cc-accent' as string]: accent }}>
      <style>{`
        .cc-public {
          --cc-ink: #f3f1ec;
          --cc-muted: #9a968c;
          --cc-line: rgba(243, 241, 236, 0.1);
          --cc-panel: rgba(20, 20, 24, 0.72);
          color: var(--cc-ink);
          background:
            radial-gradient(1100px 520px at 8% -8%, color-mix(in srgb, var(--cc-accent) 22%, transparent), transparent 58%),
            radial-gradient(800px 420px at 92% 8%, rgba(255, 255, 255, 0.05), transparent 48%),
            linear-gradient(180deg, #101014 0%, #0c0c0f 48%, #0a0a0c 100%);
          font-family: var(--font-landing), var(--font-sans), system-ui, sans-serif;
        }
        .cc-public .cc-display {
          font-family: var(--font-display), Georgia, serif;
          letter-spacing: -0.02em;
        }
        .cc-public .cc-rise {
          animation: ccrise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .cc-public .cc-rise-delay {
          animation: ccrise 0.85s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
        }
        .cc-public .cc-rise-delay-2 {
          animation: ccrise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.22s both;
        }
        @keyframes ccrise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: none; }
        }
        .cc-public .cc-balance {
          animation: ccglow 3.2s ease-in-out infinite;
        }
        @keyframes ccglow {
          0%, 100% { text-shadow: 0 0 0 transparent; }
          50% { text-shadow: 0 0 28px color-mix(in srgb, var(--cc-accent) 35%, transparent); }
        }
        .cc-public .cc-row { transition: background 0.2s ease, border-color 0.2s ease; }
        .cc-public .cc-row:hover { background: rgba(255, 255, 255, 0.03); }
      `}</style>

      <header className="cc-rise relative overflow-hidden px-5 pb-10 pt-10 sm:px-8 sm:pt-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--cc-accent)] to-transparent opacity-70"
        />
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              {data.business.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.business.logoUrl}
                  alt=""
                  className="mb-4 h-11 w-auto max-w-[180px] object-contain"
                />
              ) : null}
              <p className="cc-display text-4xl leading-none text-[color:var(--cc-ink)] sm:text-5xl">
                {data.business.name}
              </p>
              <p className="mt-3 text-sm text-[color:var(--cc-muted)]">
                Estado de cuenta · solo lectura
                {data.business.address ? ` · ${data.business.address}` : ''}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-[color:var(--cc-line)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--cc-muted)]">
              Permanente
            </span>
          </div>

          <div className="cc-rise-delay grid gap-1">
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--cc-muted)]">Cliente</p>
            <p className="text-xl font-semibold text-[color:var(--cc-ink)]">{data.customer.name}</p>
          </div>

          <div className="cc-rise-delay-2">
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--cc-muted)]">
              {balanceTone === 'debe' ? 'Saldo pendiente' : balanceTone === 'favor' ? 'Saldo a favor' : 'Situación'}
            </p>
            <p
              className={`cc-display cc-balance mt-2 text-5xl tabular-nums sm:text-6xl ${
                balanceTone === 'debe'
                  ? 'text-[color:var(--cc-accent)]'
                  : balanceTone === 'favor'
                    ? 'text-emerald-400'
                    : 'text-[color:var(--cc-ink)]'
              }`}
            >
              {balanceTone === 'aldia' ? 'Al día' : money(Math.abs(balance))}
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[color:var(--cc-muted)]">
              {balanceTone === 'debe'
                ? 'Este es el monto que aún figura a tu nombre en la cuenta corriente del comercio.'
                : balanceTone === 'favor'
                  ? 'Tenés saldo a favor. El comercio lo descontará en próximas compras.'
                  : 'No hay saldo pendiente en este momento.'}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
        <section className="mb-8 grid grid-cols-3 gap-3 border-y border-[color:var(--cc-line)] py-5 text-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--cc-muted)]">Cargos</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-[color:var(--cc-ink)]">{money(summary.cargos)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--cc-muted)]">Pagos</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-emerald-400">{money(summary.pagos)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--cc-muted)]">Movimientos</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-[color:var(--cc-ink)]">{summary.count}</p>
          </div>
        </section>

        <h2 className="mb-4 text-xs uppercase tracking-[0.18em] text-[color:var(--cc-muted)]">Detalle</h2>

        {data.movements.length === 0 ? (
          <p className="rounded-2xl border border-[color:var(--cc-line)] bg-[color:var(--cc-panel)] px-5 py-10 text-center text-sm text-[color:var(--cc-muted)]">
            Todavía no hay movimientos en esta cuenta.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.movements.map((m) => {
              const open = openId === m.id;
              const isCargo = m.kind === 'cargo';
              return (
                <li
                  key={m.id}
                  className="cc-row overflow-hidden rounded-2xl border border-[color:var(--cc-line)] bg-[color:var(--cc-panel)] backdrop-blur"
                >
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left sm:px-5"
                    onClick={() => setOpenId(open ? null : m.id)}
                    disabled={!isCargo || !m.items?.length}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[color:var(--cc-ink)]">
                        {isCargo ? 'Compra a cuenta' : 'Pago registrado'}
                      </span>
                      <span className="mt-1 block text-xs text-[color:var(--cc-muted)]">
                        {dateLabel(m.date)} · {timeLabel(m.date)}
                        {m.invoiceLabel ? ` · ${m.invoiceLabel}` : ''}
                        {m.note ? ` · ${m.note}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={`block font-mono text-sm font-semibold tabular-nums ${
                          isCargo ? 'text-[color:var(--cc-accent)]' : 'text-emerald-400'
                        }`}
                      >
                        {isCargo ? '+' : '−'}
                        {money(m.amount)}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-[color:var(--cc-muted)]">
                        Saldo {money(m.balanceAfter)}
                      </span>
                    </span>
                  </button>
                  {open && m.items && m.items.length > 0 && (
                    <ul className="border-t border-[color:var(--cc-line)] px-4 py-2 sm:px-5">
                      {m.items.map((it, idx) => (
                        <li
                          key={`${m.id}-${idx}`}
                          className="flex items-center justify-between gap-3 border-b border-[color:var(--cc-line)] py-2.5 last:border-0"
                        >
                          <span className="min-w-0 truncate text-sm text-[color:var(--cc-ink)]/90">{it.name}</span>
                          <span className="shrink-0 font-mono text-xs text-[color:var(--cc-muted)]">
                            ×{it.qty} · {money(it.subtotal)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <footer className="mt-12 border-t border-[color:var(--cc-line)] pt-6 text-center text-xs text-[color:var(--cc-muted)]">
          <p>
            Actualizado {new Date(data.generatedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
          <p className="mt-1">Vista de solo lectura · no podés modificar esta cuenta desde acá</p>
          <p className="mt-4 tracking-[0.12em] text-[color:var(--cc-muted)]/70">STOCKRÁPIDO</p>
        </footer>
      </main>
    </div>
  );
}
