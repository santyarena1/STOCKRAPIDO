'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';

function NuevoInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({
    subject: params.get('asunto') || '',
    category: params.get('categoria') || 'otro',
    body: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const ticket = await api<{ id: string }>('/support/tickets', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      router.push(`/soporte/${ticket.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="max-w-xl space-y-6">
      <PageHeader
        title="Nuevo ticket"
        subtitle="Contá qué pasó. Si es un pago, incluí el importe y el día de la transferencia."
        actions={
          <Link href="/soporte" className="rounded-lg border border-hair px-3 py-1.5 text-sm hover:bg-raised">
            Volver
          </Link>
        }
      />
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-hair-soft bg-surface p-5">
        <label className="block text-sm">
          Asunto
          <input
            required
            minLength={4}
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-hair-soft bg-raised px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Tipo
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-hair-soft bg-raised px-3 py-2"
          >
            <option value="pago">Pago / facturación</option>
            <option value="bug">Problema técnico</option>
            <option value="cuenta">Cuenta y usuarios</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className="block text-sm">
          Detalle
          <textarea
            required
            minLength={8}
            rows={6}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-hair-soft bg-raised px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-crit">{error}</p> : null}
        <button type="submit" disabled={busy} className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          {busy ? 'Enviando…' : 'Abrir ticket'}
        </button>
      </form>
    </Container>
  );
}

export default function NuevoTicketPage() {
  return (
    <Suspense fallback={<Container><PageHeader title="Nuevo ticket" /></Container>}>
      <NuevoInner />
    </Suspense>
  );
}
