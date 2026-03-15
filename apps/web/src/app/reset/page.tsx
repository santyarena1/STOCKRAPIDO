'use client';

import { useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4002';

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
      const res = await fetch(`${API}/auth/forgot-password`, {
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
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900/50 p-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-2">Recuperar contraseña</h1>
        <p className="text-slate-400 text-sm mb-6">Ingresá tu email y te enviamos un enlace.</p>
        {sent ? (
          <p className="text-sky-400 text-sm">Si el email existe, recibirás un enlace. Revisá la consola del servidor en dev.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
              required
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-sky-600 text-white font-medium disabled:opacity-50">
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/login" className="text-sky-400 hover:underline">Volver al login</Link>
        </p>
      </div>
    </main>
  );
}
