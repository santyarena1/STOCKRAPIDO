'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type CatalogHit = {
  id: string;
  name: string;
  barcode?: string | null;
  imageUrl?: string | null;
  brand?: string | null;
  category?: string | null;
  score?: number;
};

type LocalHit = {
  id: string;
  name: string;
  barcode?: string | null;
  imageUrl?: string | null;
  brand?: string | null;
  price?: number;
  stock?: number;
  score?: number;
};

type PreviewRow = {
  row: number;
  name: string;
  price: number;
  stock: number;
  cost?: number;
  suggestedAction: 'update_local' | 'link_catalog' | 'create_new';
  suggestedLocal: LocalHit | null;
  suggestedCatalog: CatalogHit | null;
  localAlternatives: LocalHit[];
  catalogAlternatives: CatalogHit[];
};

type Decision = {
  action: 'approve' | 'reject';
  mode: 'update_local' | 'link_catalog' | 'create_new';
  localProductId?: string;
  publicProductId?: string;
  local?: LocalHit | null;
  catalog?: CatalogHit | null;
};

type ConfirmResult = {
  created: number;
  updated?: number;
  matchedFromCatalog?: number;
  skipped: number;
  rejected?: number;
  errors: Array<{ row: number; message: string }>;
  matches?: Array<{ row: number; pasted: string; catalog: string; barcode?: string }>;
  ids: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: ConfirmResult) => void;
};

const EXAMPLE = `producto;cantidad;precio
Coca Cola 500ml;24;1500
Alfajor Havanna;50;800`;

function money(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function Thumb({ src, name }: { src?: string | null; name: string }) {
  if (src) {
    return <img src={src} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-hair-soft bg-white object-contain" />;
  }
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-hair-soft bg-raised2 text-xs font-bold text-fg-muted">
      {name.trim().slice(0, 2).toUpperCase() || '?'}
    </span>
  );
}

function defaultDecision(row: PreviewRow): Decision {
  if (row.suggestedAction === 'update_local' && row.suggestedLocal) {
    return {
      action: 'approve',
      mode: 'update_local',
      localProductId: row.suggestedLocal.id,
      local: row.suggestedLocal,
      catalog: null,
    };
  }
  if (row.suggestedAction === 'link_catalog' && row.suggestedCatalog) {
    return {
      action: 'approve',
      mode: 'link_catalog',
      publicProductId: row.suggestedCatalog.id,
      catalog: row.suggestedCatalog,
      local: null,
    };
  }
  return { action: 'approve', mode: 'create_new', local: null, catalog: null };
}

