'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';

type PartyDetail = {
  id: string;
  name: string;
  notes?: string | null;
  defaultCommissionPercent: number;
  active: boolean;
  balance: number;
  products: Array<{
    id: string;
    name: string;
    barcode?: string | null;
    cost: number | null;
    price: number;
    stock: number;
    effectiveCommissionPercent: number;
  }>;
  ledger: Array<{
    id: string;
    productName: string | null;
    qty: number;
    unitCost: number;
    commissionPercent: number;
    amount: number;
    voided: boolean;
    createdAt: string;
    note?: string | null;
  }>;
  payments: Array<{ id: string; amount: number; note?: string | null; createdAt: string }>;
};

function money(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

export default function ComisionadoDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [party, setParty] = useState<PartyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [pct, setPct] = useState('0');
  const [savingPct, setSavingPct] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<PartyDetail>(`/consignment/parties/${id}`);
      setParty(data);
      setPct(String(data.defaultCommissionPercent));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo cargar.');
      setParty(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePct = async () => {
    setSavingPct(true);
    try {
      await api(`/consignment/parties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ defaultCommissionPercent: Number(pct.replace(',', '.')) || 0 }),
      });
      await load();
      setMsg('% actualizado.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo guardar el %.');
    } finally {
      setSavingPct(false);
    }
  };

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(payAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return alert('Ingresá un monto válido.');
    setPaying(true);
    try {
      await api(`/consignment/parties/${id}/payment`, {
        method: 'POST',
        body: JSON.stringify({ amount, note: payNote.trim() || undefined }),
      });
      setPayAmount('');
      setPayNote('');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <Loader full />;
  if (!party) {
    return (
      <Container className="space-y-4">
        <Link href="/comisionados" className="text-brand hover:underline">← Comisionados</Link>
        <p className="text-fg-muted">{msg || 'No encontrado'}</p>
      </Container>
    );
  }

  return (
    <Container className="space-y-6">
      <PageHeader
        title={party.name}
        subtitle="Productos comisionados, saldo y cuenta corriente."
        actions={<Link href="/comisionados" className="text-sm text-fg-muted hover:text-fg">← Listado</Link>}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-hair-soft bg-surface p-4">
          <p className="text-xs text-fg-muted">Saldo a pagar</p>
          <p className={`mt-1 font-mono text-3xl font-bold tabular-nums ${party.balance > 0 ? 'text-warn' : 'text-ok'}`}>{money(party.balance)}</p>
        </div>
        <div className="rounded-xl border border-hair-soft bg-surface p-4 sm:col-span-2">
          <p className="text-xs text-fg-muted">% comisión default (sobre costo del producto)</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input value={pct} onChange={(e) => setPct(e.target.value)} className="w-28 rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-fg" />
            <button type="button" disabled={savingPct} onClick={() => void savePct()} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised disabled:opacity-50">
              {savingPct ? 'Guardando…' : 'Guardar %'}
            </button>
          </div>
          {party.notes ? <p className="mt-2 text-sm text-fg-faint">{party.notes}</p> : null}
          {msg ? <p className="mt-2 text-sm text-fg-muted">{msg}</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-base font-semibold text-fg">Productos ({party.products.length})</h2>
        {party.products.length === 0 ? (
          <p className="text-sm text-fg-muted">Ningún producto asignado. Activá “Producto comisionado” en la ficha del producto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-fg-faint">
                <tr>
                  <th className="pb-2 pr-3">Producto</th>
                  <th className="pb-2 pr-3 text-right">Costo</th>
                  <th className="pb-2 pr-3 text-right">%</th>
                  <th className="pb-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair-soft">
                {party.products.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/productos/${p.id}`} className="font-medium text-brand hover:underline">{p.name}</Link>
                      {p.barcode ? <span className="mt-0.5 block font-mono text-[11px] text-fg-faint">{p.barcode}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{p.cost == null ? '—' : money(p.cost)}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{p.effectiveCommissionPercent}%</td>
                    <td className="py-2 text-right font-mono tabular-nums">{p.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-base font-semibold text-fg">Cuenta corriente</h2>
        <form onSubmit={addPayment} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-hair bg-raised p-3">
          <label className="text-xs text-fg-muted">
            Monto
            <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" className="mt-1 block w-32 rounded-lg border border-hair bg-surface px-3 py-2 font-mono text-fg" />
          </label>
          <label className="min-w-[12rem] flex-1 text-xs text-fg-muted">
            Nota
            <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="mt-1 block w-full rounded-lg border border-hair bg-surface px-3 py-2 text-fg" />
          </label>
          <button type="submit" disabled={paying} className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {paying ? 'Guardando…' : 'Agregar pago'}
          </button>
        </form>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-fg-muted">Deudas por ventas</h3>
            <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
              {party.ledger.length === 0 ? <li className="text-fg-faint">Sin movimientos.</li> : null}
              {party.ledger.map((e) => (
                <li key={e.id} className={`rounded-lg border border-hair-soft px-3 py-2 ${e.voided ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-fg">{e.productName || 'Producto'}</span>
                    <span className="font-mono tabular-nums text-warn">+{money(e.amount)}</span>
                  </div>
                  <p className="text-xs text-fg-faint">
                    {e.qty} × {money(e.unitCost)} + {e.commissionPercent}% · {new Date(e.createdAt).toLocaleString('es-AR')}
                    {e.voided ? ' · anulado' : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-fg-muted">Pagos</h3>
            <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
              {party.payments.length === 0 ? <li className="text-fg-faint">Sin pagos.</li> : null}
              {party.payments.map((p) => (
                <li key={p.id} className="rounded-lg border border-hair-soft px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-fg-muted">{p.note || 'Pago'}</span>
                    <span className="font-mono tabular-nums text-ok">−{money(p.amount)}</span>
                  </div>
                  <p className="text-xs text-fg-faint">{new Date(p.createdAt).toLocaleString('es-AR')}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </Container>
  );
}
