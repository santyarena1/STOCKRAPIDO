'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { api } from '@/lib/api';

type SyncFrequency = 'manual' | 'daily' | 'hourly' | 'every_6h' | 'every_12h';
type Connection = {
  id: string;
  provider: string;
  name: string;
  priceMarkup: string | number;
  autoSync: boolean;
  enabled: boolean;
  lastSyncAt?: string | null;
  lastStatus?: string | null;
  hasCredentials: boolean;
  syncFrequency: SyncFrequency;
  syncHourLocal?: number | null;
  columnsConfig?: unknown;
  _count?: { items: number };
};
type MappingInfo = { mapping: Record<string, string>; productFields: string[]; syncedFields: string[] };
type Message = { type: 'ok' | 'err'; text: string };

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', barcode: 'Código de barras', brand: 'Marca', imageUrl: 'Imagen',
  unitsPerBox: 'Unidades por bulto', weight: 'Peso', format: 'Formato', flavor: 'Sabor',
  presentation: 'Presentación', subcategory: 'Subcategoría', supplierSku: 'SKU proveedor',
  externalId: 'ID externo', category: 'Categoría', cost: 'Costo', ean: 'EAN',
  listPrice: 'Precio lista', available: 'Disponible', stock: 'Stock', sku: 'SKU', link: 'Link',
};
const FREQUENCIES: { value: SyncFrequency; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'daily', label: 'Diaria' },
  { value: 'hourly', label: 'Cada hora' },
  { value: 'every_6h', label: 'Cada 6 horas' },
  { value: 'every_12h', label: 'Cada 12 horas' },
];

