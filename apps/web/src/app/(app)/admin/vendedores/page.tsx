'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlatformGate } from '@/components/admin/PlatformGate';
import { api } from '@/lib/api';
import { moneyArs } from '@/lib/support-labels';

type SellerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  code: string;
  active: boolean;
  commissionType: 'percent' | 'fixed' | string;
  commissionValue: number;
  attributionsCount: number;
  balance: number;
};

function commissionLabel(type: string, value: number) {
  if (type === 'fixed') return `${moneyArs(value)} por programa vendido`;
  return `${value}% de cada pago`;
}

function ListInner() {
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    code: '',
    commissionType: 'percent' as 'percent' | 'fixed',
    commissionValue: '10',
  });

  const load = () =>
    api<SellerRow[]>('/platform/sellers')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/platform/sellers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          code: form.code || undefined,
          commissionType: form.commissionType,
          commissionValue: Number(form.commissionValue.replace(',', '.')),
        }),
      });
      setForm({ name: '', email: '', phone: '', code: '', commissionType: 'percent', commissionValue: '10' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="space-y-6">
      <PageHeader
        title="Vendedores del sistema"
        subtitle="Códigos para quienes venden StockRápido. Comisión en % o fijo, y cuenta corriente mes a mes."
      />
      {error ? <p className="text-sm text-crit">{error}</p> : null}

      <form onSubmit={create} className="rounded-xl border border-hair-soft bg-surface p-5">
        <h2 className="font-semibold">Nuevo vendedor</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Generamos un código o poné el que quieras darle. El % se calcula sobre cada pago acreditado del local; el fijo se acredita una sola vez, cuando ese local paga el primer abono.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">
            Nombre
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Teléfono
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Código (opcional)
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="Se genera solo"
              className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono"
            />
          </label>
          <label className="text-sm">
            Tipo de comisión
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
            <input
              required
              inputMode="decimal"
              value={form.commissionValue}
              onChange={(e) => setForm((f) => ({ ...f, commissionValue: e.target.value }))}
              className="mt-1 block w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono"
            />
          </label>
        </div>
        <button type="submit" disabled={busy} className="btn-brand mt-4 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          {busy ? 'Creando…' : 'Crear vendedor'}
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-hair-soft">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-raised text-xs uppercase text-fg-faint">
            <tr>
              <th className="p-3 font-medium">Vendedor</th>
              <th className="p-3 font-medium">Código</th>
              <th className="p-3 font-medium">Comisión</th>
              <th className="p-3 text-right font-medium">Locales</th>
              <th className="p-3 text-right font-medium">Saldo</th>
              <th className="p-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-hair-soft">
                <td className="p-3">
                  <Link href={`/admin/vendedores/${row.id}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  <p className="text-xs text-fg-faint">{row.email || row.phone || '—'}</p>
                </td>
                <td className="p-3 font-mono tracking-widest">{row.code}</td>
                <td className="p-3">{commissionLabel(row.commissionType, row.commissionValue)}</td>
                <td className="p-3 text-right font-mono">{row.attributionsCount}</td>
                <td className="p-3 text-right font-mono">{moneyArs(row.balance)}</td>
                <td className="p-3">{row.active ? 'Activo' : 'Inactivo'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-fg-muted">Todavía no hay vendedores. Creá el primero arriba.</p> : null}
      </div>
    </Container>
  );
}

export default function AdminSellersPage() {
  return (
    <PlatformGate>
      <ListInner />
    </PlatformGate>
  );
}
