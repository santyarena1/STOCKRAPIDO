'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Row = {
  id: string;
  accountName: string;
  points: number;
  amountArs: string | number;
  payerName: string;
  note: string | null;
  status: string;
  createdAt: string;
  rejectReason: string | null;
};

export default function FidelizacionCargasPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');

  const load = () => {
    api<Row[]>('/loyalty/topups').then(setRows).catch((error) => setMessage(error instanceof Error ? error.message : 'Error'));
  };
  useEffect(load, []);

  const act = async (id: string, action: 'approve' | 'reject') => {
    const reason = action === 'reject' ? window.prompt('Motivo del rechazo (opcional)') || '' : '';
    try {
      await api(`/loyalty/topups/${id}/${action}`, { method: 'POST', body: JSON.stringify({ reason }) });
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo revisar la solicitud.');
    }
  };

  return (
    <div className="space-y-2">
      {message && <p className="text-sm text-fg">{message}</p>}
      {rows.map((row) => (
        <article key={row.id} className="rounded-xl border border-hair bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-fg">{row.accountName}</p>
              <p className="text-sm text-fg-muted">Solicita {row.points.toLocaleString('es-AR')} puntos · debió transferir ${Number(row.amountArs).toFixed(0)}</p>
              <p className="text-sm text-fg">Transferido por: {row.payerName}</p>
              {row.note && <p className="text-xs text-fg-faint">{row.note}</p>}
              <p className="text-xs text-fg-faint">{new Date(row.createdAt).toLocaleString('es-AR')} · {row.status}</p>
            </div>
            {row.status === 'PENDING' && (
              <div className="flex gap-2">
                <button type="button" onClick={() => void act(row.id, 'approve')} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white">Confirmar</button>
                <button type="button" onClick={() => void act(row.id, 'reject')} className="rounded-lg border border-hair px-4 py-2 text-sm text-fg">Rechazar</button>
              </div>
            )}
          </div>
        </article>
      ))}
      {!rows.length && <p className="text-fg-muted">No hay cargas.</p>}
    </div>
  );
}
