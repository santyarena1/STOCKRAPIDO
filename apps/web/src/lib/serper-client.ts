import { api, getToken } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/env-urls';
import { mirrorRemoteImage } from '@/lib/mirror-image';

export type SerperImageHit = {
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  source: string;
};

const STORAGE_KEY = 'sr-serper-key';

export function isApiRouteMissing(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/i.test(msg);
}

export function getStoredSerperKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function hasStoredSerperKey() {
  return Boolean(getStoredSerperKey());
}

function writeStoredSerperKey(key: string) {
  if (typeof window === 'undefined') return;
  const normalized = key.trim();
  if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
  else localStorage.removeItem(STORAGE_KEY);
}

export async function fetchLocalSerperStatus() {
  return { hasSerperKey: hasStoredSerperKey() };
}

export type SaveSerperResult = {
  hasSerperKey: boolean;
  /** true si quedó en el negocio (cualquier PC). */
  savedOnBusiness: boolean;
  /** true si solo quedó en este navegador. */
  savedLocalOnly: boolean;
};

export async function saveSerperKey(key: string): Promise<SaveSerperResult> {
  const normalized = key.trim();
  try {
    writeStoredSerperKey(normalized);
  } catch {
    throw new Error('El navegador no dejó guardar la key. Probá sin modo privado.');
  }

  const token = getToken();
  // Cookie del proxy Next (mismo dispositivo / dominio).
  try {
    await fetch('/api/serper/key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ key: normalized }),
    });
  } catch {
    // no bloquea
  }

  // 1) Ruta dedicada
  try {
    const url = new URL('/business/serper-key', getApiBaseUrl());
    const res = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ key: normalized }),
    });
    if (res.ok) {
      const updated = (await res.json().catch(() => ({}))) as { hasSerperKey?: boolean };
      return {
        hasSerperKey: Boolean(updated.hasSerperKey ?? normalized),
        savedOnBusiness: true,
        savedLocalOnly: false,
      };
    }
  } catch {
    // seguir con fallback
  }

  // 2) Fallback: posConfig vía /business/me (funciona en otra PC)
  try {
    const updated = await api<{ hasSerperKey?: boolean }>('/business/me', {
      method: 'PATCH',
      body: JSON.stringify({ posConfig: { serperKey: normalized } }),
    });
    return {
      hasSerperKey: Boolean(updated.hasSerperKey ?? normalized),
      savedOnBusiness: true,
      savedLocalOnly: false,
    };
  } catch {
    // Solo localStorage: no va a andar en otra PC.
  }

  return {
    hasSerperKey: Boolean(normalized),
    savedOnBusiness: false,
    savedLocalOnly: Boolean(normalized),
  };
}

