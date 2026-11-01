'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MultiImageUploader } from '@/components/ImageUploader';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { getPublicPantallasUrl } from '@/lib/env-urls';
import { isTeatroTenantName } from '@/lib/teatro';
import { Business, useConfig } from '../config-context';

type PantallasForm = {
  imageUrls: string[];
  dwellSec: number;
  transitionMs: number;
  animation: 'fade' | 'slide' | 'zoom';
  fit: 'cover' | 'contain';
  enabled: boolean;
  shareToken: string;
};

const DEFAULTS: PantallasForm = {
  imageUrls: [],
  dwellSec: 8,
  transitionMs: 900,
  animation: 'fade',
  fit: 'cover',
  enabled: true,
  shareToken: '',
};

function fromBusiness(business: Business | null): PantallasForm {
  const p = business?.posConfig?.pantallas;
  return {
    imageUrls: Array.isArray(p?.imageUrls) ? [...p!.imageUrls!] : [],
    dwellSec: typeof p?.dwellSec === 'number' ? p.dwellSec : DEFAULTS.dwellSec,
    transitionMs: typeof p?.transitionMs === 'number' ? p.transitionMs : DEFAULTS.transitionMs,
    animation: p?.animation === 'slide' || p?.animation === 'zoom' ? p.animation : 'fade',
    fit: p?.fit === 'contain' ? 'contain' : 'cover',
    enabled: p?.enabled !== false,
    shareToken: typeof p?.shareToken === 'string' ? p.shareToken : '',
  };
}

