'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { loyaltyApi, setLoyaltyToken } from '@/lib/loyalty-public';

export default function ReclamarPuntosPage() {
  const params = useParams<{ token: string }>();
  const [preview, setPreview] = useState<{
    totalLabel: string;
    createdAt: string;
    points: number;
    publicSlug: string;
    businessName: string;
    authenticated: boolean;
  } | null>(null);
  const [done, setDone] = useState<{ earnedPoints: number; balance: { pointsLabel: string; arsLabel: string } } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setPreview(await loyaltyApi(`/public/loyalty/claim/${params.token}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la compra.');
    }
  };

  useEffect(() => {
    void load();
  }, [params.token]);

  const enter = async () => {
    if (!preview) return;
    setError('');
    try {
      const session = await loyaltyApi<{ token: string }>(`/public/loyalty/program/${preview.publicSlug}/${name.trim() ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), phone, email, pin }),
      });
      setLoyaltyToken(session.token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ingresar.');
    }
  };

  const confirm = async () => {
    try {
      setDone(await loyaltyApi(`/public/loyalty/claim/${params.token}`, { method: 'POST' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron acreditar los puntos.');
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <h1 className="text-3xl font-bold">Puntos de tu compra</h1>
      {done ? (
        <div className="mt-6">
          <p className="text-2xl font-semibold">¡Listo!</p>
          <p className="mt-2 text-lg">Ganaste {done.earnedPoints.toLocaleString('es-AR')} puntos</p>
          <p className="text-fg-muted">Nuevo saldo: {done.balance.pointsLabel} · {done.balance.arsLabel}</p>
        </div>
      ) : preview && !preview.authenticated ? (
        <div className="mt-6 space-y-2">
          <p className="text-fg-muted">{preview.businessName}. {preview.totalLabel}. Vas a recibir {preview.points.toLocaleString('es-AR')} puntos.</p>
          <p className="text-sm text-fg-faint">Si ya tenés cuenta, dejá el nombre vacío e ingresá con teléfono y PIN.</p>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre, si es tu primera vez" className="w-full rounded-xl border border-hair bg-raised px-4 py-4" />
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Teléfono" inputMode="tel" className="w-full rounded-xl border border-hair bg-raised px-4 py-4" />
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email, si no tenés teléfono" inputMode="email" className="w-full rounded-xl border border-hair bg-raised px-4 py-4" />
          <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="PIN" type="password" inputMode="numeric" className="w-full rounded-xl border border-hair bg-raised px-4 py-4" />
          <button type="button" onClick={() => void enter()} className="w-full rounded-xl bg-green-600 py-4 font-bold text-white">Continuar</button>
        </div>
      ) : preview ? (
        <div className="mt-6">
          <p className="text-lg">¿Querés acreditar esta compra a tu cuenta?</p>
          <p className="mt-3 text-fg-muted">{preview.totalLabel} · {new Date(preview.createdAt).toLocaleString('es-AR')}</p>
          <p className="mt-1 text-2xl font-semibold">Vas a recibir {preview.points.toLocaleString('es-AR')} puntos</p>
          <button type="button" onClick={() => void confirm()} className="mt-6 w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white">Acreditar</button>
        </div>
      ) : (
        <p className="mt-6 text-fg-muted">{error || 'Cargando…'}</p>
      )}
      {error && <p className="mt-4 text-warn">{error}</p>}
    </main>
  );
}
