'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { getApiBaseUrl } from '@/lib/env-urls';

function ConfirmForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (!token) {
      setError('Falta el token');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Error');
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  const field = 'w-full rounded-2xl border border-[var(--mk-line)] bg-white px-3 py-2.5';

  if (!token) {
    return (
      <div className="text-center text-sm">
        <p className="mb-4 text-[var(--mk-red-dark)]">Enlace inválido (falta token).</p>
        <Link href="/reset" className="text-[var(--mk-red)] hover:underline">Solicitar nuevo enlace</Link>
      </div>
    );
  }

  if (done) {
    return <p className="text-center text-sm text-[var(--mk-ink-2)]">Contraseña actualizada. Te llevamos a entrar…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Nueva contraseña (mín. 8)</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} required minLength={8} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Repetir contraseña</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} required />
      </div>
      {error ? <p className="text-sm text-[var(--mk-red-dark)]">{error}</p> : null}
      <button type="submit" disabled={loading} className="mk-cta w-full disabled:opacity-50">
        {loading ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}

export default function ResetConfirmPage() {
  return (
    <MarketingShell withNav={false}>
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
        <div className="w-full rounded-[1.75rem] border border-[var(--mk-line)] bg-white p-6 shadow-[0_20px_50px_-28px_rgba(227,28,35,0.35)]">
          <h1 className="mk-display mb-6 text-3xl">Nueva contraseña</h1>
          <Suspense fallback={<p className="text-sm text-[var(--mk-ink-2)]">Cargando…</p>}>
            <ConfirmForm />
          </Suspense>
          <p className="mt-4 text-center text-sm">
            <Link href="/login" className="font-bold text-[var(--mk-red)] hover:underline">Volver a ingresar</Link>
          </p>
        </div>
      </main>
    </MarketingShell>
  );
}
