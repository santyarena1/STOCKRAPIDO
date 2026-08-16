'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { formatWhen, TICKET_CATEGORIES, TICKET_STATUSES } from '@/lib/support-labels';

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  updatedAt: string;
  _count: { messages: number };
};

export default function SoportePage() {
  const [rows, setRows] = useState<Ticket[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Ticket[]>('/support/tickets')
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, []);

  return (
    <Container className="space-y-6">
      <PageHeader
        title="Soporte"
        subtitle="Si hay un problema con el sistema o con un pago, abrí un ticket. Lo vemos desde el panel."
        actions={
          <Link href="/soporte/nuevo" className="btn-brand rounded-lg px-4 py-2 text-sm font-medium">
            Nuevo ticket
          </Link>
        }
      />
      {error ? <p className="text-sm text-crit">{error}</p> : null}
      <ul className="divide-y divide-hair-soft overflow-hidden rounded-xl border border-hair-soft bg-surface">
        {rows.map((t) => (
          <li key={t.id}>
            <Link href={`/soporte/${t.id}`} className="block px-4 py-3 hover:bg-raised">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{t.subject}</p>
                <span className="text-xs text-fg-faint">{formatWhen(t.updatedAt)}</span>
              </div>
              <p className="mt-1 text-sm text-fg-muted">
                {TICKET_CATEGORIES[t.category] || t.category} · {TICKET_STATUSES[t.status] || t.status} · {t._count.messages}{' '}
                mensajes
              </p>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-4 py-6 text-sm text-fg-muted">Todavía no hay tickets. Si algo falla, abrí uno.</li> : null}
      </ul>
    </Container>
  );
}