export default function ProveedoresConfigPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [mapping, setMapping] = useState<MappingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [credentials, setCredentials] = useState({ username: '', password: '', extraKey: '', extraValue: '' });
  const [frequency, setFrequency] = useState<SyncFrequency>('manual');
  const [syncHourLocal, setSyncHourLocal] = useState('');
  const [markup, setMarkup] = useState('0');

  const loadConnections = useCallback(async () => {
    try {
      const data = await api<Connection[]>('/sync/connections');
      setConnections(data);
      setActiveId((current) => current && data.some((item) => item.id === current) ? current : data[0]?.id ?? null);
    } catch (error) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al cargar proveedores' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActive = useCallback(async () => {
    if (!activeId) { setConnection(null); setMapping(null); return; }
    try {
      const [detail, mappingInfo] = await Promise.all([
        api<Connection>(`/sync/connections/${activeId}`),
        api<MappingInfo>(`/sync/connections/${activeId}/mapping`),
      ]);
      setConnection(detail);
      setMapping(mappingInfo);
      setFrequency(detail.syncFrequency ?? 'manual');
      setSyncHourLocal(detail.syncHourLocal == null ? '' : String(detail.syncHourLocal));
      setMarkup(String(detail.priceMarkup ?? 0));
      setCredentials({ username: '', password: '', extraKey: '', extraValue: '' });
    } catch (error) {
      setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al cargar la conexión' });
    }
  }, [activeId]);

  useEffect(() => { loadConnections(); }, [loadConnections]);
  useEffect(() => { loadActive(); }, [loadActive]);

  const refresh = async () => { await loadConnections(); await loadActive(); };

  const saveCredentials = async (event: React.FormEvent) => {
    event.preventDefault(); if (!connection) return;
    const values: Record<string, string> = {};
    if (credentials.username.trim()) values.username = credentials.username.trim();
    if (credentials.password) values.password = credentials.password;
    if (credentials.extraKey.trim() && credentials.extraValue) values[credentials.extraKey.trim()] = credentials.extraValue;
    if (Object.keys(values).length === 0) { setMessage({ type: 'err', text: 'Ingresá al menos una credencial.' }); return; }
    setBusy('credentials'); setMessage(null);
    try {
      await api(`/sync/connections/${connection.id}/credentials`, { method: 'PATCH', body: JSON.stringify({ credentials: values }) });
      setMessage({ type: 'ok', text: 'Credenciales guardadas de forma cifrada.' });
      await refresh();
    } catch (error) { setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al guardar credenciales' }); }
    finally { setBusy(null); }
  };

  const saveFrequency = async () => {
    if (!connection) return;
    const hour = syncHourLocal === '' ? null : Number(syncHourLocal);
    if (frequency === 'daily' && (!Number.isInteger(hour) || hour == null || hour < 0 || hour > 23)) {
      setMessage({ type: 'err', text: 'La hora local debe ser un entero entre 0 y 23.' }); return;
    }
    setBusy('frequency'); setMessage(null);
    try {
      await api(`/sync/connections/${connection.id}`, { method: 'PATCH', body: JSON.stringify({ syncFrequency: frequency, syncHourLocal: frequency === 'daily' ? hour : null }) });
      setMessage({ type: 'ok', text: 'Frecuencia de sincronización guardada.' }); await refresh();
    } catch (error) { setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al guardar frecuencia' }); }
    finally { setBusy(null); }
  };

  const toggleAutoSync = async () => {
    if (!connection) return; setBusy('autosync'); setMessage(null);
    try {
      await api(`/sync/connections/${connection.id}`, { method: 'PATCH', body: JSON.stringify({ autoSync: !connection.autoSync }) });
      setMessage({ type: 'ok', text: connection.autoSync ? 'Auto-sync desactivado' : 'Auto-sync activado (catálogo diario en servidor)' }); await refresh();
    } catch (error) { setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al cambiar auto-sync' }); }
    finally { setBusy(null); }
  };

  const saveMarkup = async () => {
    if (!connection) return;
    const value = Number(markup);
    if (!Number.isFinite(value)) { setMessage({ type: 'err', text: 'Ingresá un markup válido.' }); return; }
    setBusy('markup'); setMessage(null);
    try {
      await api(`/sync/connections/${connection.id}`, { method: 'PATCH', body: JSON.stringify({ priceMarkup: value }) });
      setMessage({ type: 'ok', text: `Markup guardado: ${value}%` }); await refresh();
    } catch (error) { setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al guardar markup' }); }
    finally { setBusy(null); }
  };

  const reprice = async () => {
    if (!connection) return; setBusy('reprice'); setMessage(null);
    try {
      const result = await api<{ updated: number }>(`/sync/connections/${connection.id}/reprice`, { method: 'POST' });
      setMessage({ type: 'ok', text: `Markup re-aplicado a ${result.updated} productos.` });
    } catch (error) { setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al recalcular precios' }); }
    finally { setBusy(null); }
  };

  const saveMapping = async () => {
    if (!connection || !mapping) return; setBusy('mapping'); setMessage(null);
    try {
      await api(`/sync/connections/${connection.id}/mapping`, { method: 'PATCH', body: JSON.stringify({ mapping: mapping.mapping }) });
      setMessage({ type: 'ok', text: 'Mapeo guardado. La próxima importación usará estas columnas.' });
    } catch (error) { setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al guardar mapeo' }); }
    finally { setBusy(null); }
  };

  if (loading) return <Loader full label="Proveedores" />;

  return <div className="space-y-6">
    <PageHeader title="Proveedores y sincronización" subtitle="Configurá credenciales, mapeo de columnas y frecuencia de cada proveedor." />
    {message && <div className={`rounded-lg border px-4 py-3 text-sm ${message.type === 'ok' ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-crit/30 bg-[var(--crit-soft)] text-crit'}`}>{message.text}</div>}
    <div className="flex flex-wrap gap-2">{connections.map((item) => <button key={item.id} type="button" onClick={() => setActiveId(item.id)} className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${item.id === activeId ? 'border-[color:var(--brand-accent)] bg-brand-highlight-soft text-fg' : 'border-hair text-fg-muted hover:bg-raised hover:text-fg'}`}>{item.name}<span className="ml-2 text-xs opacity-70">{item._count?.items ?? 0} ítems</span></button>)}</div>
    {connections.length === 0 && <div className="rounded-xl border border-hair-soft bg-surface p-5 text-fg-muted">No hay conexiones configuradas.</div>}
    {connection && <>
      <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-5">
        <div><h2 className="font-semibold text-fg">Credenciales</h2><p className="text-sm text-fg-muted">Se guardan cifradas y son utilizadas por el runner. Los valores existentes nunca se muestran.</p><p className={`mt-2 text-sm ${connection.hasCredentials ? 'text-ok' : 'text-warn'}`}>{connection.hasCredentials ? 'Credenciales cargadas ✓' : 'Sin credenciales'}</p></div>
        <form onSubmit={saveCredentials} className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs text-fg-faint">Usuario</label><input value={credentials.username} onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))} autoComplete="username" className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /></div>
          <div><label className="mb-1 block text-xs text-fg-faint">Contraseña</label><input type="password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /></div>
          <div><label className="mb-1 block text-xs text-fg-faint">Clave extra (opcional)</label><input value={credentials.extraKey} onChange={(event) => setCredentials((current) => ({ ...current, extraKey: event.target.value }))} placeholder="token, accountId…" className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /></div>
          <div><label className="mb-1 block text-xs text-fg-faint">Valor extra</label><input type="password" value={credentials.extraValue} onChange={(event) => setCredentials((current) => ({ ...current, extraValue: event.target.value }))} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /></div>
          <button type="submit" disabled={busy === 'credentials'} className="btn-brand rounded-lg px-4 py-2 sm:col-span-2 sm:justify-self-start disabled:opacity-50">{busy === 'credentials' ? 'Guardando…' : connection.hasCredentials ? 'Reemplazar credenciales' : 'Guardar credenciales'}</button>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-5">
          <div><h2 className="font-semibold text-fg">Frecuencia de sincronización</h2><p className="text-sm text-fg-muted">Definí cuándo debe ejecutarse la conexión.</p></div>
          <div><label className="mb-1 block text-xs text-fg-faint">Frecuencia</label><select value={frequency} onChange={(event) => setFrequency(event.target.value as SyncFrequency)} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg">{FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          {frequency === 'daily' && <div><label className="mb-1 block text-xs text-fg-faint">Hora local (0–23)</label><input type="number" min={0} max={23} step={1} value={syncHourLocal} onChange={(event) => setSyncHourLocal(event.target.value)} className="w-32 rounded-lg border border-hair bg-raised px-3 py-2 font-mono tabular-nums text-fg" /></div>}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={connection.autoSync} onChange={toggleAutoSync} disabled={busy === 'autosync'} />Auto-sync catálogo diario (servidor)</label>
          <button type="button" onClick={saveFrequency} disabled={busy === 'frequency'} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">{busy === 'frequency' ? 'Guardando…' : 'Guardar frecuencia'}</button>
        </section>
        <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-5">
          <div><h2 className="font-semibold text-fg">Markup de venta (%)</h2><p className="text-sm text-fg-muted">Se aplica al costo unitario cuando se importan productos.</p></div>
          <input type="number" value={markup} onChange={(event) => setMarkup(event.target.value)} className="w-32 rounded-lg border border-hair bg-raised px-3 py-2 font-mono tabular-nums text-fg" />
          <div className="flex flex-wrap gap-2"><button type="button" onClick={saveMarkup} disabled={busy === 'markup'} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">{busy === 'markup' ? 'Guardando…' : 'Guardar markup'}</button><button type="button" onClick={reprice} disabled={busy === 'reprice'} className="rounded-lg border border-hair px-4 py-2 text-fg-muted hover:bg-raised hover:text-fg disabled:opacity-50">{busy === 'reprice' ? 'Recalculando…' : 'Re-aplicar markup a productos'}</button></div>
        </section>
      </div>

      <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-fg">Mapeo de columnas → producto</h2><p className="text-sm text-fg-muted">Elegí qué columna del proveedor completa cada campo del producto.</p></div><button type="button" onClick={saveMapping} disabled={!mapping || busy === 'mapping'} className="btn-brand rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy === 'mapping' ? 'Guardando…' : 'Guardar mapeo'}</button></div>
        {mapping ? <div className="grid gap-3 sm:grid-cols-2">{mapping.productFields.map((productField) => <div key={productField} className="flex items-center gap-2"><span className="w-36 shrink-0 truncate text-sm font-medium text-fg-muted" title={FIELD_LABELS[productField] || productField}>{FIELD_LABELS[productField] || productField}</span><span className="text-fg-faint">←</span><select value={mapping.mapping[productField] || ''} onChange={(event) => setMapping({ ...mapping, mapping: { ...mapping.mapping, [productField]: event.target.value } })} className="min-w-0 flex-1 rounded-lg border border-hair bg-raised px-2 py-1.5 text-sm text-fg"><option value="">— (no completar)</option>{mapping.syncedFields.map((syncedField) => <option key={syncedField} value={syncedField}>{FIELD_LABELS[syncedField] || syncedField}</option>)}</select></div>)}</div> : <Loader size="sm" label="Mapeo" />}
      </section>
    </>}
  </div>;
}
