'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import {
  ProviderTabs,
  SYNC_PROVIDERS,
  SyncProviderProvider,
  useSyncProvider,
} from '@/components/sync/SyncProviderContext';

type ColumnType = 'number' | 'string' | 'boolean' | 'mixed';
type RawColumn = {
  path: string;
  type: ColumnType;
  coverage: number;
  total: number;
  samples: string[];
  mapped?: boolean;
  mappedTo?: string;
};
type ProviderColumn = {
  provider: string;
  connectionId: string;
  coverage: number;
  total: number;
  sample: string | null;
};
type OverviewColumn = {
  path: string;
  type: ColumnType;
  coincidence: number;
  providers: ProviderColumn[];
};

type SuggestionColumn = { path: string; type: ColumnType; providers: { provider: string; connectionId: string; sample: string | null }[] };
type Suggestion = { suggestedField: string | null; label: string; confidence: 'alta' | 'media' | 'baja'; providers: string[]; columns: SuggestionColumn[] };

const TYPE_LABELS: Record<ColumnType, string> = {
  string: 'Texto',
  number: 'Número',
  boolean: 'Sí/No',
  mixed: 'Mixto',
};

const TARGET_FIELDS = [
  'name', 'brand', 'category', 'subcategory', 'ean', 'eanUnit', 'eanBox', 'sku',
  'supplierRef', 'externalId', 'cost', 'basePrice', 'listPrice', 'ivaAlicuota',
  'stock', 'imageUrl', 'link', 'weight', 'unitsPerBox', 'unitsPerDisplay', 'displaysPerBox',
];
const CONF_STYLE: Record<string, string> = {
  alta: 'border-[color:var(--ok)] bg-[var(--ok-soft)] text-ok',
  media: 'border-[color:var(--warn)] bg-[var(--warn-soft)] text-warn',
  baja: 'border-hair bg-raised2 text-fg-muted',
};

