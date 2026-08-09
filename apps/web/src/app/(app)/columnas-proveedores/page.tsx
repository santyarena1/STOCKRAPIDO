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

type FieldSuggestion = { field: string; columnPath: string | null; confidence: 'alta' | 'media' | 'baja' | null; candidates: Array<{ columnPath: string; confidence: string; score: number }> };
type FieldMappingResponse = { fieldMap: Record<string, string>; suggestions: FieldSuggestion[] };

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
const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', brand: 'Marca', category: 'Categoría', subcategory: 'Subcategoría',
  ean: 'EAN general', eanUnit: 'EAN unidad', eanBox: 'EAN bulto', sku: 'SKU proveedor',
  supplierRef: 'Ref. proveedor', externalId: 'ID externo', cost: 'Costo B2B',
  basePrice: 'Precio base', listPrice: 'Precio lista', ivaAlicuota: 'IVA (%)', stock: 'Stock',
  imageUrl: 'Imagen', link: 'Link', weight: 'Peso', unitsPerBox: 'Unidades por bulto',
  unitsPerDisplay: 'Unidades por display', displaysPerBox: 'Displays por bulto',
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
  const [fieldSuggestions, setFieldSuggestions] = useState<FieldSuggestion[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [mappingNotes, setMappingNotes] = useState<Record<string, string>>({});
  const [mappingBusy, setMappingBusy] = useState<'heuristic' | 'ai' | 'save' | null>(null);
  const [mappingSaved, setMappingSaved] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);

  useEffect(() => {
    api<{ hasOpenaiKey?: boolean }>('/business/me').then((business) => setHasOpenaiKey(!!business.hasOpenaiKey)).catch(() => {});
  }, []);

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
    Promise.all([
      api<{ columns: RawColumn[] }>(`/sync/connections/${connection.id}/raw-columns`),
      api<FieldMappingResponse>(`/sync/connections/${connection.id}/field-mapping`),
    ])
      .then(([result, mapping]) => { if (!cancelled) { const savedPaths = new Set(Object.values(mapping.fieldMap)); const heuristic = Object.fromEntries(mapping.suggestions.filter((item) => item.columnPath && !mapping.fieldMap[item.field] && !savedPaths.has(item.columnPath)).map((item) => [item.field, item.columnPath as string])); setColumns(result.columns); setFieldSuggestions(mapping.suggestions); setFieldMap({ ...heuristic, ...mapping.fieldMap }); setMappingNotes({}); setMappingSaved(false); } })
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

  const applyHeuristic = () => {
    setMappingBusy('heuristic');
    setFieldMap(Object.fromEntries(fieldSuggestions.filter((item) => item.columnPath).map((item) => [item.field, item.columnPath as string])));
    setMappingNotes(Object.fromEntries(fieldSuggestions.filter((item) => item.columnPath).map((item) => [item.field, `Sugerencia heurística · confianza ${item.confidence ?? 'baja'}`])));
    setMappingSaved(false); setMappingBusy(null);
  };
  const suggestWithAi = async () => {
    if (!connection || !hasOpenaiKey) return;
    setMappingBusy('ai'); setError('');
    try {
      const result = await api<{ fieldMap: Record<string, string | null>; notes: Record<string, string> }>(`/sync/connections/${connection.id}/ai-field-mapping`);
      setFieldMap(Object.fromEntries(Object.entries(result.fieldMap).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
      setMappingNotes(result.notes ?? {}); setMappingSaved(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo sugerir el mapeo con IA.'); }
    finally { setMappingBusy(null); }
  };
  const saveFieldMap = async () => {
    if (!connection) return;
    setMappingBusy('save'); setError(''); setMappingSaved(false);
    try {
      await api(`/sync/connections/${connection.id}/field-map`, { method: 'PATCH', body: JSON.stringify({ fieldMap }) });
      setMappingSaved(true); await refetch();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el mapeo.'); }
    finally { setMappingBusy(null); }
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
        <p className="text-sm leading-6 text-fg-muted">Estas son todas las columnas que trae cada proveedor. Después vas a poder elegir cuáles usar y a qué campo mapearlas.</p>
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

      {mode === 'provider' && connection && !loading && <Card className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-lg font-semibold text-fg">Mapeo a tus campos</h2><p className="text-sm text-fg-muted">Cada campo de StockRápido usa una sola columna de {SYNC_PROVIDERS[connection.provider]?.label ?? connection.name}.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={applyHeuristic} disabled={!!mappingBusy} className="rounded-xl border border-hair bg-raised px-4 py-2.5 text-sm font-semibold text-fg hover:bg-raised2 disabled:opacity-50">Sugerir (heurística)</button><button type="button" title={hasOpenaiKey ? 'Sugerir usando OpenAI' : 'Configurá tu API key en Configuración'} onClick={() => void suggestWithAi()} disabled={!!mappingBusy || !hasOpenaiKey} className="btn-brand rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{mappingBusy === 'ai' ? 'Consultando IA…' : 'Sugerir con IA'}</button><button type="button" onClick={() => void saveFieldMap()} disabled={!!mappingBusy} className="rounded-xl border border-[color:var(--ok)] bg-[var(--ok-soft)] px-4 py-2.5 text-sm font-semibold text-ok disabled:opacity-50">{mappingBusy === 'save' ? 'Guardando…' : 'Guardar mapeo'}</button></div></div>
        {!hasOpenaiKey && <p className="rounded-xl border border-warn/30 bg-[var(--warn-soft)] px-3 py-2 text-xs text-warn">Configurá tu API key de OpenAI en Configuración → Proveedores para habilitar la sugerencia con IA.</p>}
        {mappingSaved && <p className="text-sm text-ok">Mapeo guardado ✓</p>}
        <div className="overflow-x-auto rounded-xl border border-hair-soft"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-raised text-xs uppercase tracking-wide text-fg-faint"><tr><th className="px-4 py-3">Campo de StockRápido</th><th className="px-4 py-3">Columna del proveedor</th><th className="px-4 py-3">Sugerencia</th></tr></thead><tbody className="divide-y divide-[color:var(--hair-soft)]">{TARGET_FIELDS.map((field) => { const suggestion = fieldSuggestions.find((item) => item.field === field); return <tr key={field}><td className="px-4 py-3"><span className="font-medium text-fg">{FIELD_LABELS[field] ?? field}</span><span className="ml-2 font-mono text-xs text-fg-faint">{field}</span></td><td className="px-4 py-3"><select value={fieldMap[field] ?? ''} onChange={(event) => { const value = event.target.value; setFieldMap((current) => { const next = Object.fromEntries(Object.entries(current).filter(([otherField, path]) => otherField === field || path !== value)); if (value) next[field] = value; else delete next[field]; return next; }); setMappingSaved(false); }} className="w-full rounded-lg border border-hair bg-surface px-3 py-2 font-mono text-xs text-fg outline-none focus-brand"><option value="">— sin mapear —</option>{columns.filter((column) => !column.mapped).map((column) => <option key={column.path} value={column.path}>{column.path}</option>)}</select></td><td className="px-4 py-3 text-xs text-fg-muted">{mappingNotes[field] ? <span title={mappingNotes[field]}>{mappingNotes[field]}</span> : suggestion?.columnPath ? <span>Heurística: <span className="font-mono">{suggestion.columnPath}</span> · confianza {suggestion.confidence}</span> : 'Sin sugerencia'}</td></tr>; })}</tbody></table></div>
      </Card>}
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
