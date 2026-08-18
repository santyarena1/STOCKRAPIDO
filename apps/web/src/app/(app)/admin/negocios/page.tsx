'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlatformGate } from '@/components/admin/PlatformGate';
import { api } from '@/lib/api';
import { formatWhen, moneyArs, PLAN_STATUS_LABELS } from '@/lib/support-labels';

type Row = {
  id: string;
  name: string;
  cuit: string | null;
  createdAt: string;
  planName: string;
  planStatus: string;
  owner: { name: string; email: string } | null;
  usersCount: number;
  productsCount: number;
  salesCount: number;
  openTickets: number;
  lastSaleAt: string | null;
  pendingInvoice: { amount: number } | null;
};

function ListInner() {
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    api<Row[]>('/platform/businesses', { params: { q: q || undefined, status: status || undefined } })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <Container className="space-y-6">
      <PageHeader title="Cuentas" subtitle="Cada kiosco registrado: plan, pago y actividad." />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, CUIT o email"
          className="min-w-[220px] flex-1 rounded-lg border border-hair-soft bg-raised px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-hair-soft bg-raised px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="trial">Prueba</option>
          <option value="active">Activo</option>
          <option value="complimentary">Cortesía</option>
          <option value="pending_payment">Pago pendiente</option>
          <option value="past_due">Pago vencido</option>
          <option value="canceled">Cancelado</option>
        </select>
        <button type="submit" className="btn-brand rounded-lg px-4 py-2 text-sm font-medium">
          Buscar
        </button>
      </form>
      {error ? <p className="text-sm text-crit">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-hair-soft">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-raised text-xs uppercase text-fg-faint">
            <tr>
              <th className="p-3 font-medium">Kiosco</th>
              <th className="p-3 font-medium">Dueño</th>
              <th className="p-3 font-medium">Plan</th>
              <th className="p-3 font-medium">Pago</th>
              <th className="p-3 text-right font-medium">Usuarios</th>
              <th className="p-3 text-right font-medium">Ventas</th>
              <th className="p-3 font-medium">Última venta</th>
              <th className="p-3 text-right font-medium">Tickets</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-hair-soft">
                <td className="p-3">
                  <Link href={`/admin/negocios/${row.id}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  <p className="text-xs text-fg-faint">{row.cuit || 'sin CUIT'}</p>
                </td>
                <td className="p-3">
                  <p>{row.owner?.name || '—'}</p>
                  <p className="text-xs text-fg-faint">{row.owner?.email}</p>
                </td>
                <td className="p-3">{row.planName}</td>
                <td className="p-3">
                  {PLAN_STATUS_LABELS[row.planStatus] || row.planStatus}
                  {row.pendingInvoice ? (
                    <p className="text-xs text-warn">{moneyArs(row.pendingInvoice.amount)}</p>
                  ) : null}
                </td>
                <td className="p-3 text-right font-mono">{row.usersCount}</td>
                <td className="p-3 text-right font-mono">{row.salesCount}</td>
                <td className="p-3 text-fg-muted">{formatWhen(row.lastSaleAt)}</td>
                <td className="p-3 text-right font-mono">{row.openTickets}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-fg-muted">No hay cuentas con ese filtro.</p> : null}
      </div>
    </Container>
  );
}

export default function AdminBusinessesPage() {
  return (
    <PlatformGate>
      <Suspense fallback={<Container><PageHeader title="Cuentas" /></Container>}>
        <ListInner />
      </Suspense>
    </PlatformGate>
  );
}
