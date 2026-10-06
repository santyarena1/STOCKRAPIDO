'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Dashboard = {
  enabled: boolean;
  programName: string;
  accounts: number;
  circulatingPoints: number;
  circulatingArsLabel: string;
  pointsPurchased: number;
  pointsGifted: number;
  pointsSpent: number;
  pendingTopups: number;
  pendingRedemptions: number;
  waiting: number;
  linkedSales30d: number;
  sales30d: number;
  identificationRate: number;
  recurrenceRate: number;
};

export default function FidelizacionHome() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Dashboard>('/loyalty/dashboard')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen.'));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-hair bg-surface p-5">
        <p className="text-fg">{error}</p>
        <Link href="/fidelizacion/configuracion" className="mt-3 inline-block text-brand">
          Activar fidelización
        </Link>
      </div>
    );
  }
  if (!data) return <p className="text-fg-muted">Cargando…</p>;

  const cards = [
    ['Clientes', String(data.accounts)],
    ['Puntos circulando', data.circulatingPoints.toLocaleString('es-AR')],
    ['Equivalente', data.circulatingArsLabel],
    ['Puntos comprados', data.pointsPurchased.toLocaleString('es-AR')],
    ['Puntos regalados', data.pointsGifted.toLocaleString('es-AR')],
    ['Puntos gastados', data.pointsSpent.toLocaleString('es-AR')],
    ['Cargas pendientes', String(data.pendingTopups)],
    ['Canjes pendientes', String(data.pendingRedemptions)],
    ['Esperando ahora', String(data.waiting)],
    ['Ventas con cliente (30 días)', `${data.linkedSales30d} / ${data.sales30d}`],
    ['Identificación', `${Math.round(data.identificationRate * 100)}%`],
    ['Recurrencia', `${Math.round(data.recurrenceRate * 100)}%`],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-hair bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-fg-faint">{label}</p>
          <p className="mt-1 text-xl font-semibold text-fg">{value}</p>
        </div>
      ))}
    </div>
  );
}
