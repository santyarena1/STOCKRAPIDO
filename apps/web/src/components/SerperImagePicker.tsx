'use client';

import { useState } from 'react';
import { searchSerperImages, type SerperImageHit } from '@/lib/serper-client';

export type { SerperImageHit };

type Props = {
  query: string;
  value: string;
  onChange: (url: string) => void;
  compact?: boolean;
};

export function SerperImagePicker({ query, value, onChange, compact }: Props) {
  const [hits, setHits] = useState<SerperImageHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [customQuery, setCustomQuery] = useState('');

  const search = async () => {
    const q = (customQuery.trim() || query).trim();
    if (q.length < 2) {
      setError('Escribí el nombre del producto primero.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await searchSerperImages(q, compact ? 6 : 10);
      setHits(data.images || []);
      if (!data.images?.length) setError('No encontramos fotos para esa búsqueda.');
    } catch (err) {
      setHits([]);
      setError(err instanceof Error ? err.message : 'No se pudo buscar en Serper.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {!compact && (
        <p className="text-xs text-fg-faint">
          Si no hay resultados, cargá o revisá la key en{' '}
          <a href="/config/serper" className="text-brand hover:underline">Configuración → Imágenes Serper</a>.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={customQuery}
          onChange={(e) => setCustomQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search();
            }
          }}
          placeholder={query.trim() || 'Nombre para buscar la foto'}
          className={`min-w-0 flex-1 rounded-lg border border-hair bg-raised px-3 text-fg placeholder:text-fg-faint ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'}`}
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={busy}
          className={`rounded-lg border border-[color:var(--brand-accent)] font-semibold text-brand hover:bg-brand-highlight disabled:opacity-50 ${compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`}
        >
          {busy ? 'Buscando…' : 'Buscar foto (Serper)'}
        </button>
        {value ? (
          <button type="button" onClick={() => onChange('')} className="text-xs text-fg-muted hover:text-crit">
            Quitar imagen
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-16 w-16 rounded-lg border border-hair-soft bg-white object-contain" />
          <p className="truncate text-xs text-fg-faint">{value}</p>
        </div>
      ) : null}
      {hits.length > 0 && (
        <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-4 sm:grid-cols-5'}`}>
          {hits.map((hit) => {
            const selected = value === hit.imageUrl;
            return (
              <button
                key={hit.imageUrl}
                type="button"
                title={hit.title || hit.source}
                onClick={() => onChange(hit.imageUrl)}
                className={`overflow-hidden rounded-lg border bg-white p-1 ${selected ? 'border-[color:var(--brand-accent)] ring-2 ring-[color:var(--brand-accent)]' : 'border-hair-soft hover:border-[color:var(--brand-accent)]'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hit.thumbnailUrl || hit.imageUrl} alt="" className="aspect-square w-full object-contain" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
