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

const TYPE_LABELS: Record<ColumnType, string> = {
  string: 'Texto',
  number: 'Número',
  boolean: 'Sí/No',
  mixed: 'Mixto',
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
  const { connections, connection } = useSyncProvider();
  const [mode, setMode] = useState<'overview' | 'provider'>('overview');
  const [query, setQuery] = useState('');
  const [overview, setOverview] = useState<OverviewColumn[]>([]);
  const [columns, setColumns] = useState<RawColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        {mode === 'provider' && <ProviderTabs />}
      </Card>

      {error && <div className="rounded-xl border border-[color:var(--crit)] bg-[var(--crit-soft)] p-4 text-sm text-crit">{error}</div>}
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
              <thead className="bg-raised text-xs uppercase tracking-wide text-fg-faint"><tr><th className="px-4 py-3">Path</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Cobertura</th><th className="px-4 py-3">Muestras</th><th className="px-4 py-3">¿Ya mapeado?</th></tr></thead>
              <tbody className="divide-y divide-[color:var(--hair-soft)]">
                {visibleColumns.map((row) => <tr key={row.path} className="hover:bg-raised/60"><td className="px-4 py-3 font-mono text-xs text-fg">{row.path}</td><td className="px-4 py-3 text-fg-muted">{TYPE_LABELS[row.type]}</td><td className="px-4 py-3"><Coverage coverage={row.coverage} total={row.total} /></td><td className="max-w-sm px-4 py-3 text-xs text-fg-muted">{row.samples.length ? row.samples.join(' · ') : '—'}</td><td className="px-4 py-3">{row.mapped ? <span className="inline-flex rounded-md border border-[color:var(--ok)] bg-[var(--ok-soft)] px-2 py-1 text-xs text-ok">Sí · {row.mappedTo}</span> : <span className="inline-flex rounded-md border border-hair bg-raised2 px-2 py-1 text-xs text-fg-faint">Crudo</span>}</td></tr>)}
                {!visibleColumns.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">No hay columnas que coincidan con la búsqueda.</td></tr>}
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
