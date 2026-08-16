'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/env-urls';

type Props = {
  compact?: boolean;
  onSuccess?: () => void;
};

export function LoginForm({ compact, onSuccess }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'No pudimos entrar. Revisá email y contraseña.');
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      onSuccess?.();
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  const field =
    'w-full rounded-md border border-[var(--mk-line)] bg-[var(--mk-paper-2)] px-3 py-2.5 text-[15px] text-[var(--mk-ink)] placeholder:text-[var(--mk-ink-3)]';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!compact && <h2 className="mk-display text-2xl text-[var(--mk-ink)]">Entrar al kiosco</h2>}
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
          required
          autoComplete="email"
        />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Contraseña</label>
          <Link href="/reset" className="text-xs text-[var(--mk-red)] hover:underline">
            La olvidé
          </Link>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
          required
          autoComplete="current-password"
        />
      </div>
      {error ? <p className="text-sm text-[var(--mk-red-dark)]">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-[var(--mk-red)] px-4 py-2.5 text-sm font-semibold text-[#f7f1e4] transition hover:bg-[var(--mk-red-dark)] disabled:opacity-50"
      >
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
      <p className="text-center text-sm text-[var(--mk-ink-2)]">
        ¿Todavía no?{' '}
        <Link href="/register" className="font-medium text-[var(--mk-red)] hover:underline">
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
