'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';

type CatalogStats = { total: number; lastSyncedAt?: string | null };

type Hit = {
  ean: string;
  name: string;
  brand?: string | null;
  presentation?: string | null;
  priceMin?: number | null;
  score?: number;
};

type MatchStatus = 'matched' | 'weak' | 'closest' | 'unmatched';

type PreviewRow = {
  product: {
    id: string;
    name: string;
    brand?: string | null;
    barcode?: string | null;
    presentation?: string | null;
  };
  status: MatchStatus;
  best: Hit | null;
  candidates: Hit[];
  aiUsed?: boolean;
  queryUsed?: string;
};

type PreviewBatch = {
  rows: PreviewRow[];
  aiUsedCount: number;
  catalog: CatalogStats;
  tip?: string;
};

type CatalogProduct = {
  id: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
};

type SyncChunkResult = {
  done: boolean;
  upserted: number;
  nextCursor: string | null;
  total: number;
  lastSyncedAt?: string | null;
  category?: { name?: string | null };
  progress?: { catIndex: number; totalCats: number };
};

const BATCH_SIZE = 6;
const LIST_PAGE_SIZE = 40;

function money(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function previewErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'No se pudo buscar coincidencias.';
  if (/failed to fetch|networkerror|load failed|aborted|timeout/i.test(raw)) {
    return 'Se cortó la conexión. Probá de a pocos productos, o sin IA.';
  }
  return raw;
}

function statusMeta(status: MatchStatus) {
  switch (status) {
    case 'matched':
      return {
        label: 'Buena coincidencia',
        detail: 'Podés aplicar este EAN con confianza.',
        className: 'border-ok/30 bg-[var(--ok-soft)] text-ok',
      };
    case 'weak':
      return {
        label: 'Parecido — revisá',
        detail: 'Hay coincidencia dudosa. Confirmá el nombre/tamaño antes de aplicar.',
        className: 'border-warn/30 bg-[var(--warn-soft)] text-warn',
      };
    case 'closest':
      return {
        label: 'Lo más parecido',
        detail: 'No hubo match claro. Te mostramos lo más cercano: elegí a mano o rebuscá con otro texto.',
        className: 'border-hair bg-raised text-fg-muted',
      };
    default:
      return {
        label: 'Sin coincidencia',
        detail: 'No encontramos nada parecido. Cambiá el texto y tocá “Rebuscar”, o expandí el catálogo.',
        className: 'border-crit/25 bg-[var(--crit-soft,transparent)] text-crit',
      };
  }
}

