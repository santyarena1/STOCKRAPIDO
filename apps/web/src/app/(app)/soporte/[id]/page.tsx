'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { formatWhen, TICKET_CATEGORIES, TICKET_STATUSES } from '@/lib/support-labels';

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  messages: Array<{
    id: string;
    body: string;
    fromStaff: boolean;
    createdAt: string;
    user: { name: string };
  }>;
};

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<Ticket>(`/support/tickets/${params.id}`)
      .then(setTicket)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const reply = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const t = await api<Ticket>(`/support/tickets/${params.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      setTicket(t);
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  if (!ticket) {
    return (
      <Container>
        <PageHeader title="Ticket" subtitle={error || 'Cargando…'} />
      </Container>
    );
  }

  const closed = ticket.status === 'closed';

  return (
    <Container className="space-y-6">
      <PageHeader
        title={ticket.subject}
        subtitle={`${TICKET_CATEGORIES[ticket.category] || ticket.category} · ${TICKET_STATUSES[ticket.status] || ticket.status}`}
        actions={
          <Link href="/soporte" className="rounded-lg border border-hair px-3 py-1.5 text-sm hover:bg-raised">
            Volver
          </Link>
        }
      />
      {error ? <p className="text-sm text-crit">{error}</p> : null}
      <div className="space-y-3">
        {ticket.messages.map((m) => (
          <article
            key={m.id}
            className={`rounded-xl border px-4 py-3 text-sm ${m.fromStaff ? 'border-[color:var(--brand-accent)] bg-surface' : 'border-hair-soft bg-raised'}`}
          >
            <p className="text-xs text-fg-faint">
              {m.fromStaff ? 'StockRápido' : m.user.name} · {formatWhen(m.createdAt)}
            </p>
            <p className="mt-2 whitespace-pre-wrap">{m.body}</p>
          </article>
        ))}
      </div>
      {closed ? (
        <p className="text-sm text-fg-muted">Este ticket está cerrado. Si sigue el problema, abrí uno nuevo.</p>
      ) : (
        <form onSubmit={reply} className="space-y-3 rounded-xl border border-hair-soft bg-surface p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            minLength={1}
            rows={4}
            placeholder="Agregar un mensaje…"
            className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}
    </Container>
  );
}
