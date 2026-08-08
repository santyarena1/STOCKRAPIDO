'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getApiBaseUrl } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProviderTabs, SYNC_PROVIDERS, SyncProviderProvider, useSyncProvider } from '@/components/sync/SyncProviderContext';

type SyncedSummary = { costUnit?: number | null; linkedProductId?: string | null };

function SynchronizationScreen() {
  const { connection, refetch } = useSyncProvider();
  const [items, setItems] = useState<SyncedSummary[]>([]);
  const [busy, setBusy] = useState<'run' | 'import' | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadItems = useCallback(async () => {
    if (!connection) return setItems([]);
    try { setItems(await api<SyncedSummary[]>(`/sync/connections/${connection.id}/products`)); }
    catch { setItems([]); }
  }, [connection]);
  useEffect(() => { void loadItems(); }, [loadItems]);

  const run = async (kind: 'run' | 'import') => {
    if (!connection) return;
    setBusy(kind); setMessage(null);
    try {
      if (kind === 'run') {
        const result = await api<{ itemsUpserted: number }>(`/sync/connections/${connection.id}/run`, { method: 'POST' });
        setMessage({ type: 'ok', text: `Catálogo sincronizado: ${result.itemsUpserted} productos (sin precio B2B).` });
      } else {
        const result = await api<{ created: number; updated: number; skipped: number }>(`/sync/connections/${connection.id}/import`, { method: 'POST', body: JSON.stringify({ onlyWithCost: true }) });
        setMessage({ type: 'ok', text: `Importados: ${result.created} nuevos, ${result.updated} actualizados, ${result.skipped} omitidos (precios unitarios).` });
      }
      await refetch(); await loadItems();
    } catch (error) { setMessage({ type: 'err', text: (error as Error).message }); }
    finally { setBusy(null); }
  };

  const meta = connection ? SYNC_PROVIDERS[connection.provider] : null;
  const withCost = items.filter((item) => item.costUnit != null).length;
  const linked = items.filter((item) => item.linkedProductId).length;
  const markup = Number(connection?.priceMarkup ?? 0);
  let apiBase = '';
  try { apiBase = getApiBaseUrl(); } catch {}

  return <Container className="max-w-6xl space-y-6">
    <PageHeader title="Sincronización" subtitle="Actualizá el catálogo, traé los precios del proveedor e importalos a Productos." actions={<Link href="/config/proveedores" className="rounded-xl border border-hair bg-surface px-4 py-2.5 text-sm font-medium text-fg-muted hover:bg-raised">Configurar proveedor →</Link>} />
    <ProviderTabs />
    {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.type === 'ok' ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-crit/30 bg-[var(--crit-soft)] text-crit'}`}>{message.text}</div>}
    {connection && <>
      <section className="rounded-xl border border-hair-soft bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-fg">{meta?.label ?? connection.name}</h2><p className="text-sm text-fg-muted">{meta?.description}</p>{connection.lastSyncAt && <p className="mt-2 font-mono text-xs text-fg-faint">Última sync: {new Date(connection.lastSyncAt).toLocaleString('es-AR')}{connection.lastStatus ? ` · ${connection.lastStatus}` : ''}</p>}</div><span className={`rounded-md border px-2.5 py-1 text-xs ${connection.autoSync ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-hair bg-raised text-fg-faint'}`}>Auto-sync {connection.autoSync ? 'activo' : 'inactivo'}</span></div></section>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-hair-soft bg-surface p-5"><div className="mb-5 flex gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised2 font-mono text-fg-muted">1</span><div><h2 className="font-semibold text-fg">Sincronizar catálogo</h2><p className="text-sm text-fg-faint">{connection._count?.items ?? items.length} ítems disponibles</p></div></div><button type="button" onClick={() => run('run')} disabled={!!busy || connection.provider !== 'mondelez'} className="w-full rounded-xl border border-hair bg-raised px-4 py-3 text-sm font-semibold text-fg hover:bg-raised2 disabled:opacity-50">{connection.provider !== 'mondelez' ? 'Usá el runner local' : busy === 'run' ? 'Sincronizando…' : 'Sync catálogo (servidor)'}</button></section>
        <section className="rounded-xl border border-hair-soft bg-surface p-5"><div className="mb-5 flex gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised2 font-mono text-fg-muted">2</span><div><h2 className="font-semibold text-fg">Traer precio B2B</h2><p className="text-sm text-fg-faint"><span className="font-mono text-ok">{withCost}</span> de {connection._count?.items ?? items.length} con precio</p></div></div><p className="text-sm text-fg-muted">El runner local actualiza los costos reales del proveedor.</p></section>
        <section className="rounded-xl border border-hair-soft bg-surface p-5"><div className="mb-5 flex gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised2 font-mono text-fg-muted">3</span><div><h2 className="font-semibold text-fg">Importar a productos</h2><p className="text-sm text-fg-faint"><span className="font-mono text-brand">{linked}</span> vinculados · markup {markup}%</p></div></div><button type="button" onClick={() => run('import')} disabled={!!busy} className="btn-brand w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy === 'import' ? 'Importando…' : 'Importar a productos'}</button></section>
      </div>
      <section className="rounded-xl border border-hair-soft border-l-4 bg-surface p-4 text-sm text-fg-muted"><p className="font-semibold text-fg">Runner local</p><p className="mt-1">{meta?.runnerNote}</p><p className="mt-2 text-xs text-fg-faint"><code>SR_API={apiBase || 'https://stockrapido-api.vercel.app'}</code> · ejecutá <code>python {meta?.runnerFile ?? `${connection.provider}_sync_runner.py`}</code>.</p></section>
    </>}
  </Container>;
}

export default function SincronizacionesPage() { return <SyncProviderProvider><SynchronizationScreen /></SyncProviderProvider>; }
