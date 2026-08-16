'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/env-urls';
import { getPlan, isPlanId, type PlanId } from '@/lib/plans';

export function RegisterForm({ initialPlan }: { initialPlan?: string }) {
  const router = useRouter();
  const planId: PlanId = isPlanId(initialPlan) ? initialPlan : 'mostrador';
  const plan = getPlan(planId);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    businessName: '',
    cuit: '',
    address: '',
    planId,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name,
          businessName: form.businessName,
          cuit: form.cuit || undefined,
          address: form.address || undefined,
          planId: form.planId,
        }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'No pudimos crear la cuenta');
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/pos');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  const field =
    'w-full rounded-md border border-[var(--mk-line)] bg-[var(--mk-paper-2)] px-3 py-2.5 text-[15px] text-[var(--mk-ink)]';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <h1 className="mk-display text-3xl text-[var(--mk-ink)]">Abrir el kiosco</h1>
        <p className="mt-1 text-sm text-[var(--mk-ink-2)]">
          14 días del plan {plan.name}, sin tarjeta. Después decidís si seguís.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Email</label>
        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={field} required autoComplete="email" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Contraseña (mín. 8)</label>
        <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className={field} required minLength={8} autoComplete="new-password" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Tu nombre</label>
        <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={field} required autoComplete="name" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Nombre del kiosco</label>
        <input type="text" value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} className={field} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">CUIT</label>
          <input type="text" value={form.cuit} onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))} className={field} placeholder="Opcional" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Dirección</label>
          <input type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={field} placeholder="Opcional" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--mk-ink-2)]">Plan de prueba</label>
        <select
          value={form.planId}
          onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value as PlanId }))}
          className={field}
        >
          <option value="mostrador">Mostrador — lo básico ($19.900/mes)</option>
          <option value="kiosco">Fiscal — factura AFIP ($34.900/mes)</option>
          <option value="red">Pro — distribuidores + IA ($54.900/mes)</option>
        </select>
      </div>
      {error ? <p className="text-sm text-[var(--mk-red-dark)]">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-[var(--mk-red)] px-4 py-2.5 text-sm font-semibold text-[#f7f1e4] hover:bg-[var(--mk-red-dark)] disabled:opacity-50"
      >
        {loading ? 'Creando…' : 'Empezar los 14 días'}
      </button>
      <p className="text-center text-sm text-[var(--mk-ink-2)]">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-medium text-[var(--mk-red)] hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
