'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Reward = { id: string; name: string; description: string | null; pointsCost: number; active: boolean; stock: number | null };

export default function FidelizacionPremiosPage() {
  const [rows, setRows] = useState<Reward[]>([]);
  const [name, setName] = useState('');
  const [pointsCost, setPointsCost] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');

  const load = () => api<Reward[]>('/loyalty/rewards').then(setRows).catch((error) => setMessage(error instanceof Error ? error.message : 'Error'));
  useEffect(() => { void load(); }, []);

  const create = async () => {
    try {
      await api('/loyalty/rewards', { method: 'POST', body: JSON.stringify({ name, pointsCost: Number(pointsCost), description, active: true }) });
      setName('');
      setPointsCost('');
      setDescription('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el premio.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border border-hair bg-surface p-4 sm:grid-cols-4">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg" />
        <input value={pointsCost} onChange={(event) => setPointsCost(event.target.value)} placeholder="Puntos" className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg" />
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg" />
        <button type="button" onClick={() => void create()} className="btn-brand rounded-lg py-2 font-medium">Crear premio</button>
      </div>
      {message && <p className="text-sm text-fg">{message}</p>}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between rounded-xl border border-hair bg-surface px-4 py-3">
            <div>
              <p className="font-medium text-fg">{row.name}</p>
              <p className="text-sm text-fg-muted">{row.pointsCost.toLocaleString('es-AR')} puntos{row.stock != null ? ` · stock ${row.stock}` : ''}</p>
            </div>
            <button type="button" className="text-sm text-brand" onClick={() => void api(`/loyalty/rewards/${row.id}`, { method: 'PATCH', body: JSON.stringify({ ...row, active: !row.active }) }).then(load)}>
              {row.active ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
