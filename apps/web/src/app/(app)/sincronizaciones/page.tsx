'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, getApiBaseUrl } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { usePersistedState } from '@/lib/use-persisted-state';

type Connection = {
  id: string;
  provider: string;
  name: string;
  priceMarkup: string | number;
  autoSync: boolean;
  enabled?: boolean;
  lastSyncAt?: string | null;
  lastStatus?: string | null;
  _count?: { items: number };
};

type Synced = {
  id: string;
  name?: string;
  ean?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  cost?: unknown;
  listPrice?: unknown;
  available?: boolean;
  stock?: unknown;
  unitsPerBox?: string | null;
  unitsPerBoxNum?: number | null;
  costBulk?: number | null;
  costUnit?: number | null;
  saleUnit?: number | null;
  weight?: string;
  format?: string;
  flavor?: string;
  presentation?: string;
  sku?: string;
  externalId?: string;
  imageUrl?: string;
  link?: string;
  linkedProductId?: string | null;
};

const PROVIDERS: Record<
  string,
  { label: string; description: string; accent: string; runnerNote: string }
> = {
  mondelez: {
    label: 'Mondelez',
    description: 'Catálogo VTEX + precio B2B real vía runner local',
    accent: 'border-amber-500/40 bg-amber-900/10',
    runnerNote:
      'El precio real lo trae el runner Python con tu login de Mi Tienda Mondelez. El catálogo público (botón de arriba) no incluye costos.',
  },
  juntosplus: {
    label: 'Juntos+',
    description: 'Catálogo Coca-Cola FEMSA vía runner local',
    accent: 'border-crit/40 bg-[var(--crit-soft)]',
    runnerNote:
      'Juntos+ requiere login interactivo con OTP. Ejecutá el runner local, iniciá sesión y entrá al catálogo para traer productos y precios B2B.',
  },
};

const DEFAULT_CONNECTIONS = [
  { provider: 'mondelez', name: 'Mondelez', priceMarkup: 40 },
  { provider: 'juntosplus', name: 'Juntos+', priceMarkup: 40 },
];

