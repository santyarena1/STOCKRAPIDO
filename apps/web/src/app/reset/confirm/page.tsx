'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4002';

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
      const res = await fetch(`${API}/auth/reset-password`, {
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

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-red-400 mb-4">Enlace inválido (falta token).</p>
        <Link href="/reset" className="text-sky-400 hover:underline">Solicitar nuevo enlace</Link>
      </div>
    );
  }

  if (done) {
    return <p className="text-sky-400 text-center">Contraseña actualizada. Redirigiendo al login...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-400 mb-1">Nueva contraseña (mín. 8)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          required
          minLength={8}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-400 mb-1">Repetir contraseña</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          required
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-sky-600 text-white font-medium disabled:opacity-50">
        {loading ? 'Guardando...' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}

export default function ResetConfirmPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900/50 p-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-6">Nueva contraseña</h1>
        <Suspense fallback={<p className="text-slate-400">Cargando...</p>}>
          <ConfirmForm />
        </Suspense>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/login" className="text-sky-400 hover:underline">Volver al login</Link>
        </p>
      </div>
    </main>
  );
}