export default function PreciosClarosPage() {
  const [stats, setStats] = useState<CatalogStats>({ total: 0 });
  const [useAi, setUseAi] = useState(false);
  const [useLive, setUseLive] = useState(true);
  const [setAsPrimary, setSetAsPrimary] = useState(true);

  const [listQ, setListQ] = useState('');
  const [listDebounced, setListDebounced] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [listItems, setListItems] = useState<CatalogProduct[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, CatalogProduct>>({});

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState('');
  const [syncCursor, setSyncCursor] = useState<string | null>(null);
  const [manualQ, setManualQ] = useState<Record<string, string>>({});
  const [manualBusy, setManualBusy] = useState<string>('');

  const pickedIds = useMemo(() => Object.keys(picked), [picked]);
  const pickedCount = pickedIds.length;
  const listPages = Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE));
  const selectedCount = Object.keys(selected).length;

  const summary = useMemo(() => {
    const matched = rows.filter((r) => r.status === 'matched').length;
    const weak = rows.filter((r) => r.status === 'weak').length;
    const closest = rows.filter((r) => r.status === 'closest').length;
    const none = rows.filter((r) => r.status === 'unmatched').length;
    return { matched, weak, closest, none };
  }, [rows]);

  const refreshStats = useCallback(async () => {
    try {
      const data = await api<CatalogStats>('/precios-claros/catalog/stats');
      setStats(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    const t = window.setTimeout(() => setListDebounced(listQ.trim()), 280);
    return () => window.clearTimeout(t);
  }, [listQ]);

  useEffect(() => {
    setListPage(1);
  }, [listDebounced]);

  const loadProductList = useCallback(async () => {
    setListBusy(true);
    try {
      const data = await api<{ items: CatalogProduct[]; total: number }>('/products/catalog', {
        params: {
          q: listDebounced || undefined,
          status: 'active',
          sort: 'name',
          dir: 'asc',
          page: String(listPage),
          pageSize: String(LIST_PAGE_SIZE),
        },
      });
      setListItems(data.items || []);
      setListTotal(data.total || 0);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo cargar el listado.');
    } finally {
      setListBusy(false);
    }
  }, [listDebounced, listPage]);

  useEffect(() => {
    void loadProductList();
  }, [loadProductList]);

  const togglePick = (item: CatalogProduct) => {
    setPicked((current) => {
      const next = { ...current };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return next;
    });
  };

  const mergePreviewRows = (incoming: PreviewRow[], replaceIds?: string[]) => {
    setRows((current) => {
      const byId = new Map(current.map((r) => [r.product.id, r]));
      if (replaceIds?.length) {
        for (const id of replaceIds) byId.delete(id);
      }
      for (const row of incoming) byId.set(row.product.id, row);
      return [...byId.values()];
    });
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of incoming) {
        if (row.status === 'matched' || row.status === 'weak') {
          if (row.best) next[row.product.id] = row.best.ean;
        } else {
          delete next[row.product.id];
        }
      }
      return next;
    });
    setManualQ((q) => {
      const next = { ...q };
      for (const row of incoming) {
        next[row.product.id] =
          q[row.product.id] ||
          row.queryUsed ||
          [row.product.brand, row.product.name].filter(Boolean).join(' ');
      }
      return next;
    });
  };

  const analyzeIds = async (
    ids: string[],
    opts?: { useLive?: boolean; useAi?: boolean; queryByProductId?: Record<string, string>; replace?: boolean },
  ) => {
    if (!ids.length) {
      setMsg('Seleccioná al menos un producto.');
      return;
    }
    setBusy('preview');
    setMsg('');
    setProgress('');
    if (opts?.replace !== false) {
      // Si analizamos un subconjunto (rebuscar uno), no borramos el resto.
      if (ids.length === pickedCount || !rows.length) {
        setRows([]);
        setSelected({});
      }
    }
    const live = opts?.useLive ?? useLive;
    const ai = opts?.useAi ?? useAi;
    const batchSize = ai || live || ids.length <= 3 ? Math.min(4, BATCH_SIZE) : BATCH_SIZE;
    const allRows: PreviewRow[] = [];
    let aiUsedCount = 0;

    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        setProgress(`Buscando ${i + 1}–${Math.min(i + chunk.length, ids.length)} de ${ids.length}…`);
        const body: Record<string, unknown> = {
          productIds: chunk,
          limit: chunk.length,
          useAi: ai,
          useLive: live,
          minScore: 0.45,
        };
        if (opts?.queryByProductId) {
          const subset: Record<string, string> = {};
          for (const id of chunk) {
            if (opts.queryByProductId[id]) subset[id] = opts.queryByProductId[id];
          }
          if (Object.keys(subset).length) body.queryByProductId = subset;
        }
        const data = await api<PreviewBatch>('/precios-claros/bulk/preview', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setStats(data.catalog);
        aiUsedCount += data.aiUsedCount || 0;
        allRows.push(...(data.rows || []));
        mergePreviewRows(data.rows || [], chunk);
      }
      setProgress('');
      const matched = allRows.filter((r) => r.status === 'matched').length;
      const weak = allRows.filter((r) => r.status === 'weak').length;
      const closest = allRows.filter((r) => r.status === 'closest').length;
      const none = allRows.filter((r) => r.status === 'unmatched').length;
      setMsg(
        `Listo: ${allRows.length} producto${allRows.length === 1 ? '' : 's'} · ${matched} buenas · ${weak} a revisar · ${closest} solo parecidas · ${none} sin nada${aiUsedCount ? ` · IA ${aiUsedCount}` : ''}.`,
      );
    } catch (err) {
      setProgress('');
      setMsg(previewErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const runPreview = () => void analyzeIds(pickedIds);

  const analyzeOne = (item: CatalogProduct) => {
    setPicked((c) => ({ ...c, [item.id]: item }));
    void analyzeIds([item.id], { useLive: true, replace: false });
  };

  const rebuscarOne = async (row: PreviewRow, withOnline = true) => {
    const q = (manualQ[row.product.id] || row.queryUsed || row.product.name).trim();
    if (q.length < 2) {
      setMsg('Escribí al menos 2 letras para rebuscar.');
      return;
    }
    setManualBusy(row.product.id);
    try {
      await analyzeIds([row.product.id], {
        useLive: withOnline || useLive,
        useAi,
        queryByProductId: { [row.product.id]: q },
        replace: false,
      });
      setMsg(`Rebuscar listo para “${row.product.name}” con: ${q}`);
    } finally {
      setManualBusy('');
    }
  };

  const seedCatalog = async () => {
    setBusy('seed');
    setMsg('');
    try {
      const data = await api<CatalogStats & { upserted: number; productsQueried: number }>(
        '/precios-claros/catalog/seed-business',
        { method: 'POST', body: JSON.stringify({ limit: 40 }) },
      );
      setStats({ total: data.total, lastSyncedAt: data.lastSyncedAt });
      setMsg(`Listo: cargamos ${data.total} códigos oficiales a partir de tus productos. Las próximas búsquedas van más rápido.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo armar el catálogo inicial.');
    } finally {
      setBusy('');
    }
  };

  const syncChunk = async () => {
    setBusy('sync');
    setMsg('');
    try {
      let cursor: string | null | undefined = syncCursor;
      let loops = 8;
      while (loops > 0) {
        loops -= 1;
        const data: SyncChunkResult = await api<SyncChunkResult>('/precios-claros/catalog/sync-chunk', {
          method: 'POST',
          body: JSON.stringify({ cursor }),
        });
        setStats({ total: data.total, lastSyncedAt: data.lastSyncedAt });
        setSyncCursor(data.nextCursor);
        cursor = data.nextCursor;
        setMsg(
          data.done
            ? `Catálogo completo · ${data.total} códigos oficiales.`
            : `Descarga en curso · ${data.total} códigos. Tocá de nuevo para seguir.`,
        );
        if (data.done || !data.nextCursor) break;
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falló la descarga del catálogo.');
    } finally {
      setBusy('');
    }
  };

  const applySelected = async () => {
    const items = rows
      .map((row) => {
        const ean = selected[row.product.id];
        if (!ean) return null;
        const hit = row.candidates.find((c) => c.ean === ean) || row.best;
        if (!hit) return null;
        return {
          productId: row.product.id,
          ean: hit.ean,
          name: hit.name,
          brand: hit.brand,
          presentation: hit.presentation,
        };
      })
      .filter(Boolean) as Array<{
      productId: string;
      ean: string;
      name?: string;
      brand?: string | null;
      presentation?: string | null;
    }>;
    if (!items.length) {
      alert('Marcá al menos un EAN en los resultados.');
      return;
    }
    if (
      !confirm(
        setAsPrimary
          ? `¿Usar el EAN oficial como código principal en ${items.length} producto(s)? El interno se guarda como alternativo.`
          : `¿Agregar EAN a ${items.length} producto(s) sin cambiar el principal?`,
      )
    ) {
      return;
    }
    setBusy('apply');
    try {
      const data = await api<{ applied: number; failed: number }>('/precios-claros/bulk/apply', {
        method: 'POST',
        body: JSON.stringify({ items, setAsPrimary }),
      });
      setMsg(`Aplicados ${data.applied}${data.failed ? ` · fallaron ${data.failed}` : ''}.`);
      const doneIds = new Set(items.map((item) => item.productId));
      setRows((current) => current.filter((row) => !doneIds.has(row.product.id)));
      setSelected({});
      setPicked((current) => {
        const next = { ...current };
        for (const id of doneIds) delete next[id];
        return next;
      });
      await refreshStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo aplicar');
    } finally {
      setBusy('');
    }
  };

  return (
    <Container className="space-y-6">
      <PageHeader
        title="Precios Claros"
        subtitle="Elegí productos → buscamos el EAN real → vos confirmás. Si no hay match claro, igual te mostramos lo más parecido."
      />

      {/* Catálogo */}
      <section className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Códigos oficiales guardados</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-fg">{stats.total}</p>
            <p className="mt-2 max-w-xl text-sm text-fg-muted">
              Acá guardamos EAN de Precios Claros para no consultar internet en cada búsqueda.
              Si está vacío igual funciona (busca online), pero más lento.
            </p>
            <p className="mt-1 text-xs text-fg-faint">
              {stats.total < 50
                ? 'Todavía hay pocos. Conviene armar el catálogo una vez.'
                : stats.lastSyncedAt
                  ? `Última actualización ${new Date(stats.lastSyncedAt).toLocaleString('es-AR')}`
                  : 'Listo para buscar'}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <button type="button" disabled={!!busy} onClick={() => void seedCatalog()} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg hover:bg-raised disabled:opacity-50">
              {busy === 'seed' ? 'Cargando…' : '1. Armar con mis productos'}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void syncChunk()} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg hover:bg-raised disabled:opacity-50">
              {busy === 'sync' ? 'Descargando…' : '2. Descargar más del listado oficial'}
            </button>
          </div>
        </div>
        <p className="text-xs text-fg-faint">
          <span className="font-medium text-fg-muted">Armar con mis productos:</span> busca en Precios Claros lo que ya tenés cargado y guarda esos EAN.
          {' '}
          <span className="font-medium text-fg-muted">Descargar más:</span> trae de a poco el listado oficial por rubros (tocá varias veces).
        </p>
      </section>

      {/* Paso 1 */}
      <section className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Paso 1</p>
            <h2 className="text-base font-semibold text-fg">Elegí productos</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Buscá por nombre o código. Podés analizar uno solo o varios.
            </p>
          </div>
          <button
            type="button"
            disabled={!pickedCount || !!busy}
            onClick={runPreview}
            className="btn-brand rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy === 'preview' ? 'Buscando…' : pickedCount ? `Buscar EAN (${pickedCount})` : 'Buscar EAN'}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1 text-sm text-fg-muted">
            Buscar en tu inventario
            <input
              value={listQ}
              onChange={(e) => setListQ(e.target.value)}
              placeholder="Ej. Coca, 7790…, Pepitos"
              className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-fg-muted">
            <input type="checkbox" checked={setAsPrimary} onChange={(e) => setSetAsPrimary(e.target.checked)} />
            EAN como código principal
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-fg-muted" title="Consulta Precios Claros en vivo (recomendado)">
            <input type="checkbox" checked={useLive} onChange={(e) => setUseLive(e.target.checked)} />
            Online (recomendado)
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-fg-muted" title="Más lento">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            IA
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-faint">
          <button
            type="button"
            disabled={!listItems.length || !!busy}
            onClick={() =>
              setPicked((c) => {
                const next = { ...c };
                for (const item of listItems) next[item.id] = item;
                return next;
              })
            }
            className="rounded-md border border-hair px-2.5 py-1 text-fg hover:bg-raised disabled:opacity-40"
          >
            Marcar página
          </button>
          <button
            type="button"
            disabled={!pickedCount || !!busy}
            onClick={() => setPicked({})}
            className="rounded-md border border-hair px-2.5 py-1 hover:bg-raised disabled:opacity-40"
          >
            Limpiar
          </button>
          <span>
            {listTotal} en total · {pickedCount} elegidos · pág. {listPage}/{listPages}
          </span>
        </div>

        {listBusy ? <Loader label="Cargando" /> : null}

        <ul className="max-h-[22rem] overflow-auto divide-y divide-hair-soft rounded-xl border border-hair-soft">
          {listItems.map((item) => {
            const checked = Boolean(picked[item.id]);
            return (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2 hover:bg-raised">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={checked} onChange={() => togglePick(item)} />
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">{item.name}</span>
                    <span className="block text-xs text-fg-faint">
                      {item.brand || 'Sin marca'}
                      {item.barcode ? ` · ${item.barcode}` : ' · sin código'}
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => analyzeOne(item)}
                  className="shrink-0 rounded-lg border border-[color:var(--brand-accent)] px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand-highlight disabled:opacity-50"
                >
                  Este
                </button>
              </li>
            );
          })}
          {!listBusy && !listItems.length ? (
            <li className="px-3 py-8 text-center text-sm text-fg-faint">Nada con ese filtro.</li>
          ) : null}
        </ul>

        {listPages > 1 ? (
          <div className="flex justify-center gap-2">
            <button type="button" disabled={listPage <= 1 || listBusy} onClick={() => setListPage((p) => p - 1)} className="rounded-lg border border-hair px-3 py-1.5 text-sm disabled:opacity-40">
              Anterior
            </button>
            <button type="button" disabled={listPage >= listPages || listBusy} onClick={() => setListPage((p) => p + 1)} className="rounded-lg border border-hair px-3 py-1.5 text-sm disabled:opacity-40">
              Siguiente
            </button>
          </div>
        ) : null}

        {progress || msg ? (
          <div className="space-y-1 rounded-lg border border-hair-soft bg-raised px-3 py-2">
            {progress ? <p className="text-sm font-medium text-fg">{progress}</p> : null}
            {msg ? <p className="text-sm text-fg-muted">{msg}</p> : null}
          </div>
        ) : null}
        {busy === 'preview' ? <Loader label={progress || 'Buscando en Precios Claros'} /> : null}
      </section>

      {/* Paso 2 */}
      {rows.length > 0 ? (
        <section className="space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Paso 2</p>
              <h2 className="text-base font-semibold text-fg">Resultados</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {summary.matched} buenas · {summary.weak} a revisar · {summary.closest} parecidas · {summary.none} sin nada.
                Elegí el EAN y aplicá.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy || !pickedCount}
                onClick={runPreview}
                className="rounded-lg border border-hair px-3 py-2 text-sm text-fg hover:bg-raised disabled:opacity-50"
              >
                Rebuscar todos
              </button>
              <button
                type="button"
                disabled={!!busy || !selectedCount}
                onClick={() => void applySelected()}
                className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy === 'apply' ? 'Aplicando…' : `Aplicar EAN (${selectedCount})`}
              </button>
            </div>
          </div>

          <ul className="space-y-4">
            {rows.map((row) => {
              const meta = statusMeta(row.status);
              const q = manualQ[row.product.id] ?? '';
              const isManualBusy = manualBusy === row.product.id;
              return (
                <li key={row.product.id} className="overflow-hidden rounded-xl border border-hair-soft">
                  <div className={`border-b px-3 py-2.5 sm:px-4 ${meta.className}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide">{meta.label}</p>
                        <p className="mt-0.5 text-sm opacity-90">{meta.detail}</p>
                      </div>
                      {row.best?.score != null ? (
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          {Math.round(row.best.score * 100)}% parecido
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3 bg-surface px-3 py-3 sm:px-4">
                    <div>
                      <Link href={`/productos/${row.product.id}`} className="font-semibold text-brand hover:underline">
                        {row.product.name}
                      </Link>
                      <p className="text-xs text-fg-faint">
                        {row.product.brand || 'Sin marca'}
                        {row.product.barcode ? ` · código actual ${row.product.barcode}` : ' · sin código'}
                        {row.queryUsed ? ` · buscó “${row.queryUsed}”` : ''}
                        {row.aiUsed ? ' · IA' : ''}
                      </p>
                    </div>

                    {row.candidates.length ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-fg-muted">
                          {row.status === 'closest' || row.status === 'unmatched'
                            ? 'Opciones más parecidas (elegí una si coincide):'
                            : 'Elegí el EAN:'}
                        </p>
                        {row.candidates.slice(0, 6).map((hit, idx) => (
                          <label
                            key={hit.ean}
                            className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                              selected[row.product.id] === hit.ean
                                ? 'border-[color:var(--brand-accent)] bg-brand-highlight'
                                : 'border-hair-soft bg-raised'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`pc-${row.product.id}`}
                              checked={selected[row.product.id] === hit.ean}
                              onChange={() => setSelected((s) => ({ ...s, [row.product.id]: hit.ean }))}
                              className="mt-1"
                            />
                            <span className="min-w-0">
                              <span className="font-medium text-fg">
                                {idx === 0 ? '★ ' : ''}
                                {hit.name}
                              </span>
                              <span className="mt-0.5 block font-mono text-[11px] text-fg-faint">
                                {hit.ean}
                                {hit.brand ? ` · ${hit.brand}` : ''}
                                {hit.presentation ? ` · ${hit.presentation}` : ''}
                                {hit.score != null ? ` · ${Math.round(hit.score * 100)}%` : ''}
                                {hit.priceMin != null ? ` · desde ${money(hit.priceMin)}` : ''}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-hair px-3 py-3 text-sm text-fg-muted">
                        No hubo ni siquiera un resultado parecido. Probá otro texto abajo (marca + producto + tamaño).
                      </p>
                    )}

                    <div className="rounded-lg border border-hair-soft bg-raised p-3 space-y-2">
                      <p className="text-xs font-medium text-fg-muted">Rebuscar con otro texto</p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={q}
                          onChange={(e) => setManualQ((m) => ({ ...m, [row.product.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void rebuscarOne(row, true);
                            }
                          }}
                          className="min-w-[12rem] flex-1 rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-fg"
                          placeholder="Ej. Coca Cola 2.25 litro"
                        />
                        <button
                          type="button"
                          disabled={!!busy || isManualBusy}
                          onClick={() => void rebuscarOne(row, true)}
                          className="rounded-lg border border-[color:var(--brand-accent)] px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-highlight disabled:opacity-50"
                        >
                          {isManualBusy || (busy === 'preview' && manualBusy === row.product.id) ? 'Buscando…' : 'Rebuscar'}
                        </button>
                        {selected[row.product.id] ? (
                          <button
                            type="button"
                            className="text-xs text-fg-faint hover:text-fg"
                            onClick={() =>
                              setSelected((s) => {
                                const next = { ...s };
                                delete next[row.product.id];
                                return next;
                              })
                            }
                          >
                            Quitar EAN marcado
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </Container>
  );
}
