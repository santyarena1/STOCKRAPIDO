'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { getApiBaseUrl } from '@/lib/env-urls';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Error');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingShell withNav={false}>
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
        <div className="w-full rounded-xl border border-[var(--mk-line)] bg-[var(--mk-paper-2)] p-6">
          <h1 className="mk-display text-3xl">Recuperar contraseña</h1>
          <p className="mt-1 mb-6 text-sm text-[var(--mk-ink-2)]">Ingresá el email de la cuenta y te mandamos el enlace.</p>
          {sent ? (
            <p className="text-sm text-[var(--mk-ink-2)]">Si el email existe, vas a recibir el enlace. En desarrollo aparece en la consola del API.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-md border border-[var(--mk-line)] bg-[var(--mk-paper)] px-3 py-2.5"
                required
              />
              {error ? <p className="text-sm text-[var(--mk-red-dark)]">{error}</p> : null}
              <button type="submit" disabled={loading} className="w-full rounded-md bg-[var(--mk-red)] py-2.5 text-sm font-semibold text-[#f7f1e4] disabled:opacity-50">
                {loading ? 'Enviando…' : 'Enviar enlace'}
              </button>
            </form>
          )}
          <p className="mt-4 text-center text-sm">
            <Link href="/login" className="text-[var(--mk-red)] hover:underline">Volver a entrar</Link>
          </p>
        </div>
      </main>
    </MarketingShell>
  );
}
