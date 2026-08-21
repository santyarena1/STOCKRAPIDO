'use client';

import { useCallback, useEffect, useState } from 'react';
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

type SyncChunkResult = {
  done: boolean;
  upserted: number;
  nextCursor: string | null;
  total: number;
  lastSyncedAt?: string | null;
  category?: { name?: string | null };
  progress?: { catIndex: number; totalCats: number };
};

function money(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

export default function PreciosClarosPage() {
  const [stats, setStats] = useState<CatalogStats>({ total: 0 });
  const [useAi, setUseAi] = useState(true);
  const [onlyWithoutBarcode, setOnlyWithoutBarcode] = useState(true);
  const [limit, setLimit] = useState(25);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [syncCursor, setSyncCursor] = useState<string | null>(null);
  const [manualQ, setManualQ] = useState('');
  const [manualHits, setManualHits] = useState<Hit[]>([]);
  const [manualFor, setManualFor] = useState<string | null>(null);

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
    setBusy('preview');
    setMsg('');
    setRows([]);
    setSelected({});
    try {
      const data = await api<{ rows: PreviewRow[]; aiUsedCount: number; catalog: CatalogStats; tip?: string }>(
        '/precios-claros/bulk/preview',
        {
          method: 'POST',
          body: JSON.stringify({ onlyWithoutBarcode, limit, useAi, minScore: 0.45 }),
        },
      );
      setRows(data.rows);
      setStats(data.catalog);
      const next: Record<string, string> = {};
      for (const row of data.rows) {
        if (row.best && (row.status === 'matched' || row.status === 'weak')) {
          next[row.product.id] = row.best.ean;
        }
      }
      setSelected(next);
      setMsg(
        `${data.rows.length} productos · ${data.rows.filter((r) => r.status === 'matched').length} fuertes · ${data.rows.filter((r) => r.status === 'weak').length} dudosos · ${data.rows.filter((r) => r.status === 'unmatched').length} sin match${data.aiUsedCount ? ` · IA en ${data.aiUsedCount}` : ''}.`,
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo buscar coincidencias.');
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
    if (!confirm(`¿Aplicar EAN a ${items.length} producto(s)? El código actual se mantiene si ya había uno.`)) return;
    setBusy('apply');
    try {
      const data = await api<{ applied: number; failed: number }>('/precios-claros/bulk/apply', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      setMsg(`Aplicados ${data.applied}${data.failed ? ` · fallaron ${data.failed}` : ''}.`);
      await runPreview();
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
        subtitle="Match masivo de nombres/EAN contra el catálogo SEPA. La IA ayuda cuando el nombre no pega. El EAN se suma sin pisar el código actual."
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
            No bajamos el zip diario entero (~12M filas) al servidor: es demasiado grande. En cambio:
            (1) sembramos con tus productos, (2) barreemos categorías de Precios Claros al catálogo local,
            (3) la IA sugiere búsquedas cuando no hay coincidencia.
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
        <h2 className="text-base font-semibold text-fg">Buscar coincidencias masivas</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={onlyWithoutBarcode} onChange={(e) => setOnlyWithoutBarcode(e.target.checked)} />
            Solo sin código de barras
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            Ayuda con IA (reordena + sugiere búsquedas)
          </label>
          <label className="text-sm text-fg-muted">
            Lote
            <input
              type="number"
              min={5}
              max={60}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 25)}
              className="ml-2 w-20 rounded-lg border border-hair bg-raised px-2 py-1.5 font-mono text-fg"
            />
          </label>
          <button type="button" disabled={!!busy} onClick={() => void runPreview()} className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy === 'preview' ? 'Buscando…' : 'Buscar coincidencias'}
          </button>
          <button type="button" disabled={!!busy || !Object.keys(selected).length} onClick={() => void applySelected()} className="rounded-lg border border-hair px-4 py-2 text-sm font-semibold text-fg hover:bg-raised disabled:opacity-50">
            {busy === 'apply' ? 'Aplicando…' : `Aplicar seleccionados (${Object.keys(selected).length})`}
          </button>
        </div>
        {msg ? <p className="text-sm text-fg-muted">{msg}</p> : null}
        {busy === 'preview' ? <Loader label="Match Precios Claros" /> : null}

        {rows.length > 0 ? (
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
                  <p className="text-sm text-fg-faint">Sin candidatos. Probá búsqueda manual abajo o expandí el catálogo.</p>
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
        ) : null}
      </section>
    </Container>
  );
}
