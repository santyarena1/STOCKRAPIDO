'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlatformGate } from '@/components/admin/PlatformGate';
import { api } from '@/lib/api';
import { moneyArs } from '@/lib/support-labels';

type Overview = {
  businesses: number;
  trials: number;
  pendingPayment: number;
  active: number;
  complimentary: number;
  openTickets: number;
  pendingInvoices: number;
  salesToday: { count: number; amount: number };
};

export default function AdminHomePage() {
  return (
    <PlatformGate>
      <AdminHomeInner />
    </PlatformGate>
  );
}

function AdminHomeInner() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Overview>('/platform/overview')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, []);

  const cards = data
    ? [
        { href: '/admin/negocios', label: 'Cuentas', value: String(data.businesses), hint: `${data.active} activas · ${data.complimentary ?? 0} cortesía · ${data.trials} en prueba` },
        { href: '/admin/negocios?status=pending_payment', label: 'Pagos pendientes', value: String(data.pendingPayment), hint: `${data.pendingInvoices} comprobantes` },
        { href: '/admin/tickets', label: 'Tickets abiertos', value: String(data.openTickets), hint: 'Soporte de los kioscos' },
        { href: '/admin/negocios', label: 'Ventas de hoy (todas las cuentas)', value: moneyArs(data.salesToday.amount), hint: `${data.salesToday.count} tickets` },
      ]
    : [];

  return (
    <Container className="space-y-6">
      <PageHeader title="Panel admin" subtitle="Todas las cuentas, pagos y tickets. Solo vos y el equipo de StockRápido." />
      {error ? <p className="text-sm text-crit">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-xl border border-hair-soft bg-surface p-5 hover:border-hair">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</p>
            <p className="mt-1 text-sm text-fg-muted">{c.hint}</p>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/negocios" className="btn-brand rounded-lg px-4 py-2 text-sm font-medium">
          Ver cuentas
        </Link>
        <Link href="/admin/tickets" className="rounded-lg border border-hair px-4 py-2 text-sm font-medium hover:bg-raised">
          Ver tickets
        </Link>
      </div>
    </Container>
  );
}
