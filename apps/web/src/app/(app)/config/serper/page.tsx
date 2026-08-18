'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { Business, useConfig } from '../config-context';

export default function SerperConfigPage() {
  const { business, setBusiness } = useConfig();
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const hasKey = Boolean(business?.hasSerperKey);

  useEffect(() => {
    setMsg('');
  }, [business?.hasSerperKey]);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const updated = await api<Business>('/business/serper-key', {
        method: 'PATCH',
        body: JSON.stringify({ key }),
      });
      setBusiness(updated);
      setKey('');
      setMsg(key.trim() ? 'API de Serper guardada.' : 'Se quitó la API de Serper.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm('¿Quitar la API key de Serper de este negocio?')) return;
    setKey('');
    setSaving(true);
    try {
      const updated = await api<Business>('/business/serper-key', {
        method: 'PATCH',
        body: JSON.stringify({ key: '' }),
      });
      setBusiness(updated);
      setMsg('Se quitó la API de Serper.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo quitar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Imágenes Serper"
        subtitle="Conectá Google Images vía Serper para buscar y asignar fotos a los productos."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5"
      >
        <p className="text-sm text-fg-muted">
          Creá una key en{' '}
          <a href="https://serper.dev" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
            serper.dev
          </a>
          {' '}y pegala acá. Se usa para buscar fotos en el alta, la edición, el producto rápido del POS y el{' '}
          <a href="/productos/imagenes" className="font-semibold text-brand hover:underline">
            editor masivo de imágenes
          </a>
          .
        </p>
        <p className={`text-sm ${hasKey ? 'text-ok' : 'text-warn'}`}>
          {hasKey ? 'Este negocio ya tiene una API key cargada.' : 'Todavía no hay una API key cargada.'}
        </p>
        <div>
          <label className="mb-1 block text-sm text-fg-muted">API key de Serper</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={hasKey ? 'Ingresá una nueva key para reemplazarla' : 'Pegá la key de serper.dev'}
            autoComplete="new-password"
            className="w-full rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-sm text-fg"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving || (!key.trim() && !hasKey)} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {hasKey ? (
            <button type="button" disabled={saving} onClick={() => void clear()} className="rounded-lg border border-hair px-4 py-2 text-fg-muted hover:text-crit">
              Quitar key
            </button>
          ) : null}
        </div>
        {msg ? <p className="text-sm text-fg-muted">{msg}</p> : null}
      </form>
    </div>
  );
}
