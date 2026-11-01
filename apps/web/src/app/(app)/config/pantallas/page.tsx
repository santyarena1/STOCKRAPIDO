'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUploader, MultiImageUploader } from '@/components/ImageUploader';
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
  logoUrl: string;
  logoXPct: number;
  logoYPct: number;
  logoWidthPct: number;
  logoOpacityPct: number;
};

const DEFAULTS: PantallasForm = {
  imageUrls: [],
  dwellSec: 8,
  transitionMs: 900,
  animation: 'fade',
  fit: 'cover',
  enabled: true,
  shareToken: '',
  logoUrl: '',
  logoXPct: 88,
  logoYPct: 88,
  logoWidthPct: 14,
  logoOpacityPct: 100,
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
    logoUrl: typeof p?.logoUrl === 'string' ? p.logoUrl : '',
    logoXPct: typeof p?.logoXPct === 'number' ? p.logoXPct : DEFAULTS.logoXPct,
    logoYPct: typeof p?.logoYPct === 'number' ? p.logoYPct : DEFAULTS.logoYPct,
    logoWidthPct: typeof p?.logoWidthPct === 'number' ? p.logoWidthPct : DEFAULTS.logoWidthPct,
    logoOpacityPct: typeof p?.logoOpacityPct === 'number' ? p.logoOpacityPct : DEFAULTS.logoOpacityPct,
  };
}

function moveItem(urls: string[], from: number, to: number) {
  if (to < 0 || to >= urls.length) return urls;
  const next = [...urls];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function LogoPlacementPreview({
  bgUrl,
  logoUrl,
  logoXPct,
  logoYPct,
  logoWidthPct,
  logoOpacityPct,
  fit,
  onMove,
}: {
  bgUrl?: string;
  logoUrl: string;
  logoXPct: number;
  logoYPct: number;
  logoWidthPct: number;
  logoOpacityPct: number;
  fit: 'cover' | 'contain';
  onMove: (xPct: number, yPct: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      onMove(Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)));
    },
    [onMove],
  );

  useEffect(() => {
    const onMoveWin = (e: PointerEvent) => {
      if (!dragging.current) return;
      setFromPointer(e.clientX, e.clientY);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener('pointermove', onMoveWin);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMoveWin);
      window.removeEventListener('pointerup', onUp);
    };
  }, [setFromPointer]);

  return (
    <div
      ref={stageRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-hair bg-black select-none touch-none"
      onPointerDown={(e) => {
        if (!logoUrl) return;
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        setFromPointer(e.clientX, e.clientY);
      }}
    >
      {bgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgUrl}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute inset-0 h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
          Vista previa 16:9 — subí una foto para ver el fondo
        </div>
      )}
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="Logo"
          draggable={false}
          className="absolute pointer-events-none object-contain drop-shadow-lg"
          style={{
            left: `${logoXPct}%`,
            top: `${logoYPct}%`,
            width: `${logoWidthPct}%`,
            opacity: logoOpacityPct / 100,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-end justify-center p-3 pointer-events-none">
          <span className="rounded bg-black/50 px-2 py-1 text-[11px] text-white/70">
            Subí un PNG sin fondo y arrastralo acá
          </span>
        </div>
      )}
      {logoUrl ? (
        <div className="absolute left-2 top-2 rounded bg-black/55 px-2 py-1 text-[10px] text-white/80 pointer-events-none">
          Arrastrá el logo para ubicarlo
        </div>
      ) : null}
    </div>
  );
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

  const onLogoMove = useCallback((xPct: number, yPct: number) => {
    setForm((f) => ({ ...f, logoXPct: Math.round(xPct * 10) / 10, logoYPct: Math.round(yPct * 10) / 10 }));
  }, []);

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
              logoUrl: form.logoUrl || '',
              logoXPct: form.logoXPct,
              logoYPct: form.logoYPct,
              logoWidthPct: form.logoWidthPct,
              logoOpacityPct: form.logoOpacityPct,
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

        <div className="space-y-3 rounded-xl border border-hair-soft bg-raised/40 p-3 sm:p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-fg">Logo encima (PNG sin fondo)</label>
            <p className="mb-2 text-xs text-fg-faint">
              Ideal PNG transparente (publicidad del lugar). Se ve sobre todas las fotos. Arrastralo en la
              vista previa para ubicarlo; con el tamaño y la opacidad lo afinás.
            </p>
            <ImageUploader
              value={form.logoUrl}
              onChange={(url) => setForm((f) => ({ ...f, logoUrl: url }))}
              maxPx={1600}
              quality={0.92}
              transparentBg
              label="Subir logo PNG"
              previewClass="h-16 w-28 object-contain bg-transparent"
            />
          </div>

          <LogoPlacementPreview
            bgUrl={form.imageUrls[0]}
            logoUrl={form.logoUrl}
            logoXPct={form.logoXPct}
            logoYPct={form.logoYPct}
            logoWidthPct={form.logoWidthPct}
            logoOpacityPct={form.logoOpacityPct}
            fit={form.fit}
            onMove={onLogoMove}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-fg-muted">
                Tamaño ({form.logoWidthPct}% del ancho)
              </label>
              <input
                type="range"
                min={4}
                max={45}
                step={0.5}
                value={form.logoWidthPct}
                onChange={(e) => setForm((f) => ({ ...f, logoWidthPct: Number(e.target.value) }))}
                className="w-full"
                disabled={!form.logoUrl}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">
                Opacidad ({form.logoOpacityPct}%)
              </label>
              <input
                type="range"
                min={10}
                max={100}
                step={1}
                value={form.logoOpacityPct}
                onChange={(e) => setForm((f) => ({ ...f, logoOpacityPct: Number(e.target.value) }))}
                className="w-full"
                disabled={!form.logoUrl}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { label: 'Arriba izq.', x: 12, y: 12 },
                { label: 'Arriba der.', x: 88, y: 12 },
                { label: 'Centro', x: 50, y: 50 },
                { label: 'Abajo izq.', x: 12, y: 88 },
                { label: 'Abajo der.', x: 88, y: 88 },
              ] as const
            ).map((spot) => (
              <button
                key={spot.label}
                type="button"
                disabled={!form.logoUrl}
                onClick={() => setForm((f) => ({ ...f, logoXPct: spot.x, logoYPct: spot.y }))}
                className="rounded-lg border border-hair px-2.5 py-1.5 text-xs text-fg disabled:opacity-40"
              >
                {spot.label}
              </button>
            ))}
          </div>
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