export function BulkCreateProductsModal({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<'paste' | 'review' | 'done'>('paste');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<'preview' | 'direct' | 'confirm' | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [searchRow, setSearchRow] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHits, setSearchHits] = useState<{ local: LocalHit[]; catalog: CatalogHit[] }>({ local: [], catalog: [] });
  const fileRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('paste');
      setText('');
      setRows([]);
      setDecisions({});
      setResult(null);
      setSearchRow(null);
      setParseErrors([]);
    }
  }, [open]);

  useEffect(() => {
    if (searchRow == null) return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      void runSearch(searchQ);
    }, 280);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [searchQ, searchRow]);

  if (!open) return null;

  const runSearch = async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setSearchHits({ local: [], catalog: [] });
      return;
    }
    setSearchBusy(true);
    try {
      const res = await api<{ local: LocalHit[]; catalog: CatalogHit[] }>('/products/bulk-create/search', {
        params: { q: q.trim() },
      });
      setSearchHits(res);
    } catch {
      setSearchHits({ local: [], catalog: [] });
    } finally {
      setSearchBusy(false);
    }
  };

  const loadPreview = async () => {
    if (!text.trim()) {
      alert('Pegá la lista: producto, cantidad y precio.');
      return;
    }
    setBusy(true);
    setBusyMode('preview');
    try {
      const res = await api<{ rows: PreviewRow[]; parseErrors: Array<{ row: number; message: string }> }>(
        '/products/bulk-create/preview',
        { method: 'POST', body: JSON.stringify({ text }) },
      );
      setRows(res.rows);
      setParseErrors(res.parseErrors || []);
      setDecisions(Object.fromEntries(res.rows.map((r) => [r.row, defaultDecision(r)])));
      setStep('review');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo armar la revisión');
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  };

  /** Sube todo de una, sin pantalla de revisión (usa matches automáticos). */
  const uploadDirect = async () => {
    if (!text.trim()) {
      alert('Pegá la lista: producto, cantidad y precio.');
      return;
    }
    setBusy(true);
    setBusyMode('direct');
    setResult(null);
    try {
      const res = await api<ConfirmResult>('/products/bulk-create', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setResult(res);
      setStep('done');
      if (res.created > 0 || (res.updated ?? 0) > 0) onCreated(res);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error en la carga directa');
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  };

  const setDecision = (row: number, patch: Partial<Decision>) => {
    setDecisions((current) => ({ ...current, [row]: { ...current[row], ...patch } }));
  };

  const approveAll = () => {
    setDecisions((current) => {
      const next = { ...current };
      for (const r of rows) {
        next[r.row] = { ...(next[r.row] || defaultDecision(r)), action: 'approve' };
      }
      return next;
    });
  };

  const rejectAll = () => {
    setDecisions((current) => {
      const next = { ...current };
      for (const r of rows) {
        next[r.row] = { ...(next[r.row] || defaultDecision(r)), action: 'reject' };
      }
      return next;
    });
  };

  const confirm = async () => {
    const items = rows.map((r) => {
      const d = decisions[r.row] || defaultDecision(r);
      return {
        row: r.row,
        name: r.name,
        price: r.price,
        stock: r.stock,
        cost: r.cost,
        action: d.action,
        localProductId: d.mode === 'update_local' ? d.localProductId : undefined,
        publicProductId: d.mode === 'link_catalog' ? d.publicProductId : undefined,
      };
    });
    const approved = items.filter((i) => i.action === 'approve');
    if (!approved.length) {
      alert('No hay filas aprobadas.');
      return;
    }
    setBusy(true);
    setBusyMode('confirm');
    try {
      const res = await api<ConfirmResult>('/products/bulk-create/confirm', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      setResult(res);
      setStep('done');
      if (res.created > 0 || (res.updated ?? 0) > 0) onCreated(res);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al confirmar');
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  };

  const approvedCount = rows.filter((r) => (decisions[r.row] || defaultDecision(r)).action === 'approve').length;
  const rejectedCount = rows.length - approvedCount;

  const pickLocal = (rowNum: number, hit: LocalHit) => {
    setDecision(rowNum, {
      action: 'approve',
      mode: 'update_local',
      localProductId: hit.id,
      local: hit,
      publicProductId: undefined,
      catalog: null,
    });
    setSearchRow(null);
  };

  const pickCatalog = (rowNum: number, hit: CatalogHit) => {
    setDecision(rowNum, {
      action: 'approve',
      mode: 'link_catalog',
      publicProductId: hit.id,
      catalog: hit,
      localProductId: undefined,
      local: null,
    });
    setSearchRow(null);
  };

  const createNew = (rowNum: number) => {
    setDecision(rowNum, {
      action: 'approve',
      mode: 'create_new',
      localProductId: undefined,
      publicProductId: undefined,
      local: null,
      catalog: null,
    });
    setSearchRow(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hair bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-hair-soft p-5">
          <div>
            <h2 className="text-xl font-bold text-fg">Carga masiva de productos</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {step === 'paste' && 'Pegá producto, cantidad y precio. Podés subir directo o revisar match por match.'}
              {step === 'review' && 'Aprobá, rechazá o buscá un producto parecido antes de confirmar.'}
              {step === 'done' && 'Listo. Resumen de la carga.'}
            </p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-2 py-1 text-fg-muted hover:bg-raised disabled:opacity-50" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {step === 'paste' && (
            <>
              <div className="rounded-xl border border-hair-soft bg-raised p-3 text-xs text-fg-muted">
                <p className="font-medium text-fg">Formato</p>
                <p className="mt-1">
                  <span className="font-mono">producto,cantidad,precio;</span> — el <span className="font-mono">;</span> final es opcional.
                </p>
                <button type="button" onClick={() => setText(EXAMPLE)} className="mt-2 text-sm font-medium text-brand hover:underline">
                  Cargar ejemplo
                </button>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={14}
                spellCheck={false}
                placeholder={EXAMPLE}
                className="w-full resize-y rounded-xl border border-hair bg-raised px-3 py-2 font-mono text-sm text-fg outline-none placeholder:text-fg-faint focus:border-[color:var(--brand-accent)]"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-hair bg-raised px-3 py-2 text-sm font-medium text-fg hover:bg-raised2">
                  Subir .csv / .txt
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,.tsv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void file.text().then(setText);
                    e.target.value = '';
                  }}
                />
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hair-soft bg-raised p-3 text-sm">
                <span className="text-fg">
                  <strong className="font-mono">{rows.length}</strong> filas ·{' '}
                  <strong className="font-mono text-ok">{approvedCount}</strong> a aprobar ·{' '}
                  <strong className="font-mono text-crit">{rejectedCount}</strong> rechazadas
                </span>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={approveAll} className="rounded-lg border border-hair px-3 py-1.5 text-xs text-fg-muted hover:bg-raised2">
                    Aprobar todas
                  </button>
                  <button type="button" onClick={rejectAll} className="rounded-lg border border-hair px-3 py-1.5 text-xs text-fg-muted hover:bg-raised2">
                    Rechazar todas
                  </button>
                </div>
              </div>
              {parseErrors.length > 0 && (
                <div className="rounded-lg border border-warn/30 bg-[var(--warn-soft)] p-3 text-xs text-warn">
                  {parseErrors.slice(0, 5).map((e, i) => (
                    <div key={i}>{e.row ? `Fila ${e.row}: ` : ''}{e.message}</div>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                {rows.map((r) => {
                  const d = decisions[r.row] || defaultDecision(r);
                  const rejected = d.action === 'reject';
                  const linked = d.mode === 'update_local' ? d.local : d.mode === 'link_catalog' ? d.catalog : null;
                  return (
                    <article
                      key={r.row}
                      className={`rounded-xl border p-3 ${rejected ? 'border-crit/30 bg-[var(--crit-soft)]/40 opacity-70' : 'border-hair-soft bg-raised'}`}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-fg-faint">Fila {r.row} · pegado</p>
                          <p className="truncate font-semibold text-fg">{r.name}</p>
                          <p className="font-mono text-xs text-fg-muted">
                            {r.stock} u · {money(r.price)}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDecision(r.row, { action: 'approve' })}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${!rejected ? 'bg-ok text-white' : 'border border-hair text-fg-muted'}`}
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDecision(r.row, { action: 'reject' })}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${rejected ? 'bg-crit text-white' : 'border border-hair text-fg-muted'}`}
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSearchRow(r.row);
                              setSearchQ(r.name);
                            }}
                            className="rounded-lg border border-hair px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:bg-raised2"
                          >
                            Buscar
                          </button>
                        </div>
                      </div>

                      {!rejected && (
                        <div className="mt-3 flex items-center gap-3 rounded-lg border border-hair-soft bg-surface p-2.5">
                          <Thumb src={linked && 'imageUrl' in linked ? linked.imageUrl : null} name={linked?.name || r.name} />
                          <div className="min-w-0 flex-1">
                            {d.mode === 'update_local' && d.local ? (
                              <>
                                <p className="text-[11px] font-semibold uppercase text-brand">Actualizar inventario</p>
                                <p className="truncate text-sm font-medium text-fg">{d.local.name}</p>
                                <p className="font-mono text-[11px] text-fg-faint">
                                  Stock actual {d.local.stock ?? 0} · {d.local.barcode || 'sin código'}
                                </p>
                              </>
                            ) : d.mode === 'link_catalog' && d.catalog ? (
                              <>
                                <p className="text-[11px] font-semibold uppercase text-brand">Ficha catálogo público</p>
                                <p className="truncate text-sm font-medium text-fg">{d.catalog.name}</p>
                                <p className="font-mono text-[11px] text-fg-faint">
                                  {[d.catalog.brand, d.catalog.barcode].filter(Boolean).join(' · ') || 'sin código'}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-[11px] font-semibold uppercase text-fg-muted">Producto nuevo</p>
                                <p className="truncate text-sm text-fg">Se crea con el nombre pegado (sin ficha)</p>
                              </>
                            )}
                          </div>
                          <button type="button" onClick={() => createNew(r.row)} className="shrink-0 text-xs text-fg-faint hover:text-fg">
                            Solo nombre
                          </button>
                        </div>
                      )}

                      {!rejected && (r.localAlternatives.length > 1 || r.catalogAlternatives.length > 1) && searchRow !== r.row && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.localAlternatives.slice(0, 3).map((hit) => (
                            <button
                              key={`l-${hit.id}`}
                              type="button"
                              onClick={() => pickLocal(r.row, hit)}
                              className="rounded-full border border-hair bg-surface px-2 py-1 text-[11px] text-fg-muted hover:border-[color:var(--brand-accent)] hover:text-brand"
                            >
                              Local: {hit.name.slice(0, 28)}
                            </button>
                          ))}
                          {r.catalogAlternatives.slice(0, 3).map((hit) => (
                            <button
                              key={`c-${hit.id}`}
                              type="button"
                              onClick={() => pickCatalog(r.row, hit)}
                              className="rounded-full border border-hair bg-surface px-2 py-1 text-[11px] text-fg-muted hover:border-[color:var(--brand-accent)] hover:text-brand"
                            >
                              Catálogo: {hit.name.slice(0, 28)}
                            </button>
                          ))}
                        </div>
                      )}

                      {searchRow === r.row && (
                        <div className="mt-3 rounded-lg border border-[color:var(--brand-accent)] bg-surface p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <input
                              autoFocus
                              value={searchQ}
                              onChange={(e) => setSearchQ(e.target.value)}
                              placeholder="Buscar producto parecido…"
                              className="h-10 flex-1 rounded-lg border border-hair bg-raised px-3 text-sm text-fg outline-none"
                            />
                            <button type="button" onClick={() => setSearchRow(null)} className="text-sm text-fg-muted">
                              Cerrar
                            </button>
                          </div>
                          {searchBusy ? <p className="text-xs text-fg-faint">Buscando…</p> : null}
                          <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                            {searchHits.local.map((hit) => (
                              <button
                                key={hit.id}
                                type="button"
                                onClick={() => pickLocal(r.row, hit)}
                                className="flex items-center gap-2 rounded-lg border border-hair-soft p-2 text-left hover:bg-raised"
                              >
                                <Thumb src={hit.imageUrl} name={hit.name} />
                                <span className="min-w-0">
                                  <span className="block text-[10px] uppercase text-brand">Tu inventario</span>
                                  <span className="block truncate text-sm text-fg">{hit.name}</span>
                                </span>
                              </button>
                            ))}
                            {searchHits.catalog.map((hit) => (
                              <button
                                key={hit.id}
                                type="button"
                                onClick={() => pickCatalog(r.row, hit)}
                                className="flex items-center gap-2 rounded-lg border border-hair-soft p-2 text-left hover:bg-raised"
                              >
                                <Thumb src={hit.imageUrl} name={hit.name} />
                                <span className="min-w-0">
                                  <span className="block text-[10px] uppercase text-brand">Catálogo público</span>
                                  <span className="block truncate text-sm text-fg">{hit.name}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                          <button type="button" onClick={() => createNew(r.row)} className="mt-2 text-xs text-fg-muted hover:text-fg">
                            Crear solo con el nombre pegado
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {step === 'done' && result && (
            <div className="rounded-xl border border-ok/30 bg-[var(--ok-soft)] p-4 text-sm text-ok">
              <p>
                <strong className="font-mono">{result.created}</strong> creados
                {(result.updated ?? 0) > 0 ? <> · <strong className="font-mono">{result.updated}</strong> actualizados (+stock)</> : null}
                {result.matchedFromCatalog ? <> · <strong className="font-mono">{result.matchedFromCatalog}</strong> con catálogo</> : null}
                {result.rejected ? <> · <strong className="font-mono">{result.rejected}</strong> rechazados</> : null}
                {result.skipped ? <> · <strong className="font-mono">{result.skipped}</strong> con error</> : null}
              </p>
              {result.matches && result.matches.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-fg">
                  {result.matches.slice(0, 20).map((m) => (
                    <li key={`${m.row}-${m.catalog}`}>“{m.pasted}” → {m.catalog}</li>
                  ))}
                </ul>
              )}
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-warn">
                  {result.errors.slice(0, 15).map((e, i) => (
                    <li key={i}>Fila {e.row}: {e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-hair-soft p-5">
          {step === 'paste' && (
            <>
              <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-hair px-4 py-2.5 text-sm text-fg-muted">
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => void loadPreview()}
                className="rounded-xl border border-hair bg-raised px-4 py-2.5 text-sm font-semibold text-fg hover:bg-raised2 disabled:opacity-50"
              >
                {busyMode === 'preview' ? 'Analizando…' : 'Revisar lista'}
              </button>
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => void uploadDirect()}
                className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busyMode === 'direct' ? 'Subiendo…' : 'Subir directo'}
              </button>
            </>
          )}
          {step === 'review' && (
            <>
              <button type="button" disabled={busy} onClick={() => setStep('paste')} className="rounded-xl border border-hair px-4 py-2.5 text-sm text-fg-muted">
                Volver
              </button>
              <button type="button" disabled={busy || approvedCount === 0} onClick={() => void confirm()} className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
                {busy ? 'Guardando…' : `Confirmar ${approvedCount} aprobados`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button type="button" onClick={onClose} className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold">
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
