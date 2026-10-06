'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

type Detail = {
  name: string;
  phone: string | null;
  email: string | null;
  balancePoints: number;
  purchasedPoints: number;
  freePoints: number;
  pointsLabel: string;
  arsLabel: string;
  walletSyncError: string | null;
  transactions: Array<{ id: string; label: string; type: string; pointsDelta: number; purchasedDelta: number; freeDelta: number; createdAt: string }>;
  sales: Array<{ id: string; createdAt: string; totalFinal: string | number; loyaltyPointsEarned: number; loyaltyPointsRedeemed: number; status: string }>;
  topups: Array<{ id: string; points: number; amountArs: string | number; status: string; payerName: string; createdAt: string }>;
  redemptions: Array<{ id: string; code: string; status: string; pointsCost: number; rewardName: string }>;
};

export default function FidelizacionClientePage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');

  const load = () => {
    api<Detail>(`/loyalty/accounts/${params.id}`).then(setData).catch((error) => setMessage(error instanceof Error ? error.message : 'Error'));
  };
  useEffect(load, [params.id]);

  const adjust = async () => {
    setMessage('');
    try {
      await api(`/loyalty/accounts/${params.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ pointsDelta: Number(delta), reason }),
      });
      setDelta('');
      setReason('');
      setMessage('Ajuste guardado.');
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo ajustar.');
    }
  };

  const reset = async () => {
    if (!confirm('¿Generar un PIN nuevo? El anterior deja de servir.')) return;
    try {
      const result = await api<{ pin: string }>(`/loyalty/accounts/${params.id}/reset-pin`, { method: 'POST' });
      setPin(result.pin);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo restablecer el PIN.');
    }
  };

  if (!data) return <p className="text-fg-muted">{message || 'Cargando…'}</p>;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-hair bg-surface p-4">
        <h2 className="text-xl font-bold text-fg">{data.name}</h2>
        <p className="text-3xl font-semibold text-fg">{data.pointsLabel} puntos</p>
        <p className="text-fg-muted">≈ {data.arsLabel}</p>
        <p className="mt-2 text-sm text-fg-muted">Comprados: {data.purchasedPoints.toLocaleString('es-AR')} · Regalados: {data.freePoints.toLocaleString('es-AR')}</p>
        <p className="text-sm text-fg-faint">{data.phone || 'Sin teléfono'} · {data.email || 'Sin email'}</p>
        {data.walletSyncError && <p className="mt-2 text-sm text-warn">Wallet: {data.walletSyncError}</p>}
      </div>
      <div className="rounded-xl border border-hair bg-surface p-4">
        <h3 className="font-semibold text-fg">Ajuste manual</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
          <input value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="+ / - puntos" className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo obligatorio" className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg" />
          <button type="button" onClick={() => void adjust()} className="btn-brand rounded-lg px-4 py-2">Aplicar</button>
        </div>
        <button type="button" onClick={() => void reset()} className="mt-3 text-sm text-brand">Restablecer PIN</button>
        {pin && <p className="mt-2 rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-warn">PIN nuevo: {pin}. Anotalo ahora.</p>}
        {message && <p className="mt-2 text-sm text-fg">{message}</p>}
      </div>
      <section>
        <h3 className="mb-2 font-semibold text-fg">Movimientos</h3>
        <ul className="space-y-2">
          {data.transactions.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between rounded-lg bg-raised px-3 py-2 text-sm">
              <span className="text-fg">{tx.label}<span className="block text-xs text-fg-faint">{tx.type} · comprados {tx.purchasedDelta} · regalados {tx.freeDelta}</span></span>
              <span className="font-mono text-fg">{tx.pointsDelta > 0 ? '+' : ''}{tx.pointsDelta.toLocaleString('es-AR')}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 font-semibold text-fg">Ventas, cargas y canjes</h3>
        <ul className="space-y-1 text-sm text-fg-muted">
          {data.sales.map((sale) => <li key={sale.id}>Venta ${Number(sale.totalFinal).toFixed(0)} · ganó {sale.loyaltyPointsEarned} · usó {sale.loyaltyPointsRedeemed} · {sale.status}</li>)}
          {data.topups.map((row) => <li key={row.id}>Carga {row.points.toLocaleString('es-AR')} · ${Number(row.amountArs).toFixed(0)} · {row.payerName} · {row.status}</li>)}
          {data.redemptions.map((row) => <li key={row.id}>Canje {row.rewardName} · {row.code} · {row.status}</li>)}
        </ul>
      </section>
    </div>
  );
}