function moveItem(urls: string[], from: number, to: number) {
  if (to < 0 || to >= urls.length) return urls;
  const next = [...urls];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function PantallasConfigPage() {
  const router = useRouter();
  const { business, setBusiness, loading } = useConfig();
  const isTeatro = isTeatroTenantName(business?.name);
  const [form, setForm] = useState<PantallasForm>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [regenning, setRegenning] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setForm(fromBusiness(business));
  }, [business]);

  useEffect(() => {
    if (!loading && business && !isTeatro) {
      router.replace('/config');
    }
  }, [loading, business, isTeatro, router]);

  const publicUrl = useMemo(
    () => (form.shareToken ? getPublicPantallasUrl(form.shareToken) : ''),
    [form.shareToken],
  );

  if (loading || !business) {
    return <p className="text-sm text-fg-muted">Cargando…</p>;
  }
  if (!isTeatro) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api<Business>('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({
          posConfig: {
            pantallas: {
              imageUrls: form.imageUrls,
              dwellSec: form.dwellSec,
              transitionMs: form.transitionMs,
              animation: form.animation,
              fit: form.fit,
              enabled: form.enabled,
              ...(form.shareToken ? { shareToken: form.shareToken } : {}),
            },
          },
        }),
      });
      setBusiness(updated);
      setForm(fromBusiness(updated));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!confirm('¿Generar un link nuevo? El link anterior deja de funcionar en las TVs.')) return;
    setRegenning(true);
    try {
      const updated = await api<Business>('/business/pantallas/regenerate-token', {
        method: 'POST',
        body: '{}',
      });
      setBusiness(updated);
      setForm(fromBusiness(updated));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setRegenning(false);
    }
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copiá este link:', publicUrl);
    }
  };

  const openDisplay = () => {
    if (!publicUrl) {
      alert('Guardá primero para generar el link de la pantalla.');
      return;
    }
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pantallas"
        subtitle="Fotos horizontales para TVs del teatro (~65″). Se abren a pantalla completa en otra pestaña."
      />

      <form onSubmit={save} className="space-y-5 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            className="rounded border-hair"
          />
          Pantalla activa (si está apagada, el link público no muestra nada)
        </label>

        <div>
          <label className="mb-1 block text-sm text-fg-muted">Imágenes (horizontal, buena resolución)</label>
          <p className="mb-2 text-xs text-fg-faint">
            Hasta 30 fotos. Se suben en alta calidad (hasta ~4K). Ideal horizontal 16:9 para TVs de 65″.
          </p>
          <MultiImageUploader
            values={form.imageUrls}
            onChange={(urls) => setForm((f) => ({ ...f, imageUrls: urls }))}
            maxCount={30}
            maxPx={3840}
            quality={0.9}
          />
          {form.imageUrls.length > 1 && (
            <ul className="mt-3 space-y-2">
              {form.imageUrls.map((url, i) => (
                <li
                  key={`${url}-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-hair-soft bg-raised px-2 py-1.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-10 w-16 rounded object-cover" />
                  <span className="flex-1 text-xs text-fg-muted">Foto {i + 1}</span>
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => setForm((f) => ({ ...f, imageUrls: moveItem(f.imageUrls, i, i - 1) }))}
                    className="rounded border border-hair px-2 py-1 text-xs text-fg disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={i === form.imageUrls.length - 1}
                    onClick={() => setForm((f) => ({ ...f, imageUrls: moveItem(f.imageUrls, i, i + 1) }))}
                    className="rounded border border-hair px-2 py-1 text-xs text-fg disabled:opacity-40"
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-fg-muted">Tiempo por imagen (segundos)</label>
            <input
              type="number"
              min={2}
              max={120}
              value={form.dwellSec}
              onChange={(e) => setForm((f) => ({ ...f, dwellSec: Number(e.target.value) || 8 }))}
              className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg-muted">Transición (milisegundos)</label>
            <input
              type="number"
              min={100}
              max={5000}
              step={50}
              value={form.transitionMs}
              onChange={(e) => setForm((f) => ({ ...f, transitionMs: Number(e.target.value) || 900 }))}
              className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg-muted">Animación</label>
            <select
              value={form.animation}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  animation: e.target.value as PantallasForm['animation'],
                }))
              }
              className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
            >
              <option value="fade">Fundido (fade)</option>
              <option value="slide">Deslizar</option>
              <option value="zoom">Zoom suave</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-fg-muted">Ajuste en la TV</label>
            <select
              value={form.fit}
              onChange={(e) =>
                setForm((f) => ({ ...f, fit: e.target.value as PantallasForm['fit'] }))
              }
              className="w-full rounded-lg border border-hair bg-raised px-3 py-2 text-fg"
            >
              <option value="cover">Llenar pantalla (puede recortar bordes)</option>
              <option value="contain">Foto completa (puede dejar bandas)</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-hair-soft bg-raised/60 p-3 space-y-2">
          <p className="text-sm font-medium text-fg">Link para la TV</p>
          <p className="text-xs text-fg-faint">
            Abrí el link en una pestaña nueva en la tele (Chrome/Edge), poné pantalla completa (F11 o el botón)
            y listo. No hace falta iniciar sesión.
          </p>
          {publicUrl ? (
            <p className="break-all font-mono text-xs text-fg-muted">{publicUrl}</p>
          ) : (
            <p className="text-xs text-fg-muted">Guardá para generar el link.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openDisplay}
              disabled={!publicUrl}
              className="btn-brand rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            >
              Abrir en pestaña nueva
            </button>
            <button
              type="button"
              onClick={copyLink}
              disabled={!publicUrl}
              className="rounded-lg border border-hair px-3 py-2 text-sm text-fg disabled:opacity-50"
            >
              {copied ? 'Copiado' : 'Copiar link'}
            </button>
            <button
              type="button"
              onClick={regenerate}
              disabled={regenning || !form.shareToken}
              className="rounded-lg border border-hair px-3 py-2 text-sm text-fg-muted disabled:opacity-50"
            >
              {regenning ? 'Generando…' : 'Nuevo link'}
            </button>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-brand rounded-lg px-4 py-2 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar pantallas'}
        </button>
      </form>
    </div>
  );
}
