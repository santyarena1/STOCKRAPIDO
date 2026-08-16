'use client';

import { MarketingShell } from '@/components/marketing/MarketingShell';
import { LoginForm } from '@/components/marketing/LoginForm';

export default function LoginPage() {
  return (
    <MarketingShell withNav={false}>
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
        <div className="w-full rounded-xl border border-[var(--mk-line)] bg-[var(--mk-paper-2)] p-6">
          <LoginForm />
        </div>
      </main>
    </MarketingShell>
  );
}
