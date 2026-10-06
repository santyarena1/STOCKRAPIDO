'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/fidelizacion', label: 'Resumen' },
  { href: '/fidelizacion/clientes', label: 'Clientes' },
  { href: '/fidelizacion/cargas', label: 'Cargas' },
  { href: '/fidelizacion/premios', label: 'Premios' },
  { href: '/fidelizacion/canjes', label: 'Canjes' },
  { href: '/fidelizacion/reglas', label: 'Reglas' },
  { href: '/fidelizacion/qr', label: 'QR del local' },
  { href: '/fidelizacion/configuracion', label: 'Configuración' },
];

export default function FidelizacionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6">
      <h1 className="text-2xl font-bold text-fg">Fidelización</h1>
      <p className="mb-4 mt-1 text-sm text-fg-muted">Puntos, cargas y premios del local. 10 puntos = $1 salvo que lo cambies en configuración.</p>
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {LINKS.map((link) => {
          const active = link.href === '/fidelizacion' ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${
                active ? 'bg-brand-highlight text-brand' : 'bg-raised text-fg-muted'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
