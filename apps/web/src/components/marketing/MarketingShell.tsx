'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BrandMark } from './BrandMark';

const NAV = [
  { href: '/#producto', label: 'Qué hace' },
  { href: '/#planes', label: 'Planes' },
  { href: '/#preguntas', label: 'Preguntas' },
];

export function MarketingShell({
  children,
  withNav = true,
}: {
  children: React.ReactNode;
  withNav?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mk min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--mk-line)] bg-[color-mix(in_srgb,var(--mk-paper)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <BrandMark />
          {withNav ? (
            <>
              <nav className="hidden items-center gap-6 text-sm text-[var(--mk-ink-2)] md:flex">
                {NAV.map((item) => (
                  <a key={item.href} href={item.href} className="hover:text-[var(--mk-ink)]">
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="hidden items-center gap-2 md:flex">
                <a
                  href="/#ingresar"
                  className="rounded-md px-3 py-2 text-sm font-medium text-[var(--mk-ink)] hover:bg-[color-mix(in_srgb,var(--mk-ink)_6%,transparent)]"
                >
                  Entrar
                </a>
                <Link
                  href="/register?plan=mostrador"
                  className="rounded-md bg-[var(--mk-red)] px-3.5 py-2 text-sm font-semibold text-[#f7f1e4] hover:bg-[var(--mk-red-dark)]"
                >
                  Probar 14 días
                </Link>
              </div>
              <button
                type="button"
                className="rounded-md border border-[var(--mk-line)] px-3 py-1.5 text-sm md:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                Menú
              </button>
            </>
          ) : (
            <Link href="/" className="text-sm text-[var(--mk-ink-2)] hover:text-[var(--mk-ink)]">
              Volver
            </Link>
          )}
        </div>
        {open && withNav ? (
          <div className="border-t border-[var(--mk-line)] px-4 py-3 md:hidden">
            <div className="flex flex-col gap-2 text-sm">
              {NAV.map((item) => (
                <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="py-1.5">
                  {item.label}
                </a>
              ))}
              <a href="/#ingresar" onClick={() => setOpen(false)} className="py-1.5">
                Entrar
              </a>
              <Link href="/register?plan=mostrador" className="rounded-md bg-[var(--mk-red)] px-3 py-2 text-center font-semibold text-[#f7f1e4]">
                Probar 14 días
              </Link>
            </div>
          </div>
        ) : null}
      </header>
      {children}
      <footer className="border-t border-[var(--mk-line)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-[var(--mk-ink-2)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>StockRápido · hecho para kioscos de Argentina</p>
          <div className="flex gap-4">
            <Link href="/login">Entrar</Link>
            <Link href="/register">Crear cuenta</Link>
            <a href="/#planes">Planes</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
