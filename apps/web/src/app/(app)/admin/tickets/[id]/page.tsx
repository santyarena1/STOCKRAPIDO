'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  createdAt: string;
  user: { name: string; email: string };
  business: { id: string; name: string; planId: string; planStatus: string };
  messages: Array<{
    id: string;
    body: string;
    fromStaff: boolean;
    createdAt: string;
    user: { name: string; email: string };
  }>;
};

export default function AdminTicketDetailPage() {
  return (
    <PlatformGate>
      <Inner />
    </PlatformGate>
  );
}

function Inner() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<Ticket>(`/platform/tickets/${params.id}`)
      .then((t) => {
        setTicket(t);
        setStatus(t.status);
      })
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
      const t = await api<Ticket>(`/platform/tickets/${params.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      setTicket(t);
      setStatus(t.status);
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = async () => {
    setBusy(true);
    try {
      await api(`/platform/tickets/${params.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
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

  return (
    <Container className="space-y-6">
      <PageHeader
        title={ticket.subject}
        subtitle={`${ticket.business.name} · ${ticket.user.name} (${ticket.user.email}) · ${TICKET_CATEGORIES[ticket.category] || ticket.category}`}
        actions={
          <Link href={`/admin/negocios/${ticket.business.id}`} className="rounded-lg border border-hair px-3 py-1.5 text-sm hover:bg-raised">
            Ver cuenta
          </Link>
        }
      />
      {error ? <p className="text-sm text-crit">{error}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block rounded-lg border border-hair-soft bg-raised px-3 py-2">
            {Object.entries(TICKET_STATUSES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void saveStatus()} disabled={busy} className="rounded-lg border border-hair px-3 py-2 text-sm disabled:opacity-50">
          Actualizar estado
        </button>
      </div>
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
      <form onSubmit={reply} className="space-y-3 rounded-xl border border-hair-soft bg-surface p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={1}
          rows={4}
          placeholder="Responder al kiosco…"
          className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 text-sm"
        />
        <button type="submit" disabled={busy} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          {busy ? 'Enviando…' : 'Responder'}
        </button>
      </form>
    </Container>
  );
}
