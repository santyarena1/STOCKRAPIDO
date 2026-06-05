'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { api } from '@/lib/api';
import { STOCKRAPIDO_BRANDING_EVENT } from '@/lib/branding';

type Branding = {
  accentColor?: string;
  logoUrl?: string;
  appTitle?: string;
  linkColor?: string;
  primaryButtonColor?: string;
  focusRingColor?: string;
  navActiveColor?: string;
  selectionColor?: string;
  shadowTintColor?: string;
};

const OPTIONAL_BRAND_CSS: { key: keyof Branding; cssVar: string }[] = [
  { key: 'linkColor', cssVar: '--brand-link' },
  { key: 'primaryButtonColor', cssVar: '--brand-primary-btn' },
  { key: 'focusRingColor', cssVar: '--brand-focus' },
  { key: 'navActiveColor', cssVar: '--brand-nav-active' },
  { key: 'selectionColor', cssVar: '--brand-selection' },
  { key: 'shadowTintColor', cssVar: '--brand-shadow' },
];

const nav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/pos', label: 'POS' },
  { href: '/ventas', label: 'Historial de ventas' },
  { href: '/caja', label: 'Caja' },
  { href: '/productos', label: 'Productos' },
  { href: '/movimientos', label: 'Movimientos' },
  { href: '/compras', label: 'Compras' },
  { href: '/proveedores', label: 'Proveedores' },
  { href: '/sincronizaciones', label: 'Sincronizaciones' },
  { href: '/clientes', label: 'Clientes / Fiados' },
  { href: '/reportes', label: 'Reportes' },
  { href: '/promociones', label: 'Promociones' },
  { href: '/config', label: 'Configuración' },
  { href: '/usuarios', label: 'Usuarios' },
  { href: '/billing', label: 'Plan & Facturación' },
];

function applyCssBrandVars(br: Branding | undefined) {
  const root = document.documentElement;
  const base = br?.accentColor?.trim() || '#0ea5e9';
  root.style.setProperty('--brand-accent', base);
  root.style.setProperty('--accent', base);
  for (const { key, cssVar } of OPTIONAL_BRAND_CSS) {
    const raw = br?.[key];
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (v) root.style.setProperty(cssVar, v);
    else root.style.removeProperty(cssVar);
  }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [brand, setBrand] = useState<Branding>({});
  const [sidebarTitle, setSidebarTitle] = useState('StockRápido');

  const applyBranding = useCallback(() => {
    api<{ name: string; posConfig?: { branding?: Branding } }>('/business/me')
      .then((b) => {
        const br = b.posConfig?.branding;
        setBrand(br ?? {});
        setSidebarTitle(br?.appTitle?.trim() || b.name || 'StockRápido');
        applyCssBrandVars(br);
        document.title = `${br?.appTitle?.trim() || b.name || 'StockRápido'}`;
        const href = br?.logoUrl?.trim();
        const existingIcon = document.querySelector("link[data-stockrapido-icon='1']") as HTMLLinkElement | null;
        if (href && (href.startsWith('data:') || href.startsWith('http://') || href.startsWith('https://'))) {
          let link = existingIcon;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            link.setAttribute('data-stockrapido-icon', '1');
            document.head.appendChild(link);
          }
          link.href = href;
        } else if (existingIcon) {
          existingIcon.remove();
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    applyBranding();
    const onBrand = () => applyBranding();
    window.addEventListener(STOCKRAPIDO_BRANDING_EVENT, onBrand);
    return () => window.removeEventListener(STOCKRAPIDO_BRANDING_EVENT, onBrand);
  }, [ready, applyBranding]);

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando...</div>;

  const handleLogoutAll = async () => {
    const token = localStorage.getItem('accessToken');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4002';
    if (token) {
      await fetch(`${apiUrl}/auth/logout-all`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-slate-950 text-slate-200">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
        <div className="shrink-0 p-4 border-b border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg text-white min-w-0">
            {brand.logoUrl &&
            (brand.logoUrl.startsWith('data:') ||
              brand.logoUrl.startsWith('http://') ||
              brand.logoUrl.startsWith('https://')) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-lg object-cover border border-slate-700"
              />
            ) : null}
            <span className="truncate">{sidebarTitle}</span>
          </Link>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-4 py-2.5 text-sm border-r-2 border-transparent ${
                pathname === href || (href === '/compras' && pathname.startsWith('/compras'))
                  ? 'border-[color:var(--brand-nav-active,var(--brand-accent))] bg-[color-mix(in_srgb,var(--brand-nav-active,var(--brand-accent))_18%,transparent)] text-[color:var(--brand-nav-active,var(--brand-accent))]'
                  : 'hover:bg-slate-800'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="shrink-0 p-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleLogoutAll}
            className="w-full text-left px-4 py-2 text-sm text-slate-400 hover:text-red-400"
          >
            Cerrar sesión en todos los dispositivos
          </button>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 justify-end border-b border-slate-800/80 px-4 py-2">
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="btn-brand px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            Tutorial
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
      <TutorialOverlay open={showTutorial} onClose={() => setShowTutorial(false)} />
    </div>
  );
}
