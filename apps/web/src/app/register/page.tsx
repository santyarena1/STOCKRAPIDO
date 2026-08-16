'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { RegisterForm } from '@/components/marketing/RegisterForm';

function RegisterInner() {
  const params = useSearchParams();
  return <RegisterForm initialPlan={params.get('plan') ?? undefined} />;
}

export default function RegisterPage() {
  return (
    <MarketingShell withNav={false}>
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
        <div className="w-full rounded-xl border border-[var(--mk-line)] bg-[var(--mk-paper-2)] p-6">
          <Suspense fallback={<p className="text-sm text-[var(--mk-ink-2)]">Cargando…</p>}>
            <RegisterInner />
          </Suspense>
        </div>
      </main>
    </MarketingShell>
  );
}
