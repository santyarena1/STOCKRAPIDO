'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';

type PantallasPayload = {
  businessName: string;
  imageUrls: string[];
  dwellSec: number;
  transitionMs: number;
  animation: 'fade' | 'slide' | 'zoom';
  fit: 'cover' | 'contain';
  logoUrl?: string;
  logoXPct: number;
  logoYPct: number;
  logoWidthPct: number;
  logoOpacityPct: number;
};

export default function PublicPantallasPage() {
  const params = useParams();
  const token = String(params.token ?? '');
  const [data, setData] = useState<PantallasPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await publicApi<PantallasPayload>(
          `/public/pantallas/${encodeURIComponent(token)}`,
        );
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No disponible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const urls = data?.imageUrls ?? [];
  const dwellMs = Math.max(2000, (data?.dwellSec ?? 8) * 1000);
  const transitionMs = Math.max(100, data?.transitionMs ?? 900);
  const animation = data?.animation ?? 'fade';
  const fit = data?.fit ?? 'cover';
  const logoUrl = data?.logoUrl?.trim() || '';

  useEffect(() => {
    if (urls.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx((current) => (current + 1) % urls.length);
    }, dwellMs);
    return () => window.clearInterval(id);
  }, [urls.length, dwellMs]);

  useEffect(() => {
    let hideTimer: number | undefined;
    const onMove = () => {
      setCursorHidden(false);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setCursorHidden(true), 2500);
    };
    onMove();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchstart', onMove);
    return () => {
      window.clearTimeout(hideTimer);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchstart', onMove);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* TV browsers a veces piden gesto explícito */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F' || e.key === 'Enter') {
        e.preventDefault();
        void toggleFullscreen();
      }
      if (e.key === 'ArrowRight' && urls.length) {
        setIdx((i) => (i + 1) % urls.length);
      }
      if (e.key === 'ArrowLeft' && urls.length) {
        setIdx((i) => (i - 1 + urls.length) % urls.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFullscreen, urls.length]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white/50">
        Cargando pantallas…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-black px-6 text-center text-white/70">
        <p className="text-lg">{error || 'Pantalla no encontrada'}</p>
      </div>
    );
  }

  if (urls.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-black px-6 text-center text-white/70">
        <p className="text-xl">Todavía no hay fotos cargadas</p>
        <p className="text-sm text-white/40">Subilas en Configuración → Pantallas</p>
      </div>
    );
  }

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden bg-black text-white ${cursorHidden ? 'cursor-none' : ''}`}
      onDoubleClick={() => void toggleFullscreen()}
    >
      {urls.map((url, i) => {
        const active = i === idx;
        let transform = '';
        if (animation === 'slide') {
          transform = active ? 'translateX(0)' : 'translateX(6%)';
        } else if (animation === 'zoom') {
          transform = active ? 'scale(1)' : 'scale(1.06)';
        }

        return (
          <div
            key={`${url}-${i}`}
            className="absolute inset-0 ease-in-out"
            style={{
              opacity: active ? 1 : 0,
              zIndex: active ? 10 : 0,
              transform,
              transitionProperty: 'opacity, transform',
              transitionDuration: `${transitionMs}ms`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              draggable={false}
              className={`h-full w-full select-none ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
            />
          </div>
        );
      })}

      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute z-30 object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
          style={{
            left: `${data.logoXPct}%`,
            top: `${data.logoYPct}%`,
            width: `${data.logoWidthPct}%`,
            opacity: Math.min(1, Math.max(0, data.logoOpacityPct / 100)),
            transform: 'translate(-50%, -50%)',
          }}
        />
      ) : null}

      {!isFs && (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="absolute bottom-4 right-4 z-40 rounded-full bg-black/60 px-4 py-2 text-sm text-white/90 backdrop-blur hover:bg-black/80"
        >
          Pantalla completa
        </button>
      )}
    </div>
  );
}
