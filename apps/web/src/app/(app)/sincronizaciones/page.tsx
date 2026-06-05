'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Connection = {
  id: string;
  provider: string;
  name: string;
  priceMarkup: string | number;
  autoSync: boolean;
  lastSyncAt?: string | null;
  _count?: { items: number };
};

type Synced = Record<string, unknown> & { id: string };

type MappingInfo = {
  mapping: Record<string, string>;
  productFields: string[];
  syncedFields: string[];
};

// columnas del catálogo sincronizado (todas) con etiqueta
const SYNCED_COLS: { key: string; label: string }[] = [
  { key: 'imageUrl', label: 'Img' },
  { key: 'name', label: 'Nombre' },
  { key: 'ean', label: 'EAN' },
  { key: 'brand', label: 'Marca' },
  { key: 'category', label: 'Categoría' },
  { key: 'subcategory', label: 'Subcategoría' },
  { key: 'cost', label: 'Costo real' },
  { key: 'listPrice', label: 'P. lista' },
  { key: 'available', label: 'Disp.' },
  { key: 'stock', label: 'Stock' },
  { key: 'unitsPerBox', label: 'U/Bulto' },
  { key: 'weight', label: 'Peso' },
  { key: 'format', label: 'Formato' },
  { key: 'flavor', label: 'Sabor' },
  { key: 'presentation', label: 'Present.' },
  { key: 'sku', label: 'SKU' },
  { key: 'externalId', label: 'ID ext.' },
  { key: 'link', label: 'Link' },
];

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', barcode: 'Código de barras', brand: 'Marca', imageUrl: 'Imagen',
  unitsPerBox: 'Unidades por bulto', weight: 'Peso', format: 'Formato', flavor: 'Sabor',
  presentation: 'Presentación', subcategory: 'Subcategoría', supplierSku: 'SKU proveedor',
  externalId: 'ID externo', category: 'Categoría', cost: 'Costo',
  ean: 'EAN', listPrice: 'Precio lista', available: 'Disponible', stock: 'Stock',
  sku: 'SKU', link: 'Link',
};

function money(n?: unknown) {
  if (n == null) return '—';
  const v = Number(n);
  if (!isFinite(v) || v >= 1000000) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v);
}

