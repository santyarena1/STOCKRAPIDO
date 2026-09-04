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

/**
 * Estado persistido en localStorage.
 * El 3er valor `ready` pasa a true recién después de leer LS.
 * Las pantallas con fetch DEBEN esperar `ready` antes de pedir datos,
 * si no disparan con el default (p.ej. sin fechas = histórico) y después
 * llega la respuesta vieja pisando el filtro correcto.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const stored: unknown = JSON.parse(raw);
        if (!cancelled && isCompatibleValue(stored, initial)) setValue(stored);
      }
    } catch {
      // Un valor inválido no debe impedir que la página use su estado inicial.
    } finally {
      if (!cancelled) setReady(true);
    }
    return () => {
      cancelled = true;
    };
    // Solo rehidratar si cambia la key; `initial` es el default de esa key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage puede no estar disponible o no tener espacio; el estado local sigue funcionando.
    }
  }, [ready, key, value]);

  return [value, setValue, ready];
}

/** Fecha local YYYY-MM-DD (no usar toISOString: a la noche en AR salta al día siguiente). */
export function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
