'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { getApiBaseUrl } from '@/lib/api';

export default function SeguridadPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleLogoutAll = async () => {
    if (
      !confirm(
        '¿Cerrar sesión en todos los dispositivos? Vas a tener que volver a iniciar sesión en cada uno.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        await fetch(`${getApiBaseUrl()}/auth/logout-all`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      router.push('/');
    } catch {
      alert('No se pudo cerrar sesión en todos los dispositivos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seguridad"
        subtitle="Sesiones y acceso a tu cuenta."
      />

      <section className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="font-medium text-fg">Cerrar sesión en todos los dispositivos</h2>
          <p className="text-sm text-fg-faint mt-1">
            Si iniciaste sesión en otra PC, tablet o celular y querés invalidar esas sesiones, usá esta opción.
            El botón del menú lateral solo cierra sesión en este dispositivo.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleLogoutAll()}
          className="rounded-lg border border-crit/40 bg-[var(--crit-soft)] px-4 py-2 text-sm font-medium text-crit hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Cerrando…' : 'Cerrar sesión en todos los dispositivos'}
        </button>
      </section>
    </div>
  );
}