export default function SincronizacionesPage() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [items, setItems] = useState<Synced[]>([]);
  const [q, setQ] = useState('');
  const [onlyWithCost, setOnlyWithCost] = useState(false);
  const [markup, setMarkup] = useState('40');
  const [mapInfo, setMapInfo] = useState<MappingInfo | null>(null);
  const [showMap, setShowMap] = useState(false);

  const loadConn = useCallback(async () => {
    setLoading(true);
    try {
      const conns = await api<Connection[]>('/sync/connections');
      let c = conns.find((x) => x.provider === 'mondelez') || conns[0] || null;
      if (!c) {
        c = await api<Connection>('/sync/connections', {
          method: 'POST',
          body: JSON.stringify({ provider: 'mondelez', name: 'Mondelez', priceMarkup: 40 }),
        });
      }
      setConn(c);
      setMarkup(String(c.priceMarkup ?? 40));
      const mi = await api<MappingInfo>(`/sync/connections/${c.id}/mapping`);
      setMapInfo(mi);
    } catch (e) {
      setMsg((e as Error).message);
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
      setMsg((e as Error).message);
    }
  }, [conn, q, onlyWithCost]);

  useEffect(() => { loadConn(); }, [loadConn]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const run = async (kind: 'run' | 'import') => {
    if (!conn) return;
    setBusy(kind); setMsg(null);
    try {
      if (kind === 'run') {
        const r = await api<{ itemsUpserted: number }>(`/sync/connections/${conn.id}/run`, { method: 'POST' });
        setMsg(`Catálogo sincronizado: ${r.itemsUpserted} productos.`);
      } else {
        const r = await api<{ created: number; updated: number; skipped: number }>(
          `/sync/connections/${conn.id}/import`,
          { method: 'POST', body: JSON.stringify({ onlyWithCost: true }) },
        );
        setMsg(`Importados: ${r.created} nuevos, ${r.updated} actualizados, ${r.skipped} omitidos.`);
      }
      await loadConn(); await loadItems();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };

  const saveMarkup = async () => {
    if (!conn) return;
    setBusy('markup');
    try {
      await api(`/sync/connections/${conn.id}`, { method: 'PATCH', body: JSON.stringify({ priceMarkup: Number(markup) }) });
      setMsg(`Markup guardado: ${markup}%`); await loadConn();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };

  const saveMapping = async () => {
    if (!conn || !mapInfo) return;
    setBusy('mapping');
    try {
      await api(`/sync/connections/${conn.id}/mapping`, { method: 'PATCH', body: JSON.stringify({ mapping: mapInfo.mapping }) });
      setMsg('Mapeo guardado. La próxima importación usará estas columnas.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };

  const mk = Number(markup) || 0;
  const withCost = items.filter((i) => i.cost != null && Number(i.cost) < 1000000).length;

  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sincronizaciones</h1>
          <p className="text-sm text-gray-500">
            {conn?.name} · {conn?._count?.items ?? items.length} productos ·{' '}
            {conn?.lastSyncAt ? `última: ${new Date(conn.lastSyncAt).toLocaleString('es-AR')}` : 'sin sincronizar'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowMap((v) => !v)} className="px-4 py-2 rounded-lg border text-sm font-medium">
            {showMap ? 'Ocultar mapeo' : 'Mapear columnas'}
          </button>
          <button onClick={() => run('run')} disabled={!!busy} className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium disabled:opacity-50">
            {busy === 'run' ? 'Sincronizando…' : 'Sincronizar catálogo'}
          </button>
          <button onClick={() => run('import')} disabled={!!busy} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">
            {busy === 'import' ? 'Importando…' : 'Importar a mis productos'}
          </button>
        </div>
      </div>

      {msg && <div className="rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-2">{msg}</div>}

      <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
        💡 El <b>precio real</b> (tu precio B2B) lo trae el <b>runner</b> con tu login de Mondelez. El mapeo de abajo decide
        qué columna del catálogo va a cada campo de tus productos al importar.
      </div>

      {/* Editor de mapeo */}
      {showMap && mapInfo && (
        <div className="rounded-lg border p-4 space-y-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Mapeo de columnas (Mondelez → tu producto)</h2>
            <button onClick={saveMapping} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-sm">
              Guardar mapeo
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mapInfo.productFields.map((pf) => (
              <div key={pf} className="flex items-center gap-2">
                <span className="text-sm font-medium w-40 shrink-0">{FIELD_LABELS[pf] || pf}</span>
                <span className="text-gray-400">←</span>
                <select
                  value={mapInfo.mapping[pf] || ''}
                  onChange={(e) => setMapInfo({ ...mapInfo, mapping: { ...mapInfo.mapping, [pf]: e.target.value } })}
                  className="flex-1 border rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">— (no completar)</option>
                  {mapInfo.syncedFields.map((sf) => (
                    <option key={sf} value={sf}>{FIELD_LABELS[sf] || sf}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Markup de venta (%)</label>
          <div className="flex gap-2">
            <input value={markup} onChange={(e) => setMarkup(e.target.value)} className="w-24 border rounded-lg px-3 py-2 text-sm" type="number" />
            <button onClick={saveMarkup} disabled={!!busy} className="px-3 py-2 rounded-lg border text-sm">Guardar</button>
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Buscar</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, EAN o marca…" className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={onlyWithCost} onChange={(e) => setOnlyWithCost(e.target.checked)} />
          Solo con precio real ({withCost})
        </label>
      </div>

      {/* Tabla con TODAS las columnas */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="text-xs whitespace-nowrap">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              {SYNCED_COLS.map((c) => <th key={c.key} className="p-2">{c.label}</th>)}
              <th className="p-2 text-right">Venta (+{mk}%)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const cost = p.cost != null && Number(p.cost) < 1000000 ? Number(p.cost) : null;
              const sale = cost != null ? cost * (1 + mk / 100) : null;
              return (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  {SYNCED_COLS.map((c) => {
                    const v = p[c.key];
                    if (c.key === 'imageUrl')
                      return <td key={c.key} className="p-1">{v ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={String(v)} alt="" className="w-8 h-8 object-contain rounded" />
                      ) : <div className="w-8 h-8 bg-gray-100 rounded" />}</td>;
                    if (c.key === 'cost' || c.key === 'listPrice')
                      return <td key={c.key} className="p-2 text-right">{money(v)}</td>;
                    if (c.key === 'available')
                      return <td key={c.key} className="p-2">{v ? '✓' : '—'}</td>;
                    if (c.key === 'link')
                      return <td key={c.key} className="p-2">{v ? <a href={String(v)} target="_blank" rel="noreferrer" className="text-blue-600 underline">ver</a> : '—'}</td>;
                    return <td key={c.key} className={`p-2 ${c.key === 'name' ? 'font-medium' : 'text-gray-600'}`}>{v != null && v !== '' ? String(v) : '—'}</td>;
                  })}
                  <td className="p-2 text-right font-medium">{sale != null ? money(sale) : '—'}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={SYNCED_COLS.length + 1} className="p-6 text-center text-gray-400">Sin productos. Tocá “Sincronizar catálogo”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
