/**
 * URLs de producción: web y API en Vercel, Neon como DB.
 * Proyecto web (apps/web): NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL
 * Proyecto API (apps/api): WEB_URL = URL del frontend
 */

function trimBase(url: string) {
  return url.trim().replace(/\/$/, '');
}

/** Base de la API (proyecto Vercel de apps/api). */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (fromEnv?.trim()) return trimBase(fromEnv);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_API_URL no está configurada en Vercel (proyecto web)');
  }
  return 'http://localhost:4002';
}

/** Origen del frontend (proyecto Vercel de apps/web). */
export function getPublicAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv?.trim()) return trimBase(fromEnv);
  if (typeof window !== 'undefined') return trimBase(window.location.origin);
  return '';
}

/** Link compartible del catálogo de figuritas. */
export function getPublicFiguritasCatalogUrl(token: string): string {
  const base = getPublicAppUrl();
  if (!base) return `/public/figuritas/${token}`;
  return `${base}/public/figuritas/${token}`;
}
