'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Loader } from '@/components/ui/Loader';

export type SyncConnection = {
  id: string;
  provider: string;
  name: string;
  priceMarkup: string | number;
  autoSync: boolean;
  enabled?: boolean;
  lastSyncAt?: string | null;
  lastStatus?: string | null;
  _count?: { items: number };
  viewConfig?: { tableColumns: string[]; filterColumns: string[] };
};

export const SYNC_PROVIDERS: Record<string, { label: string; description: string; runnerNote: string; runnerFile: string }> = {
  mondelez: { label: 'Mondelez', description: 'Catálogo y precios de Mi Tienda Mondelez', runnerNote: 'El runner local trae el precio B2B real con tu cuenta de Mi Tienda Mondelez.', runnerFile: 'mondelez_sync_runner.py' },
  juntosplus: { label: 'Juntos+', description: 'Catálogo Coca-Cola FEMSA', runnerNote: 'Juntos+ se sincroniza con el runner local mediante el acceso con OTP.', runnerFile: 'juntosplus_sync_runner.py' },
  tokin: { label: 'Tokin (Arcor)', description: 'Catálogo Tokin con variantes UN/DI/BU', runnerNote: 'El runner local captura el catálogo, los códigos y las variantes de Tokin.', runnerFile: 'tokin_sync_runner.py' },
};

const DEFAULT_CONNECTIONS = [
  { provider: 'mondelez', name: 'Mondelez', priceMarkup: 40 },
  { provider: 'juntosplus', name: 'Juntos+', priceMarkup: 40 },
  { provider: 'tokin', name: 'Tokin (Arcor)', priceMarkup: 40 },
];

type SyncProviderValue = {
  connections: SyncConnection[];
  connection: SyncConnection | null;
  activeId: string | null;
  setActiveId: (id: string) => void;
  loading: boolean;
  refetch: () => Promise<void>;
};

const SyncProviderContext = createContext<SyncProviderValue | null>(null);

export function SyncProviderProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<SyncConnection[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      let rows = await api<SyncConnection[]>('/sync/connections');
      for (const definition of DEFAULT_CONNECTIONS) {
        if (!rows.some((row) => row.provider === definition.provider)) {
          const created = await api<SyncConnection>('/sync/connections', { method: 'POST', body: JSON.stringify(definition) });
          rows = [...rows, created];
        }
      }
      setConnections(rows);
      const saved = typeof window !== 'undefined' ? localStorage.getItem('sr-sync-provider') : null;
      setActiveIdState((current) => {
        const preferred = current || saved;
        return preferred && rows.some((row) => row.id === preferred) ? preferred : rows[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);
  const setActiveId = useCallback((id: string) => { setActiveIdState(id); localStorage.setItem('sr-sync-provider', id); }, []);
  useEffect(() => { if (activeId) localStorage.setItem('sr-sync-provider', activeId); }, [activeId]);
  const connection = connections.find((row) => row.id === activeId) ?? connections[0] ?? null;
  const value = useMemo(() => ({ connections, connection, activeId, setActiveId, loading, refetch }), [connections, connection, activeId, setActiveId, loading, refetch]);

  return <SyncProviderContext.Provider value={value}>{loading ? <Loader full label="Proveedores" /> : children}</SyncProviderContext.Provider>;
}

export function useSyncProvider() {
  const value = useContext(SyncProviderContext);
  if (!value) throw new Error('useSyncProvider debe usarse dentro de SyncProviderProvider');
  return value;
}

export function ProviderTabs() {
  const { connections, connection, setActiveId } = useSyncProvider();
  return <div className="flex flex-wrap gap-2">{connections.map((item) => { const active = item.id === connection?.id; const meta = SYNC_PROVIDERS[item.provider]; return <button key={item.id} type="button" onClick={() => setActiveId(item.id)} className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${active ? 'border-[color:var(--brand-accent)] bg-brand-highlight-soft text-brand' : 'border-hair bg-surface text-fg-muted hover:bg-raised hover:text-fg'}`}>{meta?.label ?? item.name}<span className="ml-2 font-mono text-xs opacity-70">{item._count?.items ?? 0}</span></button>; })}</div>;
}
