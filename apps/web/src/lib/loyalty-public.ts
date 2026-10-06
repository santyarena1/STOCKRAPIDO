import { getApiBaseUrl } from './env-urls';

const TOKEN_KEY = 'sr_loyalty_token';

export function loyaltyToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setLoyaltyToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearLoyaltyToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function loyaltyApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = loyaltyToken();
  const res = await fetch(new URL(path, getApiBaseUrl()).toString(), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = (body as { message?: unknown }).message;
    const message = Array.isArray(raw) ? raw.join(' · ') : typeof raw === 'string' ? raw : 'No se pudo completar.';
    throw new Error(message);
  }
  return body as T;
}
