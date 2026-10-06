'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Config = {
  configured: boolean;
  enabled?: boolean;
  pointsPerArs?: number;
  cashbackPercent?: number;
  checkInTtlMinutes?: number;
  claimTtlHours?: number;
  transferAlias?: string | null;
  transferCbuCvu?: string | null;
  transferHolder?: string | null;
  transferBank?: string | null;
  transferInstructions?: string | null;
  programName?: string;
  publicSlug?: string;
  wallet?: { apple: { ready: boolean; missing: string[] }; google: { ready: boolean; missing: string[] } };
};

export default function FidelizacionConfigPage() {
  const [form, setForm] = useState<Config | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Config>('/loyalty/config').then(setForm).catch((error) => setMessage(error instanceof Error ? error.message : 'Error'));
  }, []);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMessage('');
    try {
      const saved = await api<Config>('/loyalty/config', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: form.enabled !== false,
          pointsPerArs: Number(form.pointsPerArs || 10),
          cashbackPercent: Number(form.cashbackPercent || 5),
          checkInTtlMinutes: Number(form.checkInTtlMinutes || 8),
          claimTtlHours: Number(form.claimTtlHours || 168),
          transferAlias: form.transferAlias || null,
          transferCbuCvu: form.transferCbuCvu || null,
          transferHolder: form.transferHolder || null,
          transferBank: form.transferBank || null,
          transferInstructions: form.transferInstructions || null,
          programName: form.programName || 'Fidelización',
          publicSlug: form.publicSlug || undefined,
        }),
      });
      setForm(saved);
      setMessage('Guardado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <p className="text-fg-muted">Cargando…</p>;
  const field = (key: keyof Config, label: string, type = 'text') => (
    <label className="block text-sm text-fg-muted">
      {label}
      <input
        type={type}
        value={String(form[key] ?? '')}
        onChange={(event) => setForm({ ...form, [key]: type === 'number' ? Number(event.target.value) : event.target.value })}
        className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
      />
    </label>
  );

  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-hair bg-surface p-4">
      <label className="flex items-center justify-between gap-3 text-sm text-fg">
        Programa activo
        <input type="checkbox" checked={form.enabled !== false} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
      </label>
      {!form.configured && <p className="text-sm text-fg-muted">Todavía no hay programa. Al guardar se crea el QR fijo del local.</p>}
      {field('programName', 'Nombre del programa')}
      {field('pointsPerArs', 'Puntos por cada peso', 'number')}
      {field('cashbackPercent', 'Cashback %', 'number')}
      {field('checkInTtlMinutes', 'Minutos de la fila', 'number')}
      {field('claimTtlHours', 'Horas para reclamar una venta', 'number')}
      {field('publicSlug', 'Identificador público')}
      {field('transferAlias', 'Alias')}
      {field('transferCbuCvu', 'CBU / CVU')}
      {field('transferHolder', 'Titular')}
      {field('transferBank', 'Banco o billetera')}
      <label className="block text-sm text-fg-muted">
        Instrucciones
        <textarea value={form.transferInstructions || ''} onChange={(event) => setForm({ ...form, transferInstructions: event.target.value })} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" rows={3} />
      </label>
      <div className="rounded-lg bg-raised p-3 text-sm text-fg-muted">
        <p>Apple Wallet: {form.wallet?.apple.ready ? 'listo' : `falta ${form.wallet?.apple.missing.join(', ') || 'configuración'}`}</p>
        <p className="mt-1">Google Wallet: {form.wallet?.google.ready ? 'listo' : `falta ${form.wallet?.google.missing.join(', ') || 'configuración'}`}</p>
        <p className="mt-2 text-xs">Fidelización funciona sin Wallet configurado. Los certificados van en variables de entorno, no en esta pantalla.</p>
      </div>
      {message && <p className="text-sm text-fg">{message}</p>}
      <button type="button" disabled={busy} onClick={() => void save()} className="btn-brand w-full rounded-lg py-3 font-semibold disabled:opacity-50">
        {busy ? 'Guardando…' : form.configured ? 'Guardar' : 'Activar fidelización'}
      </button>
    </div>
  );
}
