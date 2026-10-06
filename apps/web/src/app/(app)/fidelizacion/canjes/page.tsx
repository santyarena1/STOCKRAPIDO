'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Row = { id: string; code: string; status: string; pointsCost: number; accountName: string; rewardName: string; createdAt: string };

export default function FidelizacionCanjesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');
  const load = () => api<Row[]>('/loyalty/redemptions').then(setRows).catch((error) => setMessage(error instanceof Error ? error.message : 'Error'));
  useEffect(() => { void load(); }, []);

  const act = async (id: string, action: 'deliver' | 'cancel') => {
    try {
      await api(`/loyalty/redemptions/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el canje.');
    }
  };

  return (
    <div className="space-y-2">
      {message && <p className="text-sm text-fg">{message}</p>}
      {rows.map((row) => (
        <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hair bg-surface p-4">
          <div>
            <p className="font-semibold text-fg">Canje #{row.code}</p>
            <p className="text-sm text-fg-muted">{row.accountName} · {row.rewardName} · {row.pointsCost.toLocaleString('es-AR')} puntos · {row.status}</p>
          </div>
          {row.status === 'PENDING' && (
            <div className="flex gap-2">
              <button type="button" onClick={() => void act(row.id, 'deliver')} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white">Marcar como entregado</button>
              <button type="button" onClick={() => void act(row.id, 'cancel')} className="rounded-lg border border-hair px-4 py-2 text-sm">Cancelar</button>
            </div>
          )}
        </article>
      ))}
      {!rows.length && <p className="text-fg-muted">No hay canjes.</p>}
    </div>
  );
}
