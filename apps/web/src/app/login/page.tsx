'use client';

import { MarketingShell } from '@/components/marketing/MarketingShell';
import { LoginForm } from '@/components/marketing/LoginForm';

export default function LoginPage() {
  return (
    <MarketingShell withNav={false}>
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
        <div className="w-full rounded-[1.75rem] border border-[var(--mk-line)] bg-white p-6 shadow-[0_20px_50px_-28px_rgba(227,28,35,0.35)]">
          <LoginForm />
        </div>
      </main>
    </MarketingShell>
  );
}
