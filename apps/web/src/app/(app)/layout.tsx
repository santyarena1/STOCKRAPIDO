'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TutorialOverlay } from '@/components/TutorialOverlay';

const nav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/pos', label: 'POS' },
  { href: '/ventas', label: 'Historial de ventas' },
  { href: '/caja', label: 'Caja' },
  { href: '/productos', label: 'Productos' },
  { href: '/movimientos', label: 'Movimientos' },
  { href: '/compras', label: 'Compras' },
  { href: '/proveedores', label: 'Proveedores' },
  { href: '/clientes', label: 'Clientes / Fiados' },
  { href: '/reportes', label: 'Reportes' },
  { href: '/promociones', label: 'Promociones' },
  { href: '/config', label: 'Configuración' },
  { href: '/usuarios', label: 'Usuarios' },
  { href: '/billing', label: 'Plan & Facturación' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Rutas bajo (app) requieren login
  const [ready, setReady] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando...</div>;

  const handleLogoutAll = async () => {
    const token = localStorage.getItem('accessToken');
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4002';
    if (token) {
      await fetch(`${api}/auth/logout-all`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <aside className="w-56 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <Link href="/dashboard" className="font-bold text-lg text-white">StockRápido</Link>
        </div>
        <nav className="flex-1 overflow-auto py-2">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-4 py-2.5 text-sm ${pathname === href ? 'bg-sky-600/20 text-sky-400 border-r-2 border-sky-500' : 'hover:bg-slate-800'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleLogoutAll}
            className="w-full text-left px-4 py-2 text-sm text-slate-400 hover:text-red-400"
          >
            Cerrar sesión en todos los dispositivos
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-auto">
        <div className="flex justify-end px-4 py-2 border-b border-slate-800/80 shrink-0">
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="px-3 py-1.5 rounded-lg bg-sky-600/80 text-white text-sm font-medium hover:bg-sky-500"
          >
            Tutorial
          </button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
      <TutorialOverlay open={showTutorial} onClose={() => setShowTutorial(false)} />
    </div>
  );
}
