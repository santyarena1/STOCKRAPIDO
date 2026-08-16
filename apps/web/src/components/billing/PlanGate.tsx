'use client';

import Link from 'next/link';
import { FEATURE_LABELS, planThatIncludes, type PlanFeature } from '@/lib/plans';
import { useBilling } from './BillingProvider';

export function PlanGate({ feature, children }: { feature: PlanFeature; children: React.ReactNode }) {
  const { loading, can, data } = useBilling();
  if (loading) return <>{children}</>;
  if (can(feature)) return <>{children}</>;
  const needed = planThatIncludes(feature);
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-hair-soft bg-surface p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Plan {data?.plan.name ?? 'actual'}</p>
      <h2 className="mt-2 text-xl font-semibold text-fg">{FEATURE_LABELS[feature]} pide el plan {needed.name}</h2>
      <p className="mt-2 text-sm text-fg-muted">
        Esta parte del sistema no está en tu plan. Podés seguir usando el resto del kiosco; para abrirla, pasate a {needed.name}.
      </p>
      <Link href="/billing" className="btn-brand mt-5 inline-flex rounded-lg px-4 py-2.5 text-sm font-semibold">
        Ver planes y precios
      </Link>
    </div>
  );
}
