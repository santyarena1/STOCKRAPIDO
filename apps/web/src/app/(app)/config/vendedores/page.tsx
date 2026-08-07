'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { api } from '@/lib/api';

type Period = 'today' | 'week' | 'month' | 'year';
type Vendedor = { id: string; name: string; active: boolean; createdAt: string };
type SellerStats = { id: string; name: string; salesCount: number; salesTotal: number; unitsSold: number; hoursWorked: number };
type Message = { kind: 'ok' | 'error'; text: string };

const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

export default function VendedoresConfigPage() {
  const [sellers, setSellers] = useState<Vendedor[]>([]);
  const [stats, setStats] = useState<SellerStats[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const loadSellers = useCallback(async () => {
    const data = await api<Vendedor[]>('/vendedores');
    setSellers(data);
    setNames((current) => Object.fromEntries(data.map((seller) => [seller.id, current[seller.id] ?? seller.name])));
  }, []);

  const loadStats = useCallback(async () => {
    setStats(await api<SellerStats[]>('/vendedores/stats', { params: { period } }));
  }, [period]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([loadSellers(), loadStats()]); }
    catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Error al cargar vendedores' }); }
    finally { setLoading(false); }
  }, [loadSellers, loadStats]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createSeller = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setBusy('create'); setMessage(null);
    try {
      await api('/vendedores', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
      setNewName(''); setMessage({ kind: 'ok', text: 'Vendedor agregado.' }); await refresh();
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Error al agregar vendedor' }); }
    finally { setBusy(null); }
  };

  const updateSeller = async (seller: Vendedor, patch: { name?: string; active?: boolean }) => {
    setBusy(seller.id); setMessage(null);
    try {
      await api(`/vendedores/${seller.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setMessage({ kind: 'ok', text: 'Vendedor actualizado.' }); await refresh();
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Error al actualizar vendedor' }); }
    finally { setBusy(null); }
  };

  const deleteSeller = async (seller: Vendedor) => {
    if (!confirm(`¿Eliminar a ${seller.name}? Si tiene ventas se desactivará para conservar el historial.`)) return;
    setBusy(seller.id); setMessage(null);
    try {
      await api(`/vendedores/${seller.id}`, { method: 'DELETE' });
      setMessage({ kind: 'ok', text: 'Vendedor eliminado o desactivado.' }); await refresh();
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Error al eliminar vendedor' }); }
    finally { setBusy(null); }
  };

  return <div className="space-y-6">
    <PageHeader title="Vendedores" subtitle="Gestioná quién opera el POS y revisá sus horas y ventas." />
    {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.kind === 'ok' ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-crit/30 bg-[var(--crit-soft)] text-crit'}`}>{message.text}</div>}

    <section className="rounded-xl border border-hair-soft bg-surface p-5">
      <h2 className="font-semibold text-fg">Agregar vendedor</h2>
      <form onSubmit={createSeller} className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nombre del vendedor" className="min-w-0 flex-1 rounded-lg border border-hair bg-raised px-3 py-2 text-fg placeholder:text-fg-faint focus-brand" /><button type="submit" disabled={busy === 'create' || !newName.trim()} className="btn-brand rounded-lg px-4 py-2 font-medium disabled:opacity-50">{busy === 'create' ? 'Agregando…' : 'Agregar'}</button></form>
    </section>

    <section className="rounded-xl border border-hair-soft bg-surface p-5">
      <div className="mb-4"><h2 className="font-semibold text-fg">Equipo de vendedores</h2><p className="text-sm text-fg-muted">Los vendedores inactivos no pueden seleccionarse desde el POS.</p></div>
      {loading ? <Loader /> : sellers.length === 0 ? <p className="rounded-lg border border-hair-soft bg-raised p-5 text-center text-fg-faint">Todavía no hay vendedores.</p> : <div className="space-y-2">{sellers.map((seller) => <div key={seller.id} className="flex flex-col gap-2 rounded-xl border border-hair-soft bg-raised p-3 sm:flex-row sm:items-center"><input value={names[seller.id] ?? seller.name} onChange={(event) => setNames((current) => ({ ...current, [seller.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-hair bg-surface px-3 py-2 text-fg" /><span className={`rounded-md border px-2 py-1 text-xs ${seller.active ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-hair bg-raised2 text-fg-faint'}`}>{seller.active ? 'Activo' : 'Inactivo'}</span><button type="button" disabled={busy === seller.id || !names[seller.id]?.trim()} onClick={() => void updateSeller(seller, { name: names[seller.id].trim() })} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:bg-raised2 disabled:opacity-50">Guardar nombre</button><button type="button" disabled={busy === seller.id} onClick={() => void updateSeller(seller, { active: !seller.active })} className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${seller.active ? 'border-warn/30 text-warn' : 'border-ok/30 text-ok'}`}>{seller.active ? 'Desactivar' : 'Activar'}</button><button type="button" disabled={busy === seller.id} onClick={() => void deleteSeller(seller)} className="rounded-lg border border-crit/30 px-3 py-2 text-sm text-crit disabled:opacity-50">Eliminar</button></div>)}</div>}
    </section>

    <section className="rounded-xl border border-hair-soft bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-fg">Estadísticas</h2><p className="text-sm text-fg-muted">Ventas atribuidas y tiempo de sesiones activas.</p></div><select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="rounded-lg border border-hair bg-raised px-3 py-2 text-fg"><option value="today">Hoy</option><option value="week">Semana</option><option value="month">Mes</option><option value="year">Año</option></select></div>
      <div className="overflow-x-auto rounded-xl border border-hair-soft"><table className="w-full text-sm"><thead className="bg-raised text-left text-xs uppercase tracking-wide text-fg-faint"><tr><th className="px-3 py-3">Vendedor</th><th className="px-3 py-3 text-right">Horas trabajadas</th><th className="px-3 py-3 text-right">Ventas</th><th className="px-3 py-3 text-right">Ventas ($)</th><th className="px-3 py-3 text-right">Unidades vendidas</th></tr></thead><tbody className="divide-y divide-hair-soft">{stats.map((row) => <tr key={row.id}><td className="px-3 py-3 font-medium text-fg">{row.name}</td><td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{row.hoursWorked.toFixed(2)}</td><td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{row.salesCount}</td><td className="px-3 py-3 text-right font-mono tabular-nums text-fg">{money(row.salesTotal)}</td><td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{row.unitsSold}</td></tr>)}{!loading && stats.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-fg-faint">Sin estadísticas para mostrar.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
