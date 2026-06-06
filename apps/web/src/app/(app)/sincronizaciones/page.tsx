'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getApiBaseUrl } from '@/lib/api';
import { formatMoneyArs } from '@/lib/units';

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

type MappingInfo = {
  mapping: Record<string, string>;
  productFields: string[];
  syncedFields: string[];
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
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  barcode: 'Código de barras',
  brand: 'Marca',
  imageUrl: 'Imagen',
  unitsPerBox: 'Unidades por bulto',
  weight: 'Peso',
  format: 'Formato',
  flavor: 'Sabor',
  presentation: 'Presentación',
  subcategory: 'Subcategoría',
  supplierSku: 'SKU proveedor',
  externalId: 'ID externo',
  category: 'Categoría',
  cost: 'Costo',
  ean: 'EAN',
  listPrice: 'Precio lista',
  available: 'Disponible',
  stock: 'Stock',
  sku: 'SKU',
  link: 'Link',
};

export default function SincronizacionesPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [items, setItems] = useState<Synced[]>([]);
  const [q, setQ] = useState('');
  const [onlyWithCost, setOnlyWithCost] = useState(false);
  const [markup, setMarkup] = useState('40');
  const [mapInfo, setMapInfo] = useState<MappingInfo | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showInternal, setShowInternal] = useState(false);

  const conn = connections.find((c) => c.id === activeId) ?? connections[0] ?? null;
  const providerMeta = PROVIDERS[conn?.provider ?? ''] ?? {
    label: conn?.name ?? 'Proveedor',
    description: 'Sincronización de catálogo',
    accent: 'border-slate-600 bg-slate-800/40',
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
      if (!conns.some((x) => x.provider === 'mondelez')) {
        const created = await api<Connection>('/sync/connections', {
          method: 'POST',
          body: JSON.stringify({ provider: 'mondelez', name: 'Mondelez', priceMarkup: 40 }),
        });
        conns = [created, ...conns];
      }
      setConnections(conns);
      setActiveId((prev) => prev && conns.some((c) => c.id === prev) ? prev : conns[0]?.id ?? null);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConnDetails = useCallback(async () => {
    if (!conn) return;
    setMarkup(String(conn.priceMarkup ?? 40));
    try {
      const mi = await api<MappingInfo>(`/sync/connections/${conn.id}/mapping`);
      setMapInfo(mi);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    }
  }, [conn]);

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
    loadConnDetails();
  }, [loadConnDetails]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const withCost = items.filter((i) => i.costUnit != null).length;
  const linked = items.filter((i) => i.linkedProductId).length;
  const mk = Number(markup) || 0;

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

  const saveMarkup = async () => {
    if (!conn) return;
    setBusy('markup');
    try {
      await api(`/sync/connections/${conn.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priceMarkup: Number(markup) }),
      });
      setMsg({ type: 'ok', text: `Markup guardado: ${markup}%` });
      await loadConnections();
      await loadItems();
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const toggleAutoSync = async () => {
    if (!conn) return;
    setBusy('autosync');
    try {
      await api(`/sync/connections/${conn.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ autoSync: !conn.autoSync }),
      });
      await loadConnections();
      setMsg({ type: 'ok', text: conn.autoSync ? 'Auto-sync desactivado' : 'Auto-sync activado (catálogo diario en servidor)' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const saveMapping = async () => {
    if (!conn || !mapInfo) return;
    setBusy('mapping');
    try {
      await api(`/sync/connections/${conn.id}/mapping`, {
        method: 'PATCH',
        body: JSON.stringify({ mapping: mapInfo.mapping }),
      });
      setMsg({ type: 'ok', text: 'Mapeo guardado. La próxima importación usará estas columnas.' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-slate-400">Cargando sincronizaciones…</div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sincronizaciones</h1>
          <p className="text-sm text-slate-500 mt-1">
            Catálogo de proveedores → productos con precios <strong className="text-slate-400">unitarios</strong> en POS y listado.
            Los valores por bulto quedan solo como referencia interna.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm font-medium hover:bg-slate-800"
          >
            {showMap ? 'Ocultar mapeo' : 'Mapear columnas'}
          </button>
          <button
            type="button"
            onClick={() => run('run')}
            disabled={!!busy || !conn}
            className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
          >
            {busy === 'run' ? 'Sincronizando…' : 'Sync catálogo (servidor)'}
          </button>
          <button
            type="button"
            onClick={() => run('import')}
            disabled={!!busy || !conn}
            className="px-4 py-2 rounded-lg btn-brand text-sm font-medium disabled:opacity-50"
          >
            {busy === 'import' ? 'Importando…' : 'Importar a productos'}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-lg border text-sm px-4 py-3 ${
            msg.type === 'ok'
              ? 'bg-emerald-900/20 border-emerald-700/50 text-emerald-300'
              : 'bg-red-900/20 border-red-700/50 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Selector de proveedor (extensible) */}
      <div className="flex flex-wrap gap-2">
        {connections.map((c) => {
          const meta = PROVIDERS[c.provider] ?? { label: c.name, accent: 'border-slate-600' };
          const active = c.id === conn?.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                active
                  ? `${meta.accent ?? 'border-brand/50 bg-brand/10'} text-white border-brand/40`
                  : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
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
                <h2 className="text-lg font-semibold text-white">{providerMeta.label}</h2>
                <p className="text-sm text-slate-400">{providerMeta.description}</p>
                {conn.lastSyncAt && (
                  <p className="text-xs text-slate-500 mt-1">
                    Última sync: {new Date(conn.lastSyncAt).toLocaleString('es-AR')}
                    {conn.lastStatus ? ` · ${conn.lastStatus}` : ''}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={conn.autoSync}
                  onChange={toggleAutoSync}
                  disabled={busy === 'autosync'}
                  className="rounded border-slate-600"
                />
                Auto-sync catálogo diario (servidor)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-slate-500 text-xs">En catálogo</p>
              <p className="text-2xl font-bold text-white">{conn._count?.items ?? items.length}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-slate-500 text-xs">Con precio B2B</p>
              <p className="text-2xl font-bold text-emerald-400">{withCost}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-slate-500 text-xs">Vinculados a productos</p>
              <p className="text-2xl font-bold text-brand">{linked}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-slate-500 text-xs">Markup venta</p>
              <p className="text-2xl font-bold text-white">{mk}%</p>
            </div>
          </div>

          <div className="rounded-xl border border-violet-800/40 bg-violet-950/20 p-4 text-sm text-violet-200/90 space-y-2">
            <p className="font-medium text-violet-300">Precio real B2B (runner local)</p>
            <p>{providerMeta.runnerNote}</p>
            <p className="text-slate-400 text-xs">
              En <code className="text-slate-300">sync-runner/.env</code> configurá{' '}
              <code className="text-slate-300">SR_API={apiBase || 'https://stockrapido-api.vercel.app'}</code> (proyecto API en Vercel — ver DEPLOY.md).
              Ejecutá <code className="text-slate-300">python mondelez_sync_runner.py</code> en tu PC o agendalo con Task Scheduler.
            </p>
          </div>

          {showMap && mapInfo && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-semibold text-white">Mapeo de columnas → producto</h2>
                <button
                  type="button"
                  onClick={saveMapping}
                  disabled={!!busy}
                  className="px-3 py-1.5 rounded-lg btn-brand text-sm"
                >
                  Guardar mapeo
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {mapInfo.productFields.map((pf) => (
                  <div key={pf} className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-300 w-36 shrink-0 truncate" title={FIELD_LABELS[pf] || pf}>
                      {FIELD_LABELS[pf] || pf}
                    </span>
                    <span className="text-slate-600">←</span>
                    <select
                      value={mapInfo.mapping[pf] || ''}
                      onChange={(e) =>
                        setMapInfo({ ...mapInfo, mapping: { ...mapInfo.mapping, [pf]: e.target.value } })
                      }
                      className="flex-1 border border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-slate-900 text-slate-200"
                    >
                      <option value="">— (no completar)</option>
                      {mapInfo.syncedFields.map((sf) => (
                        <option key={sf} value={sf}>
                          {FIELD_LABELS[sf] || sf}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Markup de venta (%)</label>
              <div className="flex gap-2">
                <input
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  className="w-24 border border-slate-600 rounded-lg px-3 py-2 text-sm bg-slate-900 text-slate-100"
                  type="number"
                />
                <button
                  type="button"
                  onClick={saveMarkup}
                  disabled={!!busy}
                  className="px-3 py-2 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Guardar
                </button>
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-500 mb-1">Buscar</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, EAN o marca…"
                className="w-full border border-slate-600 rounded-lg px-3 py-2 text-sm bg-slate-900 text-slate-100 placeholder-slate-500"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-400 pb-2 cursor-pointer">
              <input type="checkbox" checked={onlyWithCost} onChange={(e) => setOnlyWithCost(e.target.checked)} />
              Solo con precio B2B ({withCost})
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-500 pb-2 cursor-pointer">
              <input type="checkbox" checked={showInternal} onChange={(e) => setShowInternal(e.target.checked)} />
              Ver costos por bulto (interno)
            </label>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/90 text-slate-400 text-left">
                  <tr>
                    <th className="p-3 w-12" />
                    <th className="p-3">Producto</th>
                    <th className="p-3">Marca</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3 text-right">Costo c/u</th>
                    <th className="p-3 text-right">Venta c/u (+{mk}%)</th>
                    {showInternal && <th className="p-3 text-right text-slate-600">Costo bulto</th>}
                    <th className="p-3 text-center">U/bulto</th>
                    <th className="p-3">EAN</th>
                    <th className="p-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/80">
                  {items.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="p-2">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="w-9 h-9 object-contain rounded bg-white/5" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-slate-800" />
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-slate-200 font-medium">{p.name ?? '—'}</span>
                        {p.linkedProductId && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-500/90">importado</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-400">{p.brand ?? '—'}</td>
                      <td className="p-3 text-slate-500 text-xs">{p.category ?? '—'}</td>
                      <td className="p-3 text-right text-slate-300">
                        {p.costUnit != null ? formatMoneyArs(p.costUnit) : '—'}
                      </td>
                      <td className="p-3 text-right font-medium text-brand">
                        {p.saleUnit != null ? formatMoneyArs(p.saleUnit) : '—'}
                      </td>
                      {showInternal && (
                        <td className="p-3 text-right text-slate-600 text-xs">
                          {p.costBulk != null ? formatMoneyArs(p.costBulk) : '—'}
                        </td>
                      )}
                      <td className="p-3 text-center text-violet-400/80 text-xs">
                        {p.unitsPerBoxNum ?? p.unitsPerBox ?? '—'}
                      </td>
                      <td className="p-3 text-slate-500 text-xs font-mono">{p.ean ?? '—'}</td>
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
                      <td colSpan={showInternal ? 10 : 9} className="p-8 text-center text-slate-500">
                        Sin productos. Sincronizá el catálogo o ejecutá el runner con precios B2B.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