function Coverage({ coverage, total, sample }: { coverage: number; total: number; sample?: string | null }) {
  const percent = total ? Math.round((coverage / total) * 100) : 0;
  return (
    <div className="min-w-32" title={sample || undefined}>
      <div className="mb-1 flex items-center justify-between gap-3 font-mono text-xs text-fg-muted">
        <span>{percent}%</span><span>{coverage}/{total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised2">
        <div className="h-full rounded-full bg-[color:var(--brand-accent)]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ColumnsPageContent() {
  const { connections, connection, refetch } = useSyncProvider();
  const [mode, setMode] = useState<'overview' | 'provider'>('overview');
  const [query, setQuery] = useState('');
  const [overview, setOverview] = useState<OverviewColumn[]>([]);
  const [columns, setColumns] = useState<RawColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [filterColumns, setFilterColumns] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loadingSug, setLoadingSug] = useState(false);
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [approved, setApproved] = useState<Record<number, boolean>>({});
  const [approving, setApproving] = useState<number | null>(null);

  useEffect(() => {
    setTableColumns(connection?.viewConfig?.tableColumns ?? []);
    setFilterColumns(connection?.viewConfig?.filterColumns ?? []);
    setSaved(false);
  }, [connection?.id, connection?.viewConfig]);

  useEffect(() => {
    if (mode !== 'overview') return;
    let cancelled = false;
    setLoading(true); setError('');
    api<OverviewColumn[]>('/sync/raw-columns-overview')
      .then((rows) => { if (!cancelled) setOverview(rows); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las columnas.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'provider' || !connection) return;
    let cancelled = false;
    setLoading(true); setError('');
    api<{ columns: RawColumn[] }>(`/sync/connections/${connection.id}/raw-columns`)
      .then((result) => { if (!cancelled) setColumns(result.columns); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las columnas.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, connection]);

  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const visibleOverview = useMemo(
    () => overview.filter((row) => !normalizedQuery || row.path.toLocaleLowerCase('es').includes(normalizedQuery)),
    [overview, normalizedQuery],
  );
  const visibleColumns = useMemo(
    () => columns.filter((row) => !normalizedQuery || row.path.toLocaleLowerCase('es').includes(normalizedQuery)),
    [columns, normalizedQuery],
  );

  const loadSuggestions = async () => {
    setLoadingSug(true); setError('');
    try {
      const data = await api('/sync/mapping-suggestions') as Suggestion[];
      setSuggestions(data);
      const initial: Record<number, string> = {};
      data.forEach((item, index) => { if (item.suggestedField) initial[index] = item.suggestedField; });
      setTargets(initial); setApproved({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron traer las sugerencias.');
    } finally { setLoadingSug(false); }
  };
  const approveSuggestion = async (index: number, suggestion: Suggestion) => {
    const field = targets[index];
    if (!field) return;
    setApproving(index); setError('');
    try {
      const members = suggestion.columns.flatMap((col) => col.providers.map((p) => ({ connectionId: p.connectionId, path: col.path })));
      await api('/sync/mapping-suggestions/approve', { method: 'POST', body: JSON.stringify({ field, members }) });
      setApproved((prev) => ({ ...prev, [index]: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo aprobar el mapeo.');
    } finally { setApproving(null); }
  };

  const togglePath = (path: string, current: string[], setter: (value: string[]) => void) =>
    setter(current.includes(path) ? current.filter((item) => item !== path) : [...current, path]);
  const saveViewConfig = async () => {
    if (!connection) return;
    setSaving(true); setSaved(false); setError('');
    try {
      await api(`/sync/connections/${connection.id}/view-config`, {
        method: 'PATCH',
        body: JSON.stringify({ tableColumns, filterColumns }),
      });
      setSaved(true);
      await refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la selección.');
    } finally { setSaving(false); }
  };

  return (
    <Container className="max-w-[1600px] space-y-6 overflow-x-hidden">
      <PageHeader title="Columnas de proveedores" subtitle="Explorá la información disponible antes de decidir cómo mapearla." />
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-fg-muted sm:max-w-2xl">Estas son todas las columnas que trae cada proveedor. Después vas a poder elegir cuáles usar y a qué campo mapearlas.</p>
          <button type="button" disabled={loadingSug} onClick={() => void loadSuggestions()} className="btn-brand shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{loadingSug ? 'Analizando…' : '✨ Sugerir mapeo'}</button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-full rounded-xl border border-hair bg-raised p-1 sm:w-auto">
            <button type="button" onClick={() => setMode('overview')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium sm:flex-none ${mode === 'overview' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}>Comparación (todos)</button>
            <button type="button" onClick={() => setMode('provider')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium sm:flex-none ${mode === 'provider' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}>Por proveedor</button>
          </div>
          <label className="relative block w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar una columna..." className="w-full rounded-xl border border-hair bg-raised py-2.5 pl-9 pr-3 text-sm text-fg outline-none placeholder:text-fg-faint focus-brand" />
          </label>
        </div>
        {mode === 'provider' && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><ProviderTabs /><div className="flex items-center gap-3">{saved && <span className="text-sm text-ok">Selección guardada</span>}<button type="button" disabled={saving || !connection} onClick={() => void saveViewConfig()} className="btn-brand rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar columnas'}</button></div></div>}
      </Card>

      {error && <div className="rounded-xl border border-[color:var(--crit)] bg-[var(--crit-soft)] p-4 text-sm text-crit">{error}</div>}

      {suggestions && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-fg">Sugerencias de mapeo</h3>
              <p className="text-sm text-fg-muted">Columnas que parecen la misma información. Revisá el campo destino y aprobá lo que corresponda.</p>
            </div>
            <button type="button" onClick={() => setSuggestions(null)} className="rounded-lg border border-hair px-3 py-1.5 text-xs text-fg-muted hover:text-fg">Cerrar</button>
          </div>
          {!suggestions.length && <p className="py-6 text-center text-sm text-fg-muted">No se encontraron columnas equivalentes para sugerir.</p>}
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="rounded-xl border border-hair-soft bg-raised p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium capitalize ${CONF_STYLE[suggestion.confidence]}`}>Confianza {suggestion.confidence}</span>
                    <span className="text-xs text-fg-faint">{suggestion.providers.join(' + ')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-fg-muted">Mapear a:</span>
                    <select value={targets[index] ?? ''} onChange={(event) => setTargets((prev) => ({ ...prev, [index]: event.target.value }))} className="rounded-lg border border-hair bg-surface px-2.5 py-1.5 text-sm text-fg outline-none focus-brand">
                      <option value="">— elegir —</option>
                      {TARGET_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}
                    </select>
                    {approved[index] ? (
                      <span className="inline-flex items-center rounded-lg border border-[color:var(--ok)] bg-[var(--ok-soft)] px-3 py-1.5 text-sm font-medium text-ok">✓ Aprobado</span>
                    ) : (
                      <button type="button" disabled={!targets[index] || approving === index} onClick={() => void approveSuggestion(index, suggestion)} className="btn-brand rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50">{approving === index ? 'Guardando…' : 'Aprobar'}</button>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-1.5">
                  {suggestion.columns.map((col) => (
                    <div key={col.path} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-raised2 px-2 py-0.5 font-medium text-fg-muted">{col.providers.map((p) => p.provider).join(', ')}</span>
                      <span className="font-mono text-fg">{col.path}</span>
                      {col.providers[0]?.sample && <span className="text-fg-faint">· ej: {col.providers[0].sample}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {loading ? <Loader /> : mode === 'overview' ? (
        <Card className="p-0 sm:p-0">
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-fg-faint"><tr><th className="px-4 py-3">Path</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3 text-center">Coincidencia</th>{connections.map((item) => <th key={item.id} className="px-4 py-3">{SYNC_PROVIDERS[item.provider]?.label ?? item.name}</th>)}</tr></thead>
              <tbody className="divide-y divide-[color:var(--hair-soft)]">
                {visibleOverview.map((row) => <tr key={row.path} className="hover:bg-raised/60"><td className="px-4 py-3 font-mono text-xs text-fg">{row.path}</td><td className="px-4 py-3 text-fg-muted">{TYPE_LABELS[row.type]}</td><td className="px-4 py-3 text-center"><span className={`inline-flex rounded-md border px-2 py-1 font-mono text-xs ${row.coincidence >= 2 ? 'border-[color:var(--brand-accent)] bg-brand-highlight-soft text-brand' : 'border-hair bg-raised2 text-fg-muted'}`}>{row.coincidence}/{new Set(connections.map((item) => item.provider)).size}</span></td>{connections.map((item) => { const provider = row.providers.find((entry) => entry.connectionId === item.id); return <td key={item.id} className="px-4 py-3">{provider ? <Coverage coverage={provider.coverage} total={provider.total} sample={provider.sample} /> : <span className="text-fg-faint">—</span>}</td>; })}</tr>)}
                {!visibleOverview.length && <tr><td colSpan={3 + connections.length} className="px-4 py-10 text-center text-fg-muted">No hay columnas que coincidan con la búsqueda.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-0 sm:p-0">
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-fg-faint"><tr><th className="px-4 py-3">Path</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Cobertura</th><th className="px-4 py-3">Muestras</th><th className="px-4 py-3">¿Ya mapeado?</th><th className="px-4 py-3 text-center">Mostrar en tabla</th><th className="px-4 py-3 text-center">Usar como filtro</th></tr></thead>
              <tbody className="divide-y divide-[color:var(--hair-soft)]">
                {visibleColumns.map((row) => <tr key={row.path} className="hover:bg-raised/60"><td className="px-4 py-3 font-mono text-xs text-fg">{row.path}</td><td className="px-4 py-3 text-fg-muted">{TYPE_LABELS[row.type]}</td><td className="px-4 py-3"><Coverage coverage={row.coverage} total={row.total} /></td><td className="max-w-sm px-4 py-3 text-xs text-fg-muted">{row.samples.length ? row.samples.join(' · ') : '—'}</td><td className="px-4 py-3">{row.mapped ? <span className="inline-flex rounded-md border border-[color:var(--ok)] bg-[var(--ok-soft)] px-2 py-1 text-xs text-ok">Sí · {row.mappedTo}</span> : <span className="inline-flex rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-faint">Crudo</span>}</td><td className="px-4 py-3 text-center"><input type="checkbox" aria-label={`Mostrar ${row.path} en tabla`} disabled={row.mapped} checked={!row.mapped && tableColumns.includes(row.path)} onChange={() => togglePath(row.path, tableColumns, setTableColumns)} /></td><td className="px-4 py-3 text-center"><input type="checkbox" aria-label={`Usar ${row.path} como filtro`} disabled={row.mapped} checked={!row.mapped && filterColumns.includes(row.path)} onChange={() => togglePath(row.path, filterColumns, setFilterColumns)} /></td></tr>)}
                {!visibleColumns.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-fg-muted">No hay columnas que coincidan con la búsqueda.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Container>
  );
}

export default function ColumnsProvidersPage() {
  return <SyncProviderProvider><ColumnsPageContent /></SyncProviderProvider>;
}
