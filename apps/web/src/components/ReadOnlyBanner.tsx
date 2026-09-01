'use client';

import { useBilling } from '@/components/billing/BillingProvider';
import Link from 'next/link';

const MESSAGES: Record<string, string> = {
  trial_expired: 'Tu prueba de 14 días terminó. Podés seguir viendo tu información, pero no registrar ventas ni editar datos hasta activar un plan.',
  pending_payment: 'Tenés un pago pendiente. Regularizá tu plan para volver a operar con normalidad.',
  past_due: 'Tu plan está vencido. Actualizá el pago para desbloquear la carga de datos.',
  canceled: 'Tu cuenta está cancelada. Solo podés consultar información histórica.',
};

export function ReadOnlyBanner() {
  const { data, loading } = useBilling();
  if (loading || !data || data.accessMode !== 'read_only') return null;

  const msg = MESSAGES[data.accessReason || ''] || 'Tu cuenta está en modo solo lectura.';

  return (
    <div className="border-b border-amber-600/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>{msg}</p>
        <Link href="/billing" className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400">
          Ver planes y activar
        </Link>
      </div>
    </div>
  );
}
