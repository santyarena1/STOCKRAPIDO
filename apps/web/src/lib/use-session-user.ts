'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  businessId: string;
  isPlatformAdmin?: boolean;
};

export function useSessionUser() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stored: SessionUser | null = null;
    try {
      stored = JSON.parse(localStorage.getItem('user') || 'null') as SessionUser | null;
    } catch {
      stored = null;
    }
    if (stored) setUser(stored);

    api<SessionUser>('/auth/me')
      .then((me) => {
        setUser(me);
        localStorage.setItem('user', JSON.stringify(me));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, isPlatformAdmin: Boolean(user?.isPlatformAdmin) };
}
