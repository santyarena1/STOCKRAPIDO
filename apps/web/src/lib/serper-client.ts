import { api, getToken } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/env-urls';

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

export async function saveSerperKey(key: string) {
  const normalized = key.trim();
  try {
    writeStoredSerperKey(normalized);
  } catch {
    throw new Error('El navegador no dejó guardar la key. Probá sin modo privado.');
  }

  const token = getToken();
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
      return { ...updated, hasSerperKey: Boolean(normalized) };
    }
  } catch {
    // La API de Vercel todavía no tiene esta ruta: la key queda en este dispositivo.
  }
  return { hasSerperKey: Boolean(normalized) };
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
      throw err instanceof Error ? err : new Error('Cargá la API key de Serper en Configuración → Imágenes Serper.');
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
  try {
    return await api<{ id: string; imageUrl: string | null }>('/products/serper/assign', {
      method: 'POST',
      body: JSON.stringify({ productId, imageUrl }),
    });
  } catch {
    const updated = await api<{ id: string; imageUrl?: string | null }>(`/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ imageUrl: imageUrl || null }),
    });
    return { id: updated.id, imageUrl: updated.imageUrl ?? (imageUrl || null) };
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
      return await api<{ updated: number; skipped: { reason: string }[] }>('/products/serper/auto', {
        method: 'POST',
        body: JSON.stringify({ ids: unique.map((p) => p.id), onlyMissing }),
      });
    } catch {
      // La API no tiene Serper: seguimos en el navegador.
    }
  }
  return localAutoAssign(unique, onlyMissing, onProgress);
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
      const { images } = await searchSerperImages(query, 4);
      const first = images[0];
      if (!first) {
        skipped.push({ reason: 'Serper no encontró fotos.' });
        continue;
      }
      await assignProductImage(product.id, first.imageUrl);
      updated += 1;
    } catch (err) {
      skipped.push({ reason: err instanceof Error ? err.message : 'Error al buscar.' });
    }
    await sleep(220);
  }
  return { updated, skipped };
}
