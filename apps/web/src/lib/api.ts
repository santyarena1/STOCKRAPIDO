import { getApiBaseUrl } from './env-urls';

export { getApiBaseUrl };

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export async function api<T>(
  path: string,
  options?: RequestInit & { params?: Record<string, string | undefined> },
): Promise<T> {
  const token = getToken();
  const url = new URL(path, getApiBaseUrl());
  if (options?.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const { params, ...init } = options ?? {};
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || res.statusText);
  }
  return res.json() as Promise<T>;
}

/** API sin autenticación (catálogo público de figuritas). */
export async function publicApi<T>(path: string, options?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const url = new URL(path, base);
  const res = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || res.statusText);
  }
  return res.json() as Promise<T>;
}

/** POST multipart (no fuerza Content-Type: application/json). */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options?: { params?: Record<string, string | undefined> },
): Promise<T> {
  const token = getToken();
  const url = new URL(path, getApiBaseUrl());
  if (options?.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || res.statusText);
  }
  return res.json() as Promise<T>;
}
