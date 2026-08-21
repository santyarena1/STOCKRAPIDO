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

type PreviewRow = {
  product: {
    id: string;
    name: string;
    brand?: string | null;
    barcode?: string | null;
    presentation?: string | null;
  };
  status: 'matched' | 'weak' | 'unmatched';
  best: Hit | null;
  candidates: Hit[];
  aiUsed?: boolean;
};

type PreviewBatch = {
  rows: PreviewRow[];
  aiUsedCount: number;
  catalog: CatalogStats;
  totalMatching: number;
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

/** Lotes chicos: con online/IA un request grande = Failed to fetch. */
const BATCH_SIZE = 6;
const LIST_PAGE_SIZE = 40;

function money(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function previewErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'No se pudo buscar coincidencias.';
  if (/failed to fetch|networkerror|load failed|aborted|timeout/i.test(raw)) {
    return 'Se cortó la conexión (timeout). Analizá menos productos por vez, o desactivá “Consultar online” / IA. Con catálogo local va mucho más rápido.';
  }
  return raw;
}

export default function PreciosClarosPage() {
  const [stats, setStats] = useState<CatalogStats>({ total: 0 });
  const [useAi, setUseAi] = useState(false);
  const [useLive, setUseLive] = useState(false);
  const [setAsPrimary, setSetAsPrimary] = useState(true);

  const [listQ, setListQ] = useState('');
  const [listDebounced, setListDebounced] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [listItems, setListItems] = useState<CatalogProduct[]>([]);
  const [listBusy, setListBusy] = useState(false);
  /** IDs elegidos para analizar. */
  const [picked, setPicked] = useState<Record<string, CatalogProduct>>({});

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState('');
  const [syncCursor, setSyncCursor] = useState<string | null>(null);
  const [manualQ, setManualQ] = useState('');
  const [manualHits, setManualHits] = useState<Hit[]>([]);
  const [manualFor, setManualFor] = useState<string | null>(null);

  const pickedIds = useMemo(() => Object.keys(picked), [picked]);
  const pickedCount = pickedIds.length;
  const listPages = Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE));
  const allVisibleSelected =
    listItems.length > 0 && listItems.every((item) => Boolean(picked[item.id]));

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

  const selectVisible = () => {
    setPicked((current) => {
      const next = { ...current };
      for (const item of listItems) next[item.id] = item;
      return next;
    });
  };

  const clearVisible = () => {
    setPicked((current) => {
      const next = { ...current };
      for (const item of listItems) delete next[item.id];
      return next;
    });
  };

  const clearAllPicked = () => setPicked({});

  const seedCatalog = async () => {
    setBusy('seed');
    setMsg('');
    try {
      const data = await api<CatalogStats & { upserted: number; productsQueried: number }>(
        '/precios-claros/catalog/seed-business',
        { method: 'POST', body: JSON.stringify({ limit: 40 }) },
      );
      setStats({ total: data.total, lastSyncedAt: data.lastSyncedAt });
      setMsg(`Semilla: ${data.productsQueried} productos consultados · catálogo ${data.total} EAN.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo sembrar el catálogo.');
    } finally {
      setBusy('');
    }
  };

  const syncChunk = async (continuous = false) => {
    setBusy('sync');
    setMsg('');
    try {
      let cursor: string | null | undefined = syncCursor;
      let loops = continuous ? 8 : 1;
      let lastTotal = stats.total;
      while (loops > 0) {
        loops -= 1;
        const data: SyncChunkResult = await api<SyncChunkResult>('/precios-claros/catalog/sync-chunk', {
          method: 'POST',
          body: JSON.stringify({ cursor }),
        });
        lastTotal = data.total;
        setStats({ total: data.total, lastSyncedAt: data.lastSyncedAt });
        setSyncCursor(data.nextCursor);
        cursor = data.nextCursor;
        setMsg(
          data.done
            ? `Catálogo completo · ${data.total} EAN únicos.`
            : `Barrido ${data.progress ? `${data.progress.catIndex + 1}/${data.progress.totalCats}` : ''} ${data.category?.name || ''} · +${data.upserted} · total ${data.total}. Seguí tocando “Seguir barrido”.`,
        );
        if (data.done || !data.nextCursor) break;
      }
      if (lastTotal) setStats((s) => ({ ...s, total: lastTotal }));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Falló el barrido del catálogo.');
    } finally {
      setBusy('');
    }
  };

  const runPreview = async () => {
    if (!pickedCount) {
      setMsg('Seleccioná al menos un producto de la lista.');
      return;
    }
    setBusy('preview');
    setMsg('');
    setProgress('');
    setRows([]);
    setSelected({});
    const ids = [...pickedIds];
    const allRows: PreviewRow[] = [];
    let aiUsedCount = 0;
    const batchSize = useAi || useLive ? 4 : BATCH_SIZE;

    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        setProgress(`Analizando ${i + 1}–${Math.min(i + chunk.length, ids.length)} de ${ids.length}…`);
        const data = await api<PreviewBatch>('/precios-claros/bulk/preview', {
          method: 'POST',
          body: JSON.stringify({
            productIds: chunk,
            limit: chunk.length,
            useAi,
            useLive,
            minScore: 0.45,
          }),
        });
        setStats(data.catalog);
        aiUsedCount += data.aiUsedCount || 0;
        allRows.push(...(data.rows || []));
        setRows([...allRows]);
      }

      const next: Record<string, string> = {};
      for (const row of allRows) {
        if (row.best && (row.status === 'matched' || row.status === 'weak')) {
          next[row.product.id] = row.best.ean;
        }
      }
      setSelected(next);
      setProgress('');
      setMsg(
        `${allRows.length} analizados · ${allRows.filter((r) => r.status === 'matched').length} fuertes · ${allRows.filter((r) => r.status === 'weak').length} dudosos · ${allRows.filter((r) => r.status === 'unmatched').length} sin match${aiUsedCount ? ` · IA en ${aiUsedCount}` : ''}. Lotes de ${batchSize}.`,
      );
    } catch (err) {
      setProgress('');
      if (allRows.length) {
        setRows(allRows);
        const next: Record<string, string> = {};
        for (const row of allRows) {
          if (row.best && (row.status === 'matched' || row.status === 'weak')) {
            next[row.product.id] = row.best.ean;
          }
        }
        setSelected(next);
        setMsg(`${previewErrorMessage(err)} Se guardaron ${allRows.length} resultados parciales.`);
      } else {
        setMsg(previewErrorMessage(err));
      }
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
      alert('Elegí al menos una coincidencia.');
      return;
    }
    if (
      !confirm(
        setAsPrimary
          ? `¿Poner el EAN oficial como código principal en ${items.length} producto(s)? El código interno/importado se conserva en códigos alternativos.`
          : `¿Agregar EAN a ${items.length} producto(s) sin cambiar el código principal?`,
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
      setMsg(
        setAsPrimary
          ? `Aplicados ${data.applied}: EAN oficial como principal${data.failed ? ` · fallaron ${data.failed}` : ''}.`
          : `Aplicados ${data.applied}${data.failed ? ` · fallaron ${data.failed}` : ''}.`,
      );
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

  const searchManual = async (productId: string) => {
    setManualFor(productId);
    setManualHits([]);
    if (manualQ.trim().length < 2) return;
    try {
      const data = await api<{ items: Hit[] }>(`/precios-claros/search?q=${encodeURIComponent(manualQ.trim())}`);
      setManualHits(data.items || []);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Búsqueda falló');
    }
  };

  const statusLabel = (s: PreviewRow['status']) =>
    s === 'matched' ? 'Buena' : s === 'weak' ? 'Dudosa' : 'Sin match';

  return (
    <Container className="space-y-6">
      <PageHeader
        title="Precios Claros"
        subtitle="Elegí uno o varios productos, buscá el EAN real del envase y al aplicar queda como código principal (el interno se guarda como alternativo)."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-hair-soft bg-surface p-4">
          <p className="text-xs text-fg-muted">EAN en catálogo local</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-fg">{stats.total}</p>
          <p className="mt-1 text-[11px] text-fg-faint">
            {stats.lastSyncedAt ? `Última sync ${new Date(stats.lastSyncedAt).toLocaleString('es-AR')}` : 'Todavía vacío'}
          </p>
        </div>
        <div className="rounded-xl border border-hair-soft bg-surface p-4 sm:col-span-2 space-y-3">
          <p className="text-sm text-fg-muted">
            Sembrá/barré el catálogo una vez. Después el match usa esa base (rápido). “Online” e IA son opcionales y más lentos.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => void seedCatalog()} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg hover:bg-raised disabled:opacity-50">
              {busy === 'seed' ? 'Sembrando…' : '1. Sembrar desde mi negocio'}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void syncChunk(true)} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg hover:bg-raised disabled:opacity-50">
              {busy === 'sync' ? 'Barriendo…' : syncCursor ? '2. Seguir barrido categorías' : '2. Empezar barrido categorías'}
            </button>
            <a
              href="https://datos.produccion.gob.ar/dataset/sepa-precios"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted hover:text-fg"
            >
              Dataset oficial SEPA ↗
            </a>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">Elegir productos</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Buscá, marcá uno o varios, y analizá solo esos. {pickedCount ? `${pickedCount} seleccionados.` : 'Ninguno seleccionado.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!pickedCount || !!busy} onClick={clearAllPicked} className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted hover:text-fg disabled:opacity-40">
              Limpiar selección
            </button>
            <button
              type="button"
              disabled={!pickedCount || !!busy}
              onClick={() => void runPreview()}
              className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy === 'preview' ? 'Analizando…' : `Analizar seleccionados (${pickedCount})`}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1 text-sm text-fg-muted">
            Buscar
            <input
              value={listQ}
              onChange={(e) => setListQ(e.target.value)}
              placeholder="Nombre, marca o código…"
              className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={setAsPrimary} onChange={(e) => setSetAsPrimary(e.target.checked)} />
            EAN oficial como código principal
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={useLive} onChange={(e) => setUseLive(e.target.checked)} />
            Consultar online
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            Ayuda con IA
          </label>
        </div>
        <p className="text-[11px] text-fg-faint">
          Online e IA pueden volver a tirar timeout si marcás muchos. Con catálogo local y lotes de {BATCH_SIZE} (o 4 si activás online/IA) suele ir bien.
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!listItems.length || !!busy} onClick={selectVisible} className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg hover:bg-raised disabled:opacity-40">
            Seleccionar página
          </button>
          <button type="button" disabled={!allVisibleSelected || !!busy} onClick={clearVisible} className="rounded-lg border border-hair px-3 py-1.5 text-sm text-fg-muted hover:text-fg disabled:opacity-40">
            Quitar página
          </button>
          <span className="self-center text-xs text-fg-faint">
            {listTotal} productos · pág. {listPage}/{listPages}
          </span>
        </div>

        {listBusy ? <Loader label="Cargando productos" /> : null}

        <ul className="max-h-[28rem] overflow-auto divide-y divide-hair-soft rounded-xl border border-hair-soft">
          {listItems.map((item) => {
            const checked = Boolean(picked[item.id]);
            return (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-raised">
                  <input type="checkbox" className="mt-1" checked={checked} onChange={() => togglePick(item)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">{item.name}</span>
                    <span className="block text-xs text-fg-faint">
                      {item.brand || 'Sin marca'}
                      {item.barcode ? ` · ${item.barcode}` : ' · sin código'}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {!listBusy && !listItems.length ? (
            <li className="px-3 py-6 text-center text-sm text-fg-faint">No hay productos con ese filtro.</li>
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

        {pickedCount > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {Object.values(picked)
              .slice(0, 12)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => togglePick(item)}
                  className="rounded-md border border-hair bg-raised px-2 py-1 text-xs text-fg-muted hover:text-crit"
                  title="Quitar"
                >
                  {item.name.length > 28 ? `${item.name.slice(0, 28)}…` : item.name} ×
                </button>
              ))}
            {pickedCount > 12 ? <span className="self-center text-xs text-fg-faint">+{pickedCount - 12} más</span> : null}
          </div>
        ) : null}

        {progress ? <p className="text-sm font-medium text-fg">{progress}</p> : null}
        {msg ? <p className="text-sm text-fg-muted">{msg}</p> : null}
        {busy === 'preview' ? <Loader label={progress || 'Match Precios Claros'} /> : null}

        {rows.length > 0 ? (
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-fg">Resultados</h3>
              <button
                type="button"
                disabled={!!busy || !Object.keys(selected).length}
                onClick={() => void applySelected()}
                className="rounded-lg border border-hair px-4 py-2 text-sm font-semibold text-fg hover:bg-raised disabled:opacity-50"
              >
                {busy === 'apply' ? 'Aplicando…' : `Aplicar seleccionados (${Object.keys(selected).length})`}
              </button>
            </div>
            <ul className="divide-y divide-hair-soft overflow-hidden rounded-xl border border-hair-soft">
              {rows.map((row) => (
                <li key={row.product.id} className="space-y-2 bg-surface px-3 py-3 sm:px-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/productos/${row.product.id}`} className="font-semibold text-brand hover:underline">
                        {row.product.name}
                      </Link>
                      <p className="text-xs text-fg-faint">
                        {row.product.brand || 'Sin marca'}
                        {row.product.barcode ? ` · actual ${row.product.barcode}` : ' · sin barcode'}
                        {row.aiUsed ? ' · IA' : ''}
                      </p>
                    </div>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase ${
                        row.status === 'matched'
                          ? 'border-ok/30 bg-[var(--ok-soft)] text-ok'
                          : row.status === 'weak'
                            ? 'border-warn/30 bg-[var(--warn-soft)] text-warn'
                            : 'border-hair text-fg-faint'
                      }`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </div>

                  {row.candidates.length ? (
                    <div className="flex flex-col gap-1.5">
                      {row.candidates.slice(0, 5).map((hit) => (
                        <label key={hit.ean} className="flex cursor-pointer items-start gap-2 rounded-lg border border-hair-soft bg-raised px-2.5 py-2 text-sm">
                          <input
                            type="radio"
                            name={`pc-${row.product.id}`}
                            checked={selected[row.product.id] === hit.ean}
                            onChange={() => setSelected((s) => ({ ...s, [row.product.id]: hit.ean }))}
                            className="mt-1"
                          />
                          <span className="min-w-0">
                            <span className="font-medium text-fg">{hit.name}</span>
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
                    <p className="text-sm text-fg-faint">Sin candidatos. Probá búsqueda manual o expandí el catálogo.</p>
                  )}

                  <div className="flex flex-wrap items-end gap-2 pt-1">
                    <button
                      type="button"
                      className="text-xs text-fg-muted hover:text-fg"
                      onClick={() => {
                        setManualFor(row.product.id);
                        setManualQ([row.product.brand, row.product.name].filter(Boolean).join(' '));
                        setManualHits([]);
                      }}
                    >
                      Buscar a mano…
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
                        Quitar selección
                      </button>
                    ) : null}
                  </div>

                  {manualFor === row.product.id ? (
                    <div className="rounded-lg border border-hair bg-raised p-3 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={manualQ}
                          onChange={(e) => setManualQ(e.target.value)}
                          className="min-w-[12rem] flex-1 rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-fg"
                          placeholder="Ej. Coca Cola 2.25"
                        />
                        <button type="button" onClick={() => void searchManual(row.product.id)} className="rounded-lg border border-hair px-3 py-2 text-sm text-fg hover:bg-surface">
                          Buscar
                        </button>
                      </div>
                      {manualHits.map((hit) => (
                        <button
                          key={hit.ean}
                          type="button"
                          onClick={() => {
                            setSelected((s) => ({ ...s, [row.product.id]: hit.ean }));
                            setRows((current) =>
                              current.map((r) =>
                                r.product.id === row.product.id
                                  ? {
                                      ...r,
                                      best: hit,
                                      candidates: [hit, ...r.candidates.filter((c) => c.ean !== hit.ean)],
                                      status: 'matched',
                                    }
                                  : r,
                              ),
                            );
                            setManualFor(null);
                          }}
                          className="block w-full rounded-lg border border-hair-soft bg-surface px-3 py-2 text-left text-sm hover:bg-raised2"
                        >
                          <span className="font-medium text-fg">{hit.name}</span>
                          <span className="mt-0.5 block font-mono text-[11px] text-fg-faint">{hit.ean}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </Container>
  );
}
