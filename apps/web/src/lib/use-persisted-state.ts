'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

function isCompatibleValue<T>(stored: unknown, initial: T): stored is T {
  if (initial === null) return stored !== undefined;
  if (Array.isArray(initial)) return Array.isArray(stored);
  if (initial !== null && typeof initial === 'object') {
    return stored !== null && typeof stored === 'object' && !Array.isArray(stored);
  }
  return typeof stored === typeof initial;
}

export function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const stored: unknown = JSON.parse(raw);
        if (isCompatibleValue(stored, initial)) setValue(stored);
      }
    } catch {
      // Un valor inválido no debe impedir que la página use su estado inicial.
    } finally {
      setHydrated(true);
    }
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage puede no estar disponible o no tener espacio; el estado local sigue funcionando.
    }
  }, [hydrated, key, value]);

  return [value, setValue];
}