export default function SincronizacionesPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeId, setActiveId] = usePersistedState<string | null>('sr-filters:sincronizaciones:connection', null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [items, setItems] = useState<Synced[]>([]);
  const [q, setQ] = usePersistedState('sr-filters:sincronizaciones:q', '');
  const [onlyWithCost, setOnlyWithCost] = usePersistedState('sr-filters:sincronizaciones:only-with-cost', false);
  const [showInternal, setShowInternal] = usePersistedState('sr-filters:sincronizaciones:show-internal', false);

  const conn = connections.find((c) => c.id === activeId) ?? connections[0] ?? null;
  const providerMeta = PROVIDERS[conn?.provider ?? ''] ?? {
    label: conn?.name ?? 'Proveedor',
    description: 'Sincronización de catálogo',
    accent: 'border-hair bg-raised',
    runnerNote: '',
  };
  const apiBase = useMemo(() => {
    try {
      return getApiBaseUrl();
    } catch {
      return '';
    }
  }, []);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      let conns = await api<Connection[]>('/sync/connections');
      for (const definition of DEFAULT_CONNECTIONS) {
        if (!conns.some((item) => item.provider === definition.provider)) {
          const created = await api<Connection>('/sync/connections', {
            method: 'POST',
            body: JSON.stringify(definition),
          });
          conns = [...conns, created];
        }
      }
      setConnections(conns);
      setActiveId((prev) => prev && conns.some((c) => c.id === prev) ? prev : conns[0]?.id ?? null);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    if (!conn) return;
    try {
      const data = await api<Synced[]>(`/sync/connections/${conn.id}/products`, {
        params: { q: q || undefined, onlyWithCost: onlyWithCost ? 'true' : undefined },
      });
      setItems(data);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }, [conn, q, onlyWithCost]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const withCost = items.filter((i) => i.costUnit != null).length;
  const linked = items.filter((i) => i.linkedProductId).length;
  const mk = Number(conn?.priceMarkup) || 0;

  const run = async (kind: 'run' | 'import') => {
    if (!conn) return;
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === 'run') {
        const r = await api<{ itemsUpserted: number }>(`/sync/connections/${conn.id}/run`, { method: 'POST' });
        setMsg({ type: 'ok', text: `Catálogo sincronizado: ${r.itemsUpserted} productos (sin precio B2B).` });
      } else {
        const r = await api<{ created: number; updated: number; skipped: number }>(
          `/sync/connections/${conn.id}/import`,
          { method: 'POST', body: JSON.stringify({ onlyWithCost: true }) },
        );
        setMsg({
          type: 'ok',
          text: `Importados: ${r.created} nuevos, ${r.updated} actualizados, ${r.skipped} omitidos (precios unitarios).`,
        });
      }
      await loadConnections();
      await loadItems();
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <Loader full label="Sincronizaciones" />;
  }

  return (
    <Container className="max-w-[1600px] space-y-6">
      <PageHeader
        title="Sincronizaciones"
        subtitle="Catálogo de proveedores → productos con precios unitarios en POS y listado. Los valores por bulto quedan como referencia interna."
        actions={<Link href="/config/proveedores" className="rounded-lg border border-hair px-4 py-2 text-sm font-medium text-fg-muted hover:bg-raised hover:text-fg">Configurar credenciales, mapeo y frecuencia →</Link>}
      />

      {msg && (
        <div
          className={`rounded-lg border text-sm px-4 py-3 ${
            msg.type === 'ok'
              ? 'border-ok/30 bg-[var(--ok-soft)] text-ok'
              : 'border-crit/30 bg-[var(--crit-soft)] text-crit'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Selector de proveedor (extensible) */}
      <div className="flex flex-wrap gap-2">
        {connections.map((c) => {
          const meta = PROVIDERS[c.provider] ?? { label: c.name, accent: 'border-hair' };
          const active = c.id === conn?.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                active
                  ? `${meta.accent ?? 'border-[color:var(--brand-accent)]'} bg-brand-highlight-soft text-fg`
                  : 'border-hair text-fg-muted hover:bg-raised hover:text-fg'
              }`}
            >
              {meta.label ?? c.name}
              <span className="ml-2 text-xs opacity-70">{c._count?.items ?? 0} ítems</span>
            </button>
          );
        })}
      </div>

      {conn && (
        <>
          <div className={`rounded-xl border p-4 md:p-5 ${providerMeta.accent}`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-fg">{providerMeta.label}</h2>
                <p className="text-sm text-fg-muted">{providerMeta.description}</p>
                {conn.lastSyncAt && (
                  <p className="mt-1 font-mono text-xs tabular-nums text-fg-faint">
                    Última sync: {new Date(conn.lastSyncAt).toLocaleString('es-AR')}
                    {conn.lastStatus ? ` · ${conn.lastStatus}` : ''}
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-md border px-2.5 py-1 text-xs ${conn.autoSync ? 'border-ok/30 bg-[var(--ok-soft)] text-ok' : 'border-hair bg-raised text-fg-faint'}`}>Auto-sync {conn.autoSync ? 'activo' : 'inactivo'}</span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-hair-soft bg-surface p-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised2 font-mono text-sm text-fg-muted">1</span>
                <div><h3 className="font-semibold text-fg">Sincronizar catálogo</h3><p className="text-sm text-fg-faint">{conn._count?.items ?? items.length} ítems en catálogo</p></div>
              </div>
              <button type="button" onClick={() => run('run')} disabled={!!busy || !conn || conn.provider !== 'mondelez'} className="w-full rounded-lg border border-hair bg-raised px-4 py-2 text-sm font-medium text-fg hover:bg-raised2 disabled:opacity-50">
                {conn.provider === 'juntosplus' ? 'Usá el runner local' : busy === 'run' ? 'Sincronizando…' : 'Sync catálogo (servidor)'}
              </button>
              {conn.provider === 'juntosplus' && <p className="mt-2 text-xs text-fg-faint">Juntos+ no ofrece un catálogo público para sincronizar desde el servidor.</p>}
            </div>
            <div className="rounded-xl border border-hair-soft bg-surface p-5">
              <div className="mb-4 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised2 font-mono text-sm text-fg-muted">2</span><div><h3 className="font-semibold text-fg">Traer precio B2B</h3><p className="text-sm text-fg-faint">Precio disponible en <span className="font-mono tabular-nums text-ok">{withCost}</span> de <span className="font-mono tabular-nums">{conn._count?.items ?? items.length}</span></p></div></div>
              <p className="text-sm text-fg-muted">El runner local actualiza los costos reales del proveedor.</p>
            </div>
            <div className="rounded-xl border border-hair-soft bg-surface p-5">
              <div className="mb-4 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised2 font-mono text-sm text-fg-muted">3</span><div><h3 className="font-semibold text-fg">Importar a productos</h3><p className="text-sm text-fg-faint"><span className="font-mono tabular-nums text-brand">{linked}</span> vinculados · markup <span className="font-mono tabular-nums">{mk}%</span></p></div></div>
              <button type="button" onClick={() => run('import')} disabled={!!busy || !conn} className="btn-brand w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                {busy === 'import' ? 'Importando…' : 'Importar a productos'}
              </button>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-hair-soft border-l-4 bg-surface p-4 text-sm text-fg-muted">
            <p className="font-medium text-fg">Precio real B2B (runner local)</p>
            <p>{providerMeta.runnerNote}</p>
            <p className="text-xs text-fg-faint">
              En <code className="text-fg-muted">sync-runner/.env</code> configurá{' '}
              <code className="text-fg-muted">SR_API={apiBase || 'https://stockrapido-api.vercel.app'}</code> (proyecto API en Vercel — ver DEPLOY.md).
              Ejecutá <code className="text-fg-muted">python {conn.provider === 'juntosplus' ? 'juntosplus_sync_runner.py' : 'mondelez_sync_runner.py'}</code> en tu PC o agendalo con Task Scheduler.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full sm:min-w-[200px] sm:flex-1">
              <label className="mb-1 block text-xs text-fg-faint">Buscar</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, EAN o marca…"
                className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-sm text-fg placeholder:text-fg-faint"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-fg-muted">
              <input type="checkbox" checked={onlyWithCost} onChange={(e) => setOnlyWithCost(e.target.checked)} />
              Solo con precio B2B ({withCost})
            </label>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-fg-faint">
              <input type="checkbox" checked={showInternal} onChange={(e) => setShowInternal(e.target.checked)} />
              Ver costos por bulto (interno)
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-hair-soft bg-surface">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-raised text-left text-xs uppercase tracking-wide text-fg-faint">
                  <tr>
                    <th className="p-3 w-12" />
                    <th className="p-3">Producto</th>
                    <th className="p-3">Marca</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3 text-right">Costo c/u</th>
                    <th className="p-3 text-right">Venta c/u (+{mk}%)</th>
                    {showInternal && <th className="p-3 text-right text-fg-faint">Costo bulto</th>}
                    <th className="p-3 text-center">U/bulto</th>
                    <th className="p-3">EAN</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hair-soft">
                  {items.map((p) => (
                    <tr key={p.id} className="hover:bg-raised/70">
                      <td className="p-2">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="w-9 h-9 object-contain rounded bg-white/5" />
                        ) : (
                          <div className="h-9 w-9 rounded bg-raised2" />
                        )}
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-fg">{p.name ?? '—'}</span>
                        {p.linkedProductId && (
                          <span className="ml-2 rounded-md border border-ok/30 bg-[var(--ok-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ok">importado</span>
                        )}
                      </td>
                      <td className="p-3 text-fg-muted">{p.brand ?? '—'}</td>
                      <td className="p-3 text-xs text-fg-faint">{p.category ?? '—'}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-fg-muted">
                        {p.costUnit != null ? formatMoneyArs(p.costUnit) : '—'}
                      </td>
                      <td className="p-3 text-right font-mono font-medium tabular-nums text-brand">
                        {p.saleUnit != null ? formatMoneyArs(p.saleUnit) : '—'}
                      </td>
                      {showInternal && (
                        <td className="p-3 text-right font-mono text-xs tabular-nums text-fg-faint">
                          {p.costBulk != null ? formatMoneyArs(p.costBulk) : '—'}
                        </td>
                      )}
                      <td className="p-3 text-center text-fg-muted text-xs">
                        {p.unitsPerBoxNum ?? p.unitsPerBox ?? '—'}
                      </td>
                      <td className="p-3 text-fg-faint text-xs font-mono">{p.ean ?? '—'}</td>
                      <td className="p-3">
                        {p.linkedProductId ? (
                          <span className="rounded-md border border-ok/30 bg-[var(--ok-soft)] px-2 py-1 text-xs text-ok">Importado</span>
                        ) : p.costUnit == null ? (
                          <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 text-xs text-warn">Falta precio</span>
                        ) : (
                          <span className="rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-muted">Sin importar</span>
                        )}
                      </td>
                      <td className="p-3">
                        {p.link ? (
                          <a href={p.link} target="_blank" rel="noreferrer" className="text-brand text-xs hover:underline">
                            ↗
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={showInternal ? 11 : 10} className="p-8 text-center text-fg-faint">
                        Sin productos. Sincronizá el catálogo o ejecutá el runner con precios B2B.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 md:hidden">
              {items.map((product) => (
                <article key={product.id} className="rounded-xl border border-hair-soft bg-surface p-3">
                  <div className="flex items-start gap-3">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded bg-white/5 object-contain" /> : <div className="h-10 w-10 shrink-0 rounded bg-raised2" />}<div className="min-w-0 flex-1"><p className="font-medium text-fg">{product.name ?? '—'}</p><p className="text-xs text-fg-faint">{product.brand ?? 'Sin marca'} · {product.category ?? 'Sin categoría'}</p></div>{product.linkedProductId ? <span className="rounded-md border border-ok/30 bg-[var(--ok-soft)] px-2 py-1 text-xs text-ok">Importado</span> : product.costUnit == null ? <span className="rounded-md border border-warn/30 bg-[var(--warn-soft)] px-2 py-1 text-xs text-warn">Falta precio</span> : <span className="rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-muted">Sin importar</span>}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-hair-soft pt-3 text-sm"><div><span className="block text-xs text-fg-faint">Costo c/u</span><span className="font-mono tabular-nums text-fg-muted">{product.costUnit != null ? formatMoneyArs(product.costUnit) : '—'}</span></div><div><span className="block text-xs text-fg-faint">Venta c/u (+{mk}%)</span><span className="font-mono font-medium tabular-nums text-brand">{product.saleUnit != null ? formatMoneyArs(product.saleUnit) : '—'}</span></div>{showInternal && <div><span className="block text-xs text-fg-faint">Costo bulto</span><span className="font-mono text-fg-muted">{product.costBulk != null ? formatMoneyArs(product.costBulk) : '—'}</span></div>}<div><span className="block text-xs text-fg-faint">U/bulto</span><span className="font-mono text-fg-muted">{product.unitsPerBoxNum ?? product.unitsPerBox ?? '—'}</span></div><div><span className="block text-xs text-fg-faint">EAN</span><span className="break-all font-mono text-fg-muted">{product.ean ?? '—'}</span></div></div>
                  {product.link && <div className="mt-3 flex justify-end border-t border-hair-soft pt-3"><a href={product.link} target="_blank" rel="noreferrer" className="text-sm text-brand">Abrir producto ↗</a></div>}
                </article>
              ))}
              {items.length === 0 && <p className="p-6 text-center text-sm text-fg-faint">Sin productos. Sincronizá el catálogo o ejecutá el runner con precios B2B.</p>}
            </div>
          </div>
        </>
      )}
    </Container>
  );
}
