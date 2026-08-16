'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlatformGate } from '@/components/admin/PlatformGate';
import { api } from '@/lib/api';
import { formatWhen, TICKET_CATEGORIES, TICKET_STATUSES } from '@/lib/support-labels';

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  updatedAt: string;
  createdAt: string;
  user: { name: string; email: string };
  business: { id: string; name: string };
  _count: { messages: number };
};

export default function AdminTicketsPage() {
  return (
    <PlatformGate>
      <Inner />
    </PlatformGate>
  );
}

function Inner() {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Ticket[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    api<Ticket[]>('/platform/tickets', { params: { status: status || undefined } })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <Container className="space-y-6">
      <PageHeader title="Tickets" subtitle="Problemas y consultas que abren los kioscos." />
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-lg border border-hair-soft bg-raised px-3 py-2 text-sm"
      >
        <option value="">Todos</option>
        <option value="open">Abiertos</option>
        <option value="in_progress">En curso</option>
        <option value="waiting">Esperando respuesta</option>
        <option value="resolved">Resueltos</option>
        <option value="closed">Cerrados</option>
      </select>
      {error ? <p className="text-sm text-crit">{error}</p> : null}
      <ul className="divide-y divide-hair-soft overflow-hidden rounded-xl border border-hair-soft bg-surface">
        {rows.map((t) => (
          <li key={t.id}>
            <Link href={`/admin/tickets/${t.id}`} className="block px-4 py-3 hover:bg-raised">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{t.subject}</p>
                <span className="text-xs text-fg-faint">{formatWhen(t.updatedAt)}</span>
              </div>
              <p className="mt-1 text-sm text-fg-muted">
                {t.business.name} · {t.user.name} · {TICKET_CATEGORIES[t.category] || t.category} ·{' '}
                {TICKET_STATUSES[t.status] || t.status} · {t._count.messages} mensajes
              </p>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-4 py-6 text-sm text-fg-muted">No hay tickets con ese filtro.</li> : null}
      </ul>
    </Container>
  );
}
