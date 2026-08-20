'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { hasStoredSerperKey, saveSerperKey } from '@/lib/serper-client';
import { Business, useConfig } from '../config-context';

export default function SerperConfigPage() {
  const { business, setBusiness } = useConfig();
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [localHasKey, setLocalHasKey] = useState(false);
  const businessHasKey = Boolean(business?.hasSerperKey);

  useEffect(() => {
    setLocalHasKey(hasStoredSerperKey());
  }, []);

  const persist = async (nextKey: string) => {
    setSaving(true);
    setMsg('');
    try {
      const updated = await saveSerperKey(nextKey);
      setLocalHasKey(hasStoredSerperKey());
      setBusiness((current) =>
        current
          ? ({ ...current, ...updated, hasSerperKey: updated.savedOnBusiness && updated.hasSerperKey } as Business)
          : current,
      );
      setKey('');
      if (!nextKey.trim()) {
        setMsg('Se quitó la API de Serper.');
      } else if (updated.savedOnBusiness) {
        setMsg('API guardada en el negocio. Ya se puede usar desde cualquier PC.');
      } else {
        setMsg('Quedó solo en este navegador. En otra PC no va a andar: revisá que la API esté actualizada o reintentá.');
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    await persist(key);
  };

  const clear = async () => {
    if (!confirm('¿Quitar la API key de Serper de este negocio?')) return;
    setKey('');
    await persist('');
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
          {' '}y pegala acá. Tiene que guardarse en el negocio para usarla en otra PC.
        </p>
        <p className={`text-sm ${businessHasKey ? 'text-ok' : localHasKey ? 'text-warn' : 'text-warn'}`}>
          {businessHasKey
            ? 'Key cargada en el negocio (cualquier PC).'
            : localHasKey
              ? 'Hay una key solo en este navegador. Guardala de nuevo para sincronizar el negocio.'
              : 'Todavía no hay una API key cargada.'}
        </p>
        <div>
          <label className="mb-1 block text-sm text-fg-muted">API key de Serper</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={businessHasKey || localHasKey ? 'Ingresá una nueva key para reemplazarla' : 'Pegá la key de serper.dev'}
            autoComplete="new-password"
            className="w-full rounded-lg border border-hair bg-raised px-3 py-2 font-mono text-sm text-fg"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving || (!key.trim() && !businessHasKey && !localHasKey)} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {businessHasKey || localHasKey ? (
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
