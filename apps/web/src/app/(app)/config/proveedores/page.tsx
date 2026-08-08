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
  hasSession: boolean;
  sessionExpiresAt?: string | null;
  syncFrequency: SyncFrequency;
  syncHourLocal?: number | null;
  columnsConfig?: unknown;
  _count?: { items: number };
};
type MappingInfo = { mapping: Record<string, string>; productFields: string[]; syncedFields: string[] };
type Message = { type: 'ok' | 'err'; text: string };

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', ean: 'EAN', eanUnit: 'EAN unidad', eanBox: 'EAN bulto',
  barcode: 'Código de barras', sku: 'SKU proveedor', supplierRef: 'Ref. proveedor (RefId)',
  supplierSku: 'SKU proveedor', externalId: 'ID externo', brand: 'Marca', category: 'Categoría',
  subcategory: 'Subcategoría', imageUrl: 'Imagen', link: 'Link', cost: 'Costo',
  basePrice: 'Precio base', listPrice: 'Precio lista', ivaAlicuota: 'IVA (%)', iva: 'IVA',
  unitsPerBox: 'Unidades por bulto', unitsPerDisplay: 'Unidades por display',
  displaysPerBox: 'Displays por bulto', retornable: 'Retornable', weight: 'Peso',
  format: 'Formato', flavor: 'Sabor', presentation: 'Presentación', available: 'Disponible', stock: 'Stock',
};
const MAPPING_HINTS: Record<string, string> = {
  barcode: 'Recomendado: EAN unidad',
  supplierSku: 'Recomendado: Ref. proveedor (RefId)',
  supplierRef: 'Recomendado: Ref. proveedor (RefId)',
  eanBox: 'Recomendado: EAN bulto',
  cost: 'Recomendado: Costo',
};
const FREQUENCIES: { value: SyncFrequency; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'daily', label: 'Diaria' },
  { value: 'hourly', label: 'Cada hora' },
  { value: 'every_6h', label: 'Cada 6 horas' },
  { value: 'every_12h', label: 'Cada 12 horas' },
];
const DEFAULT_CONNECTIONS = [
  { provider: 'mondelez', name: 'Mondelez', priceMarkup: 40 },
  { provider: 'juntosplus', name: 'Juntos+', priceMarkup: 40 },
  { provider: 'tokin', name: 'Tokin (Arcor)', priceMarkup: 40 },
];
const PROVIDERS: Record<string, { label: string; description: string }> = {
  mondelez: { label: 'Mondelez', description: 'Catálogo VTEX y precios B2B mediante runner.' },
  juntosplus: { label: 'Juntos+', description: 'Catálogo Coca-Cola FEMSA vía runner local.' },
  tokin: { label: 'Tokin (Arcor)', description: 'Catálogo Tokin con variantes UN/DI/BU vía runner local.' },
};
type CredentialField = { key: string; label: string; type?: 'text' | 'password'; placeholder?: string };
const CREDENTIAL_FIELDS: Record<string, CredentialField[]> = {
  mondelez: [
    { key: 'phone', label: 'Teléfono Mi Tienda Mondelez' },
    { key: 'password', label: 'Contraseña', type: 'password' },
  ],
  juntosplus: [
    { key: 'cliente', label: 'Número de cliente' },
    { key: 'password', label: 'Contraseña', type: 'password' },
  ],
  tokin: [
    { key: 'user', label: 'Usuario/Email Tokin' },
    { key: 'password', label: 'Contraseña', type: 'password' },
  ],
};
const GENERIC_CREDENTIAL_FIELDS: CredentialField[] = [
  { key: 'username', label: 'Usuario' },
  { key: 'password', label: 'Contraseña', type: 'password' },
];

