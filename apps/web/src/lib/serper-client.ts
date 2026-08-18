import { api, getToken } from '@/lib/api';

export type SerperImageHit = {
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  source: string;
};

export function isApiRouteMissing(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/i.test(msg);
}

async function localSerper<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new Error(data.error || data.message || 'No se pudo usar Serper.');
  return data as T;
}

export async function fetchLocalSerperStatus() {
  try {
    return await localSerper<{ hasSerperKey: boolean }>('/api/serper/key');
  } catch {
    return { hasSerperKey: false };
  }
}

export async function saveSerperKey(key: string) {
  try {
    return await api<{ hasSerperKey?: boolean }>('/business/serper-key', {
      method: 'PATCH',
      body: JSON.stringify({ key }),
    });
  } catch (err) {
    if (!isApiRouteMissing(err)) throw err;
    return localSerper<{ hasSerperKey: boolean }>('/api/serper/key', {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
  }
}

export async function searchSerperImages(q: string, num = 8) {
  try {
    return await api<{ query?: string; images: SerperImageHit[] }>('/products/serper/search', {
      method: 'POST',
      body: JSON.stringify({ q, num }),
    });
  } catch (err) {
    if (!isApiRouteMissing(err)) throw err;
    return localSerper<{ images: SerperImageHit[] }>('/api/serper/search', {
      method: 'POST',
      body: JSON.stringify({ q, num }),
    });
  }
}

export async function assignProductImage(productId: string, imageUrl: string) {
  try {
    return await api<{ id: string; imageUrl: string | null }>('/products/serper/assign', {
      method: 'POST',
      body: JSON.stringify({ productId, imageUrl }),
    });
  } catch (err) {
    if (!isApiRouteMissing(err)) throw err;
    const updated = await api<{ id: string; imageUrl?: string | null }>(`/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ imageUrl: imageUrl || null }),
    });
    return { id: updated.id, imageUrl: updated.imageUrl ?? (imageUrl || null) };
  }
}

export async function autoAssignSerperPhotos(ids: string[], onlyMissing = true) {
  try {
    return await api<{ updated: number; skipped: { reason: string }[] }>('/products/serper/auto', {
      method: 'POST',
      body: JSON.stringify({ ids, onlyMissing }),
    });
  } catch (err) {
    if (!isApiRouteMissing(err)) throw err;
    return localAutoAssign(ids, onlyMissing);
  }
}

async function localAutoAssign(ids: string[], onlyMissing: boolean) {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 40);
  let updated = 0;
  const skipped: { reason: string }[] = [];
  for (const id of unique) {
    try {
      const product = await api<{ id: string; name: string; brand?: string | null; imageUrl?: string | null }>(`/products/${id}`);
      if (onlyMissing && product.imageUrl?.trim()) {
        skipped.push({ reason: 'Ya tiene imagen.' });
        continue;
      }
      const query = [product.name, product.brand].filter(Boolean).join(' ');
      const { images } = await searchSerperImages(query, 6);
      const first = images[0];
      if (!first) {
        skipped.push({ reason: 'Serper no encontró fotos.' });
        continue;
      }
      await assignProductImage(id, first.imageUrl);
      updated += 1;
    } catch (err) {
      skipped.push({ reason: err instanceof Error ? err.message : 'Error al buscar.' });
    }
  }
  return { updated, skipped };
}
