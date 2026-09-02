'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlatformGate } from '@/components/admin/PlatformGate';
import { api } from '@/lib/api';
import { formatWhen, moneyArs, PLAN_STATUS_LABELS } from '@/lib/support-labels';

type Detail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  code: string;
  active: boolean;
  commissionType: 'percent' | 'fixed' | string;
  commissionValue: number;
  attributionsCount: number;
  balance: number;
  attributions: Array<{
    id: string;
    businessId: string;
    businessName: string;
    planName: string;
    planStatus: string;
    code: string;
    createdAt: string;
  }>;
  months: Array<{
    year: number;
    month: number;
    label: string;
    commissions: number;
    payments: number;
    adjustments: number;
    net: number;
    running: number;
  }>;
  ledger: Array<{
    id: string;
    type: string;
    amount: number;
    description: string | null;
    periodLabel: string;
    createdAt: string;
  }>;
};

const LEDGER_TYPE: Record<string, string> = {
  commission: 'Comisión',
  payment: 'Pago',
  adjustment: 'Ajuste',
};

function DetailInner() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
    code: '',
    active: true,
    commissionType: 'percent' as 'percent' | 'fixed',
    commissionValue: '',
  });
  const [pay, setPay] = useState({ amount: '', description: '', type: 'payment' as 'payment' | 'adjustment' });
  const [assignId, setAssignId] = useState('');

  const load = () =>
    api<Detail>(`/platform/sellers/${params.id}`)
      .then((d) => {
        setData(d);
        setForm({
          name: d.name,
          email: d.email || '',
          phone: d.phone || '',
          notes: d.notes || '',
          code: d.code,
          active: d.active,
          commissionType: d.commissionType === 'fixed' ? 'fixed' : 'percent',
          commissionValue: String(d.commissionValue),
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy('');
    }
  };

  if (!data) {
    return (
      <Container>
        <PageHeader title="Vendedor" subtitle={error || 'Cargando…'} />
      </Container>
    );
  }

  const sharePath = `/register?ref=${encodeURIComponent(data.code)}`;

  return (
    <Container className="space-y-8">
      <PageHeader
        title={data.name}
        subtitle={`Código ${data.code} · saldo ${moneyArs(data.balance)}`}
        actions={
          <Link href="/admin/vendedores" className="rounded-lg border border-hair px-3 py-1.5 text-sm hover:bg-raised">
            Volver
          </Link>
        }
      />
      {error ? <p className="text-sm text-crit">{error}</p> : null}

      <section className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="font-semibold">Código para vender</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Dáselo al vendedor para que el local lo ponga al registrarse, o compartí el link.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-lg tracking-widest">{data.code}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(data.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className="rounded-lg border border-hair px-3 py-2 text-sm hover:bg-raised"
          >
            {copied ? 'Copiado' : 'Copiar código'}
          </button>
          <span className="text-sm text-fg-muted">{sharePath}</span>
        </div>
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="font-semibold">Datos y comisión</h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act('save', () =>
              api(`/platform/sellers/${data.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  name: form.name,
                  email: form.email,
                  phone: form.phone,
                  notes: form.notes,
                  code: form.code,
                  active: form.active,
                  commissionType: form.commissionType,
                  commissionValue: Number(form.commissionValue.replace(',', '.')),
                }),
              }),
            );
          }}
        >
          <label className="text-sm">
            Nombre
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2" />
          </label>
          <label className="text-sm">
            Email
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2" />
          </label>
          <label className="text-sm">
            Teléfono
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2" />
          </label>
          <label className="text-sm">
            Código
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono" />
          </label>
          <label className="text-sm">
            Tipo
            <select
              value={form.commissionType}
              onChange={(e) => setForm((f) => ({ ...f, commissionType: e.target.value as 'percent' | 'fixed' }))}
              className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2"
            >
              <option value="percent">Porcentaje de lo vendido</option>
              <option value="fixed">Fijo por programa vendido</option>
            </select>
          </label>
          <label className="text-sm">
            {form.commissionType === 'fixed' ? 'Monto fijo (ARS)' : 'Porcentaje'}
            <input value={form.commissionValue} onChange={(e) => setForm((f) => ({ ...f, commissionValue: e.target.value }))} className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono" />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            Activo (si lo apagás, el código no suma locales nuevos ni comisiones nuevas)
          </label>
          <label className="text-sm sm:col-span-2">
            Notas
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2" />
          </label>
          <button type="submit" disabled={!!busy} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy === 'save' ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="font-semibold">Cuenta corriente mes a mes</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Saldo actual <strong>{moneyArs(data.balance)}</strong> (positivo = le debemos). Registrá un pago cuando se lo girás, o un ajuste si hay que corregir.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act('ledger', () =>
              api(`/platform/sellers/${data.id}/ledger`, {
                method: 'POST',
                body: JSON.stringify({
                  type: pay.type,
                  amount: Number(pay.amount.replace(',', '.')),
                  description: pay.description || undefined,
                }),
              }).then(() => setPay({ amount: '', description: '', type: pay.type })),
            );
          }}
        >
          <label className="text-sm">
            Tipo
            <select value={pay.type} onChange={(e) => setPay((p) => ({ ...p, type: e.target.value as 'payment' | 'adjustment' }))} className="mt-1 block rounded-lg border border-hair-soft bg-raised px-3 py-2">
              <option value="payment">Pago (sale de la cuenta)</option>
              <option value="adjustment">Ajuste (+ o −)</option>
            </select>
          </label>
          <label className="text-sm">
            Monto
            <input required value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} className="mt-1 block w-36 rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono" />
          </label>
          <label className="text-sm min-w-[180px] flex-1">
            Nota
            <input value={pay.description} onChange={(e) => setPay((p) => ({ ...p, description: e.target.value }))} className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2" />
          </label>
          <button type="submit" disabled={!!busy} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy === 'ledger' ? 'Cargando…' : 'Registrar'}
          </button>
        </form>
        {data.months.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-fg-faint">
                <tr>
                  <th className="py-2 pr-3">Mes</th>
                  <th className="py-2 pr-3 text-right">Comisiones</th>
                  <th className="py-2 pr-3 text-right">Pagos</th>
                  <th className="py-2 pr-3 text-right">Ajustes</th>
                  <th className="py-2 pr-3 text-right">Neto</th>
                  <th className="py-2 text-right">Saldo corrido</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={`${m.year}-${m.month}`} className="border-t border-hair-soft">
                    <td className="py-2 pr-3 capitalize">{m.label}</td>
                    <td className="py-2 pr-3 text-right font-mono">{moneyArs(m.commissions)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{moneyArs(m.payments)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{moneyArs(m.adjustments)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{moneyArs(m.net)}</td>
                    <td className="py-2 text-right font-mono">{moneyArs(m.running)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-fg-faint">Todavía no hay movimientos. Aparecen cuando un local atribuido paga el plan.</p>
        )}
        {data.ledger.length ? (
          <ul className="mt-4 space-y-1.5 text-sm">
            {data.ledger.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 border-t border-hair-soft pt-2">
                <span>
                  <span className="text-fg-faint">{LEDGER_TYPE[e.type] || e.type}</span>
                  {' · '}
                  {e.description || '—'}
                </span>
                <span className="font-mono">
                  {moneyArs(e.amount)} · {e.periodLabel} · {formatWhen(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="font-semibold">Locales que trajo</h2>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!assignId.trim()) return;
            void act('assign', () =>
              api(`/platform/sellers/${data.id}/assign`, {
                method: 'POST',
                body: JSON.stringify({ businessId: assignId.trim() }),
              }).then(() => setAssignId('')),
            );
          }}
        >
          <input
            value={assignId}
            onChange={(e) => setAssignId(e.target.value)}
            placeholder="ID de la cuenta (desde Cuentas)"
            className="min-w-[220px] flex-1 rounded-lg border border-hair-soft bg-raised px-3 py-2 text-sm font-mono"
          />
          <button type="submit" disabled={!!busy} className="rounded-lg border border-hair px-3 py-2 text-sm disabled:opacity-50">
            Atribuir local
          </button>
        </form>
        {data.attributions.length ? (
          <ul className="mt-4 space-y-1.5 text-sm">
            {data.attributions.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-t border-hair-soft pt-2">
                <Link href={`/admin/negocios/${a.businessId}`} className="text-brand hover:underline">
                  {a.businessName}
                </Link>
                <span className="text-fg-muted">
                  {a.planName} · {PLAN_STATUS_LABELS[a.planStatus] || a.planStatus} · {formatWhen(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-fg-faint">Todavía no hay locales con este código.</p>
        )}
      </section>
    </Container>
  );
}

export default function AdminSellerDetailPage() {
  return (
    <PlatformGate>
      <DetailInner />
    </PlatformGate>
  );
}
