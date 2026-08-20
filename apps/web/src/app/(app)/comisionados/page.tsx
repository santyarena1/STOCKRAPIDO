'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';

type PartyRow = {
  id: string;
  name: string;
  notes?: string | null;
  defaultCommissionPercent: number;
  active: boolean;
  productCount: number;
  balance: number;
};

function money(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

export default function ComisionadosPage() {
  const [rows, setRows] = useState<PartyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [pct, setPct] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<PartyRow[]>('/consignment/parties');
      setRows(data);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo cargar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      await api('/consignment/parties', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          notes: notes.trim() || undefined,
          defaultCommissionPercent: Number(pct.replace(',', '.')) || 0,
        }),
      });
      setName('');
      setNotes('');
      setPct('0');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo crear.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className="space-y-6">
      <PageHeader
        title="Comisionados"
        subtitle="Productos en consignación: agrupás por persona/entidad, ves lo que se debe (costo + %) y registrás pagos."
      />

      <form onSubmit={create} className="space-y-3 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
        <h2 className="text-base font-semibold text-fg">Nueva entidad</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-fg-muted sm:col-span-1">
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" placeholder="Ej. Juan" />
          </label>
          <label className="text-sm text-fg-muted">
            % comisión (sobre costo)
            <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-fg" />
          </label>
          <label className="text-sm text-fg-muted">
            Notas
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" />
          </label>
        </div>
        <button type="submit" disabled={saving} className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {saving ? 'Creando…' : 'Crear entidad'}
        </button>
        {msg ? <p className="text-sm text-warn">{msg}</p> : null}
      </form>

      {loading ? (
        <Loader label="Comisionados" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-hair-soft bg-surface p-8 text-center text-fg-muted">Todavía no hay entidades. Creá la primera arriba.</p>
      ) : (
        <ul className="divide-y divide-hair-soft overflow-hidden rounded-xl border border-hair-soft bg-surface">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/comisionados/${row.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-raised">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{row.name}{!row.active ? <span className="ml-2 text-xs text-fg-faint">(inactiva)</span> : null}</p>
                  <p className="text-xs text-fg-faint">{row.productCount} producto{row.productCount === 1 ? '' : 's'} · % default {row.defaultCommissionPercent}</p>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-lg font-bold tabular-nums ${row.balance > 0 ? 'text-warn' : 'text-ok'}`}>{money(row.balance)}</p>
                  <p className="text-[11px] text-fg-faint">Saldo a pagar</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
