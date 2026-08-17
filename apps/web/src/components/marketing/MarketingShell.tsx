'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BrandMark } from './BrandMark';

const NAV = [
  { href: '/#producto', label: 'El sistema' },
  { href: '/#porque', label: 'Por qué' },
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
    <div className="mk min-h-screen pb-20">
      <header className="sticky top-0 z-30 border-b border-[var(--mk-line)] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <BrandMark />
          {withNav ? (
            <>
              <nav className="hidden flex-1 items-center justify-center gap-7 text-sm font-semibold text-[var(--mk-ink-2)] md:flex">
                {NAV.map((item) => (
                  <a key={item.href} href={item.href} className="hover:text-[var(--mk-red)]">
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="hidden items-center gap-2 md:flex">
                <a href="/#ingresar" className="rounded-full px-4 py-2 text-sm font-bold text-[var(--mk-ink)] hover:bg-[#fff4f0]">
                  Ingresar
                </a>
                <a href="/#planes" className="mk-cta !px-5 !py-2 text-sm">
                  Contratar un plan
                </a>
              </div>
              <button
                type="button"
                className="rounded-full border border-[var(--mk-line)] px-3 py-1.5 text-sm font-bold md:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                Menú
              </button>
            </>
          ) : (
            <Link href="/" className="text-sm font-bold text-[var(--mk-ink-2)] hover:text-[var(--mk-ink)]">
              Volver
            </Link>
          )}
        </div>
        {open && withNav ? (
          <div className="border-t border-[var(--mk-line)] px-4 py-3 md:hidden">
            <div className="flex flex-col gap-2 text-sm font-semibold">
              {NAV.map((item) => (
                <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="py-1.5">
                  {item.label}
                </a>
              ))}
              <a href="/#ingresar" onClick={() => setOpen(false)} className="py-1.5">
                Ingresar
              </a>
              <a href="/#planes" onClick={() => setOpen(false)} className="mk-cta mt-1 text-center">
                Contratar un plan
              </a>
            </div>
          </div>
        ) : null}
      </header>
      {children}
      {withNav ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--mk-line)] bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <a href="/#planes" className="mk-cta w-full">
            Contratar un plan
          </a>
        </div>
      ) : null}
      <footer className="border-t border-[var(--mk-line)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-[var(--mk-ink-2)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-semibold">StockRápido · un solo sistema para el kiosco</p>
          <div className="flex flex-wrap gap-4 font-bold">
            <a href="/#planes">Contratar</a>
            <Link href="/login">Ingresar</Link>
            <Link href="/register">Crear cuenta</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
