'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { clearLoyaltyToken, loyaltyApi, loyaltyToken, setLoyaltyToken } from '@/lib/loyalty-public';
import { getApiBaseUrl } from '@/lib/env-urls';

type Program = { programName: string; businessName: string; pointsPerArs: number; cashbackPercent: number; wallet: { apple: { ready: boolean }; google: { ready: boolean } } };
type Home = {
  businessName: string;
  programName: string;
  account: { name: string; pointsLabel: string; arsLabel: string; balancePoints: number };
  checkin: { status: string; expiresAt: string } | null;
  transactions: Array<{ id: string; label: string; pointsDelta: number; createdAt: string }>;
  sales: Array<{ id: string; createdAt: string; totalLabel: string; earned: number }>;
  rewards: Array<{ id: string; name: string; description: string | null; pointsCost: number; available: boolean }>;
  redemptions: Array<{ id: string; code: string; status: string; rewardName: string; pointsCost: number }>;
  wallet: { apple: { ready: boolean }; google: { ready: boolean } };
  transfer: { alias: string | null; cbuCvu: string | null; holder: string | null; bank: string | null; instructions: string | null };
};

type Tab = 'home' | 'rewards' | 'buy' | 'account';

export default function FidelidadPortalPage() {
  const params = useParams<{ slug: string }>();
  const [program, setProgram] = useState<Program | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('10000');
  const [payer, setPayer] = useState('');
  const [note, setNote] = useState('');
  const [info, setInfo] = useState('');

  const refresh = async () => {
    if (!loyaltyToken()) return;
    const data = await loyaltyApi<Home>('/public/loyalty/session');
    setHome(data);
  };

  useEffect(() => {
    loyaltyApi<Program>(`/public/loyalty/program/${params.slug}`)
      .then(setProgram)
      .catch((err) => setError(err instanceof Error ? err.message : 'Este local no tiene fidelización.'));
    if (loyaltyToken()) void refresh().catch(() => clearLoyaltyToken());
  }, [params.slug]);

  useEffect(() => {
    if (!home?.checkin || home.checkin.status !== 'WAITING') return;
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 4000);
    return () => window.clearInterval(timer);
  }, [home?.checkin?.status]);

  const submitAuth = async () => {
    setError('');
    try {
      const path = mode === 'register' ? 'register' : 'login';
      const session = await loyaltyApi<{ token: string }>(`/public/loyalty/program/${params.slug}/${path}`, {
        method: 'POST',
        body: JSON.stringify({ name, phone, email, pin }),
      });
      setLoyaltyToken(session.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ingresar.');
    }
  };

  const checkin = async () => {
    setInfo('');
    try {
      await loyaltyApi('/public/loyalty/checkin', { method: 'POST' });
      setInfo('Ya estás en la fila de puntos.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anotar en la fila.');
    }
  };

  const buy = async () => {
    setError('');
    try {
      const result = await loyaltyApi<{ points: number; amountLabel: string }>('/public/loyalty/topups', {
        method: 'POST',
        body: JSON.stringify({ amountArs: Number(amount.replace(/\./g, '').replace(',', '.')), payerName: payer, note }),
      });
      setInfo(`Solicitud enviada. Si confirman la transferencia, recibís ${result.points.toLocaleString('es-AR')} puntos.`);
      setTab('home');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la solicitud.');
    }
  };

  const redeem = async (rewardId: string, points: number) => {
    if (!confirm(`Vas a usar ${points.toLocaleString('es-AR')} puntos`)) return;
    try {
      const result = await loyaltyApi<{ code: string; name: string }>('/public/loyalty/rewards/' + rewardId + '/redeem', { method: 'POST' });
      setInfo(`Canje #${result.code}. Mostralo en el local para retirar ${result.name}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo canjear.');
    }
  };

  const addWallet = async (kind: 'apple' | 'google') => {
    try {
      if (kind === 'google') {
        const result = await loyaltyApi<{ url: string }>('/public/loyalty/wallet/google');
        window.location.href = result.url;
        return;
      }
      const token = loyaltyToken();
      const res = await fetch(new URL('/public/loyalty/wallet/apple', getApiBaseUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Apple Wallet no está disponible.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fidelidad.pkpass';
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet no disponible.');
    }
  };

  if (!program && error) return <main className="mx-auto max-w-md p-6 text-center text-fg">{error}</main>;
  if (!home) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
        <p className="text-sm text-fg-faint">{program?.businessName}</p>
        <h1 className="text-3xl font-bold">{program?.programName || 'Fidelización'}</h1>
        <p className="mb-6 mt-1 text-fg-muted">Sumás {program?.cashbackPercent ?? 5}% en puntos. {program?.pointsPerArs ?? 10} puntos = $1.</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode('login')} className={`rounded-xl py-3 font-semibold ${mode === 'login' ? 'btn-brand' : 'bg-raised'}`}>Ingresar</button>
          <button type="button" onClick={() => setMode('register')} className={`rounded-xl py-3 font-semibold ${mode === 'register' ? 'btn-brand' : 'bg-raised'}`}>Crear cuenta</button>
        </div>
        {mode === 'register' && <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" className="mb-2 w-full rounded-xl border border-hair bg-raised px-4 py-4 text-lg" />}
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Teléfono" inputMode="tel" className="mb-2 w-full rounded-xl border border-hair bg-raised px-4 py-4 text-lg" />
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email (opcional)" className="mb-2 w-full rounded-xl border border-hair bg-raised px-4 py-4 text-lg" />
        <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="PIN de 4 a 6 números" inputMode="numeric" type="password" className="mb-4 w-full rounded-xl border border-hair bg-raised px-4 py-4 text-lg" />
        {error && <p className="mb-3 text-sm text-warn">{error}</p>}
        <button type="button" onClick={() => void submitAuth()} className="w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white">{mode === 'register' ? 'Crear cuenta' : 'Entrar'}</button>
      </main>
    );
  }

  const pointsPreview = Math.floor(Number(amount.replace(/\./g, '').replace(',', '.')) || 0) * (program?.pointsPerArs || 10);
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">
      <p className="text-sm text-fg-faint">{home.businessName}</p>
      <h1 className="text-2xl font-bold">Hola, {home.account.name.split(' ')[0]}</h1>
      <p className="mt-2 text-4xl font-semibold">{home.account.pointsLabel}</p>
      <p className="text-lg text-fg-muted">puntos · ≈ {home.account.arsLabel}</p>
      {home.checkin?.status === 'WAITING' ? (
        <p className="mt-4 rounded-xl bg-[var(--warn-soft)] px-4 py-3 text-warn">Esperando que el cajero asocie tu compra…</p>
      ) : (
        <button type="button" onClick={() => void checkin()} className="mt-4 w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white">Estoy en el local</button>
      )}
      {info && <p className="mt-3 rounded-xl bg-brand-highlight px-4 py-3 text-brand">{info}</p>}
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      {tab === 'home' && (
        <section className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold uppercase text-fg-faint">Últimos movimientos</h2>
          {home.transactions.map((tx) => (
            <div key={tx.id} className="flex justify-between rounded-xl bg-surface px-4 py-3">
              <span>{tx.label}</span>
              <span className="font-mono">{tx.pointsDelta > 0 ? '+' : ''}{tx.pointsDelta.toLocaleString('es-AR')}</span>
            </div>
          ))}
          {!home.transactions.length && <p className="text-fg-muted">Todavía no hay movimientos.</p>}
        </section>
      )}
      {tab === 'rewards' && (
        <section className="mt-6 space-y-2">
          {home.rewards.map((reward) => (
            <article key={reward.id} className="rounded-xl bg-surface p-4">
              <p className="font-semibold">{reward.name}</p>
              <p className="text-sm text-fg-muted">{reward.description}</p>
              <button type="button" disabled={!reward.available} onClick={() => void redeem(reward.id, reward.pointsCost)} className="mt-3 w-full rounded-xl bg-raised py-3 font-semibold disabled:opacity-40">
                Canjear · {reward.pointsCost.toLocaleString('es-AR')} puntos
              </button>
            </article>
          ))}
          {home.redemptions.filter((row) => row.status === 'PENDING').map((row) => (
            <p key={row.id} className="rounded-xl border border-hair px-4 py-3">Canje #{row.code} · {row.rewardName}</p>
          ))}
        </section>
      )}
      {tab === 'buy' && (
        <section className="mt-6 space-y-3">
          <p className="text-sm text-fg-muted">Transferí y avisanos. El local confirma la carga.</p>
          {home.transfer.alias && <p className="rounded-xl bg-surface p-4 text-lg">Alias <strong>{home.transfer.alias}</strong></p>}
          {home.transfer.cbuCvu && <p className="text-sm text-fg-muted">CBU/CVU {home.transfer.cbuCvu}</p>}
          {home.transfer.holder && <p className="text-sm text-fg-muted">{home.transfer.holder}{home.transfer.bank ? ` · ${home.transfer.bank}` : ''}</p>}
          {home.transfer.instructions && <p className="text-sm text-fg-muted">{home.transfer.instructions}</p>}
          <label className="block text-sm">Pesos<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-hair bg-raised px-4 py-4 text-lg" /></label>
          <p className="text-fg">Recibís {pointsPreview.toLocaleString('es-AR')} puntos</p>
          <label className="block text-sm">¿Quién hizo la transferencia?<input value={payer} onChange={(event) => setPayer(event.target.value)} className="mt-1 w-full rounded-xl border border-hair bg-raised px-4 py-4 text-lg" /></label>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota o referencia" className="w-full rounded-xl border border-hair bg-raised px-4 py-4" />
          <button type="button" onClick={() => void buy()} className="w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white">Ya transferí</button>
        </section>
      )}
      {tab === 'account' && (
        <section className="mt-6 space-y-3">
          {home.wallet.apple.ready && <button type="button" onClick={() => void addWallet('apple')} className="w-full rounded-xl bg-black py-4 font-semibold text-white">Agregar a Apple Wallet</button>}
          {home.wallet.google.ready && <button type="button" onClick={() => void addWallet('google')} className="w-full rounded-xl border border-hair py-4 font-semibold">Agregar a Google Wallet</button>}
          {!home.wallet.apple.ready && !home.wallet.google.ready && <p className="text-sm text-fg-muted">Las tarjetas de Wallet se habilitan cuando el local configura las credenciales.</p>}
          <button type="button" onClick={() => { clearLoyaltyToken(); setHome(null); }} className="w-full rounded-xl bg-raised py-3">Salir</button>
        </section>
      )}
      <nav className="fixed inset-x-0 bottom-0 mx-auto grid max-w-md grid-cols-4 border-t border-hair bg-surface">
        {([['home', 'Inicio'], ['rewards', 'Premios'], ['buy', 'Cargar'], ['account', 'Cuenta']] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`py-4 text-sm font-semibold ${tab === id ? 'text-brand' : 'text-fg-muted'}`}>{label}</button>
        ))}
      </nav>
    </main>
  );
}