async function searchViaWeb(q: string, num: number, key: string) {
  const token = getToken();
  const res = await fetch('/api/serper/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ q, num, key }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; images?: SerperImageHit[] };
  if (!res.ok) throw new Error(data.error || data.message || 'No se pudo buscar en Serper.');
  return { images: data.images || [] };
}

export async function searchSerperImages(q: string, num = 8) {
  const key = getStoredSerperKey();
  try {
    return await api<{ query?: string; images: SerperImageHit[] }>('/products/serper/search', {
      method: 'POST',
      body: JSON.stringify({ q, num }),
    });
  } catch (err) {
    if (!key) {
      throw err instanceof Error
        ? err
        : new Error('Cargá la API key de Serper en Configuración → Imágenes Serper (tiene que guardarse en el negocio para usarla en otra PC).');
    }
    try {
      return await searchViaWeb(q, num, key);
    } catch (webErr) {
      throw webErr instanceof Error ? webErr : err;
    }
  }
}

export type PhotoProduct = {
  id: string;
  name: string;
  brand?: string | null;
  imageUrl?: string | null;
};

function hasPhoto(product: PhotoProduct) {
  return Boolean(product.imageUrl?.trim());
}

export async function assignProductImage(productId: string, imageUrl: string) {
  const raw = String(imageUrl ?? '').trim();
  // Nunca guardar hotlinks de Serper/Google: se rompen. Espejamos a Blob.
  let hosted = '';
  if (raw) {
    if (/vercel-storage\.com|data:image\//i.test(raw)) hosted = raw;
    else hosted = await mirrorRemoteImage(raw);
  }
  try {
    return await api<{ id: string; imageUrl: string | null }>('/products/serper/assign', {
      method: 'POST',
      body: JSON.stringify({ productId, imageUrl: hosted }),
    });
  } catch {
    const updated = await api<{ id: string; imageUrl?: string | null }>(`/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ imageUrl: hosted || null }),
    });
    return { id: updated.id, imageUrl: updated.imageUrl ?? (hosted || null) };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function autoAssignSerperPhotos(
  products: PhotoProduct[],
  onlyMissing = true,
  onProgress?: (done: number, total: number, name: string) => void,
) {
  const unique = [...new Map(products.filter((p) => p.id).map((p) => [p.id, p])).values()];
  if (onlyMissing && unique.every(hasPhoto)) {
    return { updated: 0, skipped: unique.map(() => ({ reason: 'Ya tiene imagen.' })) };
  }
  if (!hasStoredSerperKey()) {
    try {
      const result = await api<{ updated: number; skipped: { reason: string }[] }>('/products/serper/auto', {
        method: 'POST',
        body: JSON.stringify({ ids: unique.map((p) => p.id), onlyMissing }),
      });
      const reasons = (result.skipped || []).map((s) => s.reason);
      const keyMissing = reasons.some((r) => /api key de Serper|Cargá la API key/i.test(r));
      if (result.updated === 0 && keyMissing) {
        throw new Error(
          'Falta la API key de Serper en el negocio. Andá a Configuración → Imágenes Serper, cargala y guardala (tiene que quedar en el negocio, no solo en este navegador).',
        );
      }
      return result;
    } catch (err) {
      if (err instanceof Error && /Falta la API key|Cargá la API key|Cannot POST/i.test(err.message)) {
        throw err;
      }
      if (isApiRouteMissing(err)) {
        // API vieja sin Serper: seguimos en el navegador si hay key local.
      } else if (err instanceof Error && /Serper|API key/i.test(err.message)) {
        throw err;
      }
      // Si no hay key local tampoco, el error de abajo es claro.
    }
  }
  return localAutoAssign(unique, onlyMissing, onProgress);
}

function summarizeSkipReasons(skipped: { reason: string }[]) {
  const counts = new Map<string, number>();
  for (const item of skipped) {
    const reason = item.reason?.trim() || 'Omitido';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, n]) => (n > 1 ? `${reason} (${n})` : reason))
    .slice(0, 4)
    .join(' · ');
}

export function formatSerperAutoResult(result: { updated: number; skipped: { reason: string }[] }) {
  const parts = [`${result.updated} imágenes aplicadas`];
  if (result.skipped.length) {
    const detail = summarizeSkipReasons(result.skipped);
    parts.push(`${result.skipped.length} omitidos${detail ? `: ${detail}` : ''}`);
  }
  return parts.join(' · ');
}

async function localAutoAssign(
  products: PhotoProduct[],
  onlyMissing: boolean,
  onProgress?: (done: number, total: number, name: string) => void,
) {
  const skipped: { reason: string }[] = [];
  const queue = onlyMissing ? products.filter((p) => !hasPhoto(p)) : products;
  if (onlyMissing) {
    skipped.push(...products.filter(hasPhoto).map(() => ({ reason: 'Ya tiene imagen.' })));
  }
  if (!queue.length) {
    return { updated: 0, skipped };
  }
  let updated = 0;
  for (let i = 0; i < queue.length; i += 1) {
    const product = queue[i];
    onProgress?.(i + 1, queue.length, product.name);
    try {
      const query = [product.name, product.brand].filter(Boolean).join(' ');
      if (query.trim().length < 2) {
        skipped.push({ reason: 'Sin nombre para buscar.' });
        continue;
      }
      const { images } = await searchSerperImages(query, 6);
      if (!images.length) {
        skipped.push({ reason: `Sin fotos para “${product.name}”.` });
        continue;
      }
      let saved = false;
      let lastReason = 'Imagen rota / no se pudo guardar.';
      for (const hit of images.slice(0, 4)) {
        for (const candidate of [hit.imageUrl, hit.thumbnailUrl]) {
          if (!candidate) continue;
          try {
            await assignProductImage(product.id, candidate);
            saved = true;
            break;
          } catch (err) {
            lastReason = err instanceof Error ? err.message : lastReason;
          }
        }
        if (saved) break;
      }
      if (!saved) {
        skipped.push({ reason: lastReason });
        continue;
      }
      updated += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Error al buscar.';
      if (i === 0 && /api key de Serper|Cargá la API key/i.test(reason)) {
        throw new Error(
          'Falta la API key de Serper. Andá a Configuración → Imágenes Serper y guardala en el negocio.',
        );
      }
      skipped.push({ reason });
    }
    await sleep(220);
  }
  return { updated, skipped };
}
