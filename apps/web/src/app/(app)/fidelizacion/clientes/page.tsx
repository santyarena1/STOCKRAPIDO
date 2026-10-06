'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Row = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  balancePoints: number;
  arsLabel: string;
  purchases: number;
  lastPurchaseAt: string | null;
  appleWallet: boolean;
  googleWallet: boolean;
  active: boolean;
};

export default function FidelizacionClientesPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  const load = (query = q) => {
    api<Row[]>('/loyalty/accounts', { params: { q: query } })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  };

  useEffect(() => {
    load('');
  }, []);

  return (
    <div>
      <form className="mb-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar por nombre" className="w-full rounded-lg border border-hair bg-raised px-3 py-3 text-fg" />
        <button className="rounded-lg border border-hair px-4 text-sm text-fg">Buscar</button>
      </form>
      {error && <p className="mb-3 text-sm text-fg">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-hair">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-raised text-fg-faint">
            <tr>
              {['Nombre', 'Teléfono', 'Email', 'Puntos', 'Equivale', 'Compras', 'Última', 'Apple', 'Google', 'Estado'].map((head) => (
                <th key={head} className="px-3 py-2 font-medium">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-hair-soft">
                <td className="px-3 py-2"><Link href={`/fidelizacion/clientes/${row.id}`} className="font-medium text-brand">{row.name}</Link></td>
                <td className="px-3 py-2 text-fg-muted">{row.phone || '—'}</td>
                <td className="px-3 py-2 text-fg-muted">{row.email || '—'}</td>
                <td className="px-3 py-2 font-mono">{row.balancePoints.toLocaleString('es-AR')}</td>
                <td className="px-3 py-2">{row.arsLabel}</td>
                <td className="px-3 py-2">{row.purchases}</td>
                <td className="px-3 py-2 text-fg-muted">{row.lastPurchaseAt ? new Date(row.lastPurchaseAt).toLocaleDateString('es-AR') : '—'}</td>
                <td className="px-3 py-2">{row.appleWallet ? 'Sí' : '—'}</td>
                <td className="px-3 py-2">{row.googleWallet ? 'Sí' : '—'}</td>
                <td className="px-3 py-2">{row.active ? 'Activa' : 'Inactiva'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