export default function ProveedoresConfigPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [mapping, setMapping] = useState<MappingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [sessionValue, setSessionValue] = useState('');
  const [sessionExpiresAt, setSessionExpiresAt] = useState('');
  const [frequency, setFrequency] = useState<SyncFrequency>('manual');
  const [syncHourLocal, setSyncHourLocal] = useState('');
  const [markup, setMarkup] = useState('0');

  const loadConnections = useCallback(async () => {
    try {
      let data = await api<Connection[]>('/sync/connections');
      for (const definition of DEFAULT_CONNECTIONS) {
        if (!data.some((item) => item.provider === definition.provider)) {
          const created = await api<Connection>('/sync/connections', {
            method: 'POST',
            body: JSON.stringify(definition),
          });
          data = [...data, created];
        }
      }
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
      setCredentials({});
      setShowSessionForm(false);
      setSessionValue('');
      setSessionExpiresAt('');
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
    for (const field of CREDENTIAL_FIELDS[connection.provider] ?? GENERIC_CREDENTIAL_FIELDS) {
      const value = credentials[field.key];
      if (value?.trim()) values[field.key] = value.trim();
    }
    if (Object.keys(values).length === 0) { setMessage({ type: 'err', text: 'Ingresá al menos una credencial.' }); return; }
    setBusy('credentials'); setMessage(null);
    try {
      await api(`/sync/connections/${connection.id}/credentials`, { method: 'PATCH', body: JSON.stringify({ credentials: values }) });
      setMessage({ type: 'ok', text: 'Credenciales guardadas de forma cifrada.' });
      await refresh();
    } catch (error) { setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al guardar credenciales' }); }
    finally { setBusy(null); }
  };

  const saveSession = async () => {
    if (!connection || !sessionValue.trim()) return;
    setBusy('session'); setMessage(null);
    try {
      await api(`/sync/connections/${connection.id}/session`, {
        method: 'PATCH',
        body: JSON.stringify({ session: sessionValue.trim(), expiresAt: sessionExpiresAt || undefined }),
      });
      setMessage({ type: 'ok', text: 'Sesión guardada de forma cifrada.' });
      setSessionValue(''); setSessionExpiresAt(''); setShowSessionForm(false);
      await refresh();
    } catch (error) { setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al guardar la sesión' }); }
    finally { setBusy(null); }
  };

  const deleteSession = async () => {
    if (!connection || !confirm('¿Borrar la sesión guardada de este proveedor?')) return;
    setBusy('delete-session'); setMessage(null);
    try {
      await api(`/sync/connections/${connection.id}/session`, { method: 'DELETE' });
      setMessage({ type: 'ok', text: 'Sesión eliminada.' }); await refresh();
    } catch (error) { setMessage({ type: 'err', text: error instanceof Error ? error.message : 'Error al borrar la sesión' }); }
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
  const credentialFields = connection ? CREDENTIAL_FIELDS[connection.provider] ?? GENERIC_CREDENTIAL_FIELDS : GENERIC_CREDENTIAL_FIELDS;

  return <div className="space-y-6">
    <PageHeader title="Proveedores y sincronización" subtitle="Configurá credenciales, mapeo de columnas y frecuencia de cada proveedor." />
    {message && <div className={`rounded-lg border px-4 py-3 text-sm ${message.type === 'ok' ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-crit/30 bg-[var(--crit-soft)] text-crit'}`}>{message.text}</div>}
    <div className="flex flex-wrap gap-2">{connections.map((item) => <button key={item.id} type="button" onClick={() => setActiveId(item.id)} title={PROVIDERS[item.provider]?.description} className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${item.id === activeId ? 'border-[color:var(--brand-accent)] bg-brand-highlight-soft text-fg' : 'border-hair text-fg-muted hover:bg-raised hover:text-fg'}`}>{PROVIDERS[item.provider]?.label ?? item.name}<span className="ml-2 text-xs opacity-70">{item._count?.items ?? 0} ítems</span></button>)}</div>
    {connection && PROVIDERS[connection.provider] && <p className="text-sm text-fg-muted">{PROVIDERS[connection.provider].description}</p>}
    {connections.length === 0 && <div className="rounded-xl border border-hair-soft bg-surface p-5 text-fg-muted">No hay conexiones configuradas.</div>}
    {connection && <>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-5">
          <div><h2 className="font-semibold text-fg">Credenciales de {PROVIDERS[connection.provider]?.label ?? connection.name}</h2><p className="text-sm text-fg-muted">Se guardan cifradas. Los valores existentes nunca se muestran en pantalla.</p><p className={`mt-2 text-sm ${connection.hasCredentials ? 'text-ok' : 'text-warn'}`}>{connection.hasCredentials ? 'Credenciales cargadas ✓' : 'Sin credenciales'}</p>{connection.provider === 'juntosplus' && <p className="mt-2 text-sm text-fg-muted">Juntos+ usa login de Coca-Cola (Microsoft). Cargá tu número de cliente y contraseña; el runner se loguea solo y guarda la sesión. No hay OTP salvo verificación ocasional.</p>}</div>
          <form onSubmit={saveCredentials} className="grid gap-3 sm:grid-cols-2">
            {credentialFields.map((field) => <div key={field.key}><label className="mb-1 block text-xs text-fg-faint">{field.label}</label><input type={field.type ?? 'text'} value={credentials[field.key] ?? ''} onChange={(event) => setCredentials((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} autoComplete={field.type === 'password' ? 'new-password' : 'off'} className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /></div>)}
            <button type="submit" disabled={busy === 'credentials'} className="btn-brand rounded-lg px-4 py-2 sm:col-span-2 sm:justify-self-start disabled:opacity-50">{busy === 'credentials' ? 'Guardando…' : connection.hasCredentials ? 'Reemplazar credenciales' : 'Guardar credenciales'}</button>
          </form>
        </section>

        <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-5">
          <div><h2 className="font-semibold text-fg">Sesión / Token</h2><p className="text-sm font-medium text-fg">La sesión la guarda el runner al loguearse. No necesitás hacer nada.</p><p className="mt-1 text-sm text-fg-muted">Mientras siga vigente, el sistema puede traer catálogo y cuenta sin volver a iniciar sesión.</p><p className={`mt-2 text-sm ${connection.hasSession ? 'text-ok' : 'text-warn'}`}>{connection.hasSession ? `Sesión guardada${connection.sessionExpiresAt ? ` · vence ${new Date(connection.sessionExpiresAt).toLocaleString('es-AR')}` : ''}` : 'Sin sesión'}</p></div>
          <div className="flex flex-wrap gap-2">{connection.hasSession && <button type="button" onClick={deleteSession} disabled={busy === 'delete-session'} className="rounded-lg border border-crit/40 px-4 py-2 text-sm text-crit hover:bg-[var(--crit-soft)] disabled:opacity-50">{busy === 'delete-session' ? 'Borrando…' : 'Borrar sesión'}</button>}<button type="button" onClick={() => setShowSessionForm((current) => !current)} className="rounded-lg border border-hair px-4 py-2 text-sm text-fg-muted hover:bg-raised">Avanzado (pegar token manual)</button></div>
          {showSessionForm && <div className="space-y-3 rounded-xl border border-hair-soft bg-raised p-4"><div><label className="mb-1 block text-xs text-fg-faint">Token, Bearer, cookies o sesión</label><textarea rows={5} value={sessionValue} onChange={(event) => setSessionValue(event.target.value)} placeholder="Pegá acá el token o la sesión…" className="w-full rounded-lg border border-hair bg-surface px-3 py-2 font-mono text-sm text-fg" /></div><div><label className="mb-1 block text-xs text-fg-faint">Vencimiento (opcional)</label><input type="datetime-local" value={sessionExpiresAt} onChange={(event) => setSessionExpiresAt(event.target.value)} className="w-full rounded-lg border border-hair bg-surface px-3 py-2 font-mono text-sm text-fg sm:w-auto" /></div><div className="flex flex-wrap gap-2"><button type="button" onClick={saveSession} disabled={!sessionValue.trim() || busy === 'session'} className="btn-brand rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy === 'session' ? 'Guardando…' : 'Guardar sesión'}</button><button type="button" onClick={() => { setShowSessionForm(false); setSessionValue(''); setSessionExpiresAt(''); }} className="rounded-lg border border-hair px-4 py-2 text-sm text-fg-muted hover:bg-surface">Cancelar</button></div></div>}
        </section>
      </div>

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
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-fg">Mapeo: campo del producto ← dato del proveedor</h2><p className="text-sm text-fg-muted">A la izquierda ves el campo que se completa; elegí a la derecha qué dato del proveedor usar.</p></div><button type="button" onClick={saveMapping} disabled={!mapping || busy === 'mapping'} className="btn-brand rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy === 'mapping' ? 'Guardando…' : 'Guardar mapeo'}</button></div>
        {mapping ? <div className="grid gap-3 sm:grid-cols-2">{mapping.productFields.map((productField) => <div key={productField} className="rounded-lg border border-hair-soft bg-raised p-3"><div className="flex items-center gap-2"><span className="w-36 shrink-0 truncate text-sm font-medium text-fg" title={FIELD_LABELS[productField] || productField}>{FIELD_LABELS[productField] || productField}</span><span className="text-fg-faint">←</span><select value={mapping.mapping[productField] || ''} onChange={(event) => setMapping({ ...mapping, mapping: { ...mapping.mapping, [productField]: event.target.value } })} className="min-w-0 flex-1 rounded-lg border border-hair bg-surface px-2 py-1.5 text-sm text-fg"><option value="">— (no completar)</option>{mapping.syncedFields.map((syncedField) => <option key={syncedField} value={syncedField}>{FIELD_LABELS[syncedField] || syncedField}</option>)}</select></div>{MAPPING_HINTS[productField] && <p className="mt-1.5 text-xs text-fg-faint">{MAPPING_HINTS[productField]}</p>}</div>)}</div> : <Loader size="sm" label="Mapeo" />}
      </section>
    </>}
  </div>;
}
