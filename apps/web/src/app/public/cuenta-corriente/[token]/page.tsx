'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { StockRapidoLogo } from '@/components/brand/StockRapidoLogo';
import {
  downloadFiscalReceipt,
  paymentMethodLabel,
  printFiscalReceipt,
  type FiscalReceiptLike,
} from '@/lib/fiscal-receipt';

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
    saleId?: string;
    items?: Array<{ name: string; qty: number; unitPrice: number; subtotal: number }>;
    invoiceLabel?: string | null;
    docKind?: string | null;
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

function moneyExact(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function dateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function dateLong(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function PublicCuentaCorrientePage() {
  const params = useParams();
  const token = String(params.token ?? '');
  const [data, setData] = useState<PublicAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState<string>('');

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

  useEffect(() => {
    if (!data?.business.accentColor) return;
    document.documentElement.style.setProperty('--brand-accent', data.business.accentColor);
    document.documentElement.style.setProperty('--brand-primary-btn', data.business.accentColor);
  }, [data?.business.accentColor]);

  const balance = data?.customer.balance ?? 0;
  const summary = useMemo(() => {
    if (!data) return { cargos: 0, pagos: 0, ventas: 0, items: 0 };
    let cargos = 0;
    let pagos = 0;
    let ventas = 0;
    let items = 0;
    for (const m of data.movements) {
      if (m.kind === 'cargo') {
        cargos += m.amount;
        ventas += 1;
        items += m.items?.length ?? 0;
      } else {
        pagos += m.amount;
      }
    }
    return { cargos, pagos, ventas, items };
  }, [data]);

  const fetchReceipt = async (saleId: string) => {
    return publicApi<FiscalReceiptLike>(`/public/cuenta-corriente/${token}/sales/${saleId}/receipt`);
  };

  const handlePrint = async (saleId: string) => {
    setReceiptBusy(`print-${saleId}`);
    try {
      const receipt = await fetchReceipt(saleId);
      await printFiscalReceipt(receipt);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo abrir el comprobante');
    } finally {
      setReceiptBusy('');
    }
  };

  const handleDownload = async (saleId: string) => {
    setReceiptBusy(`dl-${saleId}`);
    try {
      const receipt = await fetchReceipt(saleId);
      await downloadFiscalReceipt(receipt);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo descargar el comprobante');
    } finally {
      setReceiptBusy('');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-app text-fg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-hair border-t-[color:var(--brand-accent,#DC2626)]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-app px-6 text-fg">
        <div className="max-w-md rounded-xl border border-hair bg-surface p-6 text-center">
          <p className="text-lg font-bold">Link no disponible</p>
          <p className="mt-2 text-sm text-fg-muted">
            {error || 'Pedile al comercio que te comparta el acceso nuevamente.'}
          </p>
        </div>
      </div>
    );
  }

  const logoOk =
    data.business.logoUrl &&
    (data.business.logoUrl.startsWith('data:') ||
      data.business.logoUrl.startsWith('http://') ||
      data.business.logoUrl.startsWith('https://'));

  return (
    <div className="min-h-dvh bg-app text-fg">
      <header className="border-b border-hair-soft bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          {logoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.business.logoUrl!}
              alt=""
              className="h-10 w-10 shrink-0 bg-transparent object-contain"
            />
          ) : (
            <StockRapidoLogo variant="icon" size="sm" href={null} className="shrink-0" />
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-tight">{data.business.name}</p>
            <p className="text-xs text-fg-faint">Estado de cuenta · solo lectura</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-xl border border-hair-soft bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-fg-faint">Cliente</p>
          <h1 className="mt-1 text-2xl font-bold">{data.customer.name}</h1>
          {data.business.address && (
            <p className="mt-1 text-sm text-fg-muted">{data.business.address}</p>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div
              className={`rounded-xl border px-4 py-3 ${
                balance > 0
                  ? 'border-warn/30 bg-[var(--warn-soft)]'
                  : balance < 0
                    ? 'border-ok/30 bg-[var(--ok-soft)]'
                    : 'border-hair-soft bg-raised'
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-fg-faint">
                {balance > 0 ? 'Saldo pendiente' : balance < 0 ? 'Saldo a favor' : 'Situación'}
              </p>
              <p
                className={`mt-1 font-mono text-3xl font-bold tabular-nums ${
                  balance > 0 ? 'text-warn' : balance < 0 ? 'text-ok' : 'text-fg'
                }`}
              >
                {balance === 0 ? 'Al día' : money(Math.abs(balance))}
              </p>
            </div>
            <div className="rounded-xl border border-hair-soft bg-raised px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-fg-faint">Compras a cuenta</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{money(summary.cargos)}</p>
              <p className="mt-1 text-xs text-fg-muted">
                {summary.ventas} venta{summary.ventas === 1 ? '' : 's'} · {summary.items} ítems
              </p>
            </div>
            <div className="rounded-xl border border-hair-soft bg-raised px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-fg-faint">Pagos registrados</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ok">
                {money(summary.pagos)}
              </p>
              <p className="mt-1 text-xs text-fg-muted">
                {data.movements.filter((m) => m.kind === 'pago').length} movimiento
                {data.movements.filter((m) => m.kind === 'pago').length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Detalle de la cuenta</h2>
              <p className="text-sm text-fg-muted">
                Cada compra muestra productos, montos y comprobante. Podés imprimir o descargar.
              </p>
            </div>
          </div>

          {data.movements.length === 0 ? (
            <div className="rounded-xl border border-hair-soft bg-surface px-5 py-10 text-center text-sm text-fg-faint">
              Todavía no hay movimientos en esta cuenta.
            </div>
          ) : (
            <ul className="space-y-3">
              {data.movements.map((m) => {
                if (m.kind === 'pago') {
                  return (
                    <li
                      key={m.id}
                      className="rounded-xl border border-[color:var(--ok)]/25 bg-[var(--ok-soft)] px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-ok/80">Pago recibido</p>
                          <p className="mt-1 font-semibold text-fg">Abono a cuenta corriente</p>
                          <p className="mt-1 text-sm text-fg-muted">
                            {dateLong(m.date)} · {dateTime(m.date)}
                          </p>
                          {m.note && <p className="mt-1 text-sm text-fg-muted">Nota: {m.note}</p>}
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xl font-bold tabular-nums text-ok">
                            −{moneyExact(m.amount)}
                          </p>
                          <p className="mt-1 font-mono text-xs text-fg-faint">
                            Saldo {moneyExact(m.balanceAfter)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                }

                const open = openId === m.id;
                const items = m.items || [];
                const isFactura = m.docKind === 'FACTURA_C';
                return (
                  <li key={m.id} className="overflow-hidden rounded-xl border border-hair-soft bg-surface">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hair-soft px-4 py-4">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-fg-faint">
                          {isFactura ? 'Factura C' : 'Comprobante interno'} · cuenta corriente
                        </p>
                        <p className="mt-1 text-base font-semibold text-fg">
                          Compra del {dateLong(m.date)}
                        </p>
                        <p className="mt-1 text-sm text-fg-muted">
                          {dateTime(m.date)}
                          {items.length ? ` · ${items.length} producto${items.length === 1 ? '' : 's'}` : ''}
                          {m.invoiceLabel ? ` · ${m.invoiceLabel}` : ''}
                          {m.note ? ` · ${m.note}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-fg-faint">
                          Medio: {paymentMethodLabel('fiado')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xl font-bold tabular-nums text-warn">
                          +{moneyExact(m.amount)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-fg-faint">
                          Saldo {moneyExact(m.balanceAfter)}
                        </p>
                      </div>
                    </div>

                    {items.length > 0 && (
                      <div className="border-b border-hair-soft">
                        <div className="flex items-center justify-between px-4 py-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                            Productos
                          </p>
                          {items.length > 4 && (
                            <button
                              type="button"
                              className="text-xs text-brand"
                              onClick={() => setOpenId(open ? null : m.id)}
                            >
                              {open ? 'Ver menos' : `Ver los ${items.length}`}
                            </button>
                          )}
                        </div>
                        <ul className="divide-y divide-hair-soft/60">
                          {(open ? items : items.slice(0, 4)).map((it, idx) => (
                            <li
                              key={`${m.id}-${idx}`}
                              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-fg">{it.name}</span>
                                <span className="text-xs text-fg-faint">
                                  {it.qty} × {moneyExact(it.unitPrice)}
                                </span>
                              </span>
                              <span className="shrink-0 font-mono tabular-nums text-fg-muted">
                                {moneyExact(it.subtotal)}
                              </span>
                            </li>
                          ))}
                          {!open && items.length > 4 && (
                            <li className="px-4 py-2 text-xs text-fg-faint">
                              +{items.length - 4} productos más…
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {m.saleId && (
                      <div className="flex flex-wrap gap-2 px-4 py-3">
                        <button
                          type="button"
                          disabled={receiptBusy === `print-${m.saleId}`}
                          onClick={() => void handlePrint(m.saleId!)}
                          className="rounded-lg btn-brand px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          {receiptBusy === `print-${m.saleId}` ? 'Abriendo…' : 'Imprimir comprobante'}
                        </button>
                        <button
                          type="button"
                          disabled={receiptBusy === `dl-${m.saleId}`}
                          onClick={() => void handleDownload(m.saleId!)}
                          className="rounded-lg border border-hair bg-raised px-3 py-2 text-sm font-medium text-fg hover:bg-raised2 disabled:opacity-50"
                        >
                          {receiptBusy === `dl-${m.saleId}` ? 'Descargando…' : 'Descargar'}
                        </button>
                        <span className="self-center text-xs text-fg-faint">
                          {isFactura ? 'Factura C' : 'Comprobante interno'}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="border-t border-hair-soft pt-5 pb-10 text-center text-xs text-fg-faint">
          <p>
            Actualizado{' '}
            {new Date(data.generatedAt).toLocaleString('es-AR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>
          <p className="mt-1">Vista de solo lectura · no podés modificar esta cuenta desde acá</p>
          <div className="mt-4 flex justify-center opacity-70">
            <StockRapidoLogo variant="system" size="sm" href={null} />
          </div>
        </footer>
      </main>
    </div>
  );
}
