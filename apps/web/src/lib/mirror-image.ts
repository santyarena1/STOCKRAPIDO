import { getToken } from '@/lib/api';

function isAlreadyHosted(url: string) {
  return /vercel-storage\.com|\.public\.blob\.vercel-storage\.com/i.test(url) || url.startsWith('data:image/');
}

/**
 * Espeja una URL remota (Serper) a Vercel Blob para que no se rompa después.
 */
export async function mirrorRemoteImage(url: string): Promise<string> {
  const source = String(url ?? '').trim();
  if (!source) return source;
  if (isAlreadyHosted(source)) return source;
  if (!/^https?:\/\//i.test(source)) return source;

  const token = getToken();
  const res = await fetch('/api/images/mirror', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url: source }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'No se pudo guardar la imagen de Serper.');
  }
  return data.url;
}
