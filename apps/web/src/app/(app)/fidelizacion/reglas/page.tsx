'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Rule = { id: string; name: string; everyNPurchases: number; bonusPoints: number; active: boolean };

export default function FidelizacionReglasPage() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [name, setName] = useState('5 visitas');
  const [every, setEvery] = useState('5');
  const [bonus, setBonus] = useState('2000');
  const [message, setMessage] = useState('');
  const load = () => api<Rule[]>('/loyalty/rules').then(setRows).catch((error) => setMessage(error instanceof Error ? error.message : 'Error'));
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">El cashback está en Configuración. Estas reglas son premios extra y arrancan inactivas.</p>
      <div className="grid gap-2 rounded-xl border border-hair bg-surface p-4 sm:grid-cols-4">
        <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg" />
        <input value={every} onChange={(event) => setEvery(event.target.value)} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg" placeholder="Cada cuántas compras" />
        <input value={bonus} onChange={(event) => setBonus(event.target.value)} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg" placeholder="Puntos" />
        <button type="button" className="btn-brand rounded-lg py-2" onClick={() => void api('/loyalty/rules', { method: 'POST', body: JSON.stringify({ name, everyNPurchases: Number(every), bonusPoints: Number(bonus), active: false }) }).then(load).catch((error) => setMessage(error instanceof Error ? error.message : 'Error'))}>Agregar</button>
      </div>
      {message && <p className="text-sm text-fg">{message}</p>}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between rounded-xl border border-hair bg-surface px-4 py-3">
            <span className="text-fg">{row.name} · cada {row.everyNPurchases} compras · {row.bonusPoints.toLocaleString('es-AR')} puntos</span>
            <button type="button" className="text-sm text-brand" onClick={() => void api(`/loyalty/rules/${row.id}`, { method: 'PATCH', body: JSON.stringify({ ...row, active: !row.active }) }).then(load)}>
              {row.active ? 'Activa' : 'Inactiva'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
