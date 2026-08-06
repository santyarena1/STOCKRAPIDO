'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Moon,
  Sun,
  Truck,
} from 'lucide-react';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { api } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/env-urls';
import { STOCKRAPIDO_BRANDING_EVENT } from '@/lib/branding';
import { cn } from '@/lib/cn';

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

const PINNED = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pos', label: 'POS', icon: ShoppingCart },
];

const GROUPS = [
  {
    title: 'Ventas y caja',
    icon: Receipt,
    items: [
      { href: '/ventas', label: 'Historial de ventas' },
      { href: '/caja', label: 'Caja' },
      { href: '/clientes', label: 'Clientes / Fiados' },
    ],
  },
  {
    title: 'Inventario',
    icon: Package,
    items: [
      { href: '/productos', label: 'Productos' },
      { href: '/movimientos', label: 'Movimientos' },
      { href: '/promociones', label: 'Promociones' },
      { href: '/figuritas', label: 'Figuritas Mundial' },
    ],
  },
  {
    title: 'Abastecimiento',
    icon: Truck,
    items: [
      { href: '/compras', label: 'Compras' },
      { href: '/proveedores', label: 'Proveedores' },
      { href: '/sincronizaciones', label: 'Sincronizaciones' },
    ],
  },
  {
    title: 'Análisis',
    icon: BarChart3,
    items: [{ href: '/reportes', label: 'Reportes' }],
  },
  {
    title: 'Administración',
    icon: Settings,
    items: [
      { href: '/config', label: 'Configuración' },
      { href: '/usuarios', label: 'Usuarios' },
      { href: '/billing', label: 'Plan & Facturación' },
    ],
  },
];

const SIDEBAR_GROUPS_KEY = 'sr-sidebar-groups';

function isActivePath(pathname: string, href: string) {
  return (
    pathname === href ||
    (href === '/compras' && pathname.startsWith('/compras')) ||
    (href === '/figuritas' && pathname.startsWith('/figuritas'))
  );
}

function activeGroups(pathname: string) {
  return Object.fromEntries(
    GROUPS.map((group) => [
      group.title,
      group.items.some(({ href }) => isActivePath(pathname, href)),
    ]),
  );
}

function applyCssBrandVars(br: Branding | undefined) {
  const root = document.documentElement;
  const base = br?.accentColor?.trim() || '#DC2626';
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => activeGroups(pathname));
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

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

  useEffect(() => {
    let stored: Record<string, boolean> = {};
    try {
      stored = JSON.parse(localStorage.getItem(SIDEBAR_GROUPS_KEY) || '{}') as Record<string, boolean>;
    } catch {
      stored = {};
    }
    const active = activeGroups(pathname);
    setOpenGroups(
      Object.fromEntries(
        GROUPS.map((group) => [group.title, active[group.title] || stored[group.title] || false]),
      ),
    );
    setGroupsLoaded(true);
  }, [pathname]);

  useEffect(() => {
    if (!groupsLoaded) return;
    localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(openGroups));
  }, [groupsLoaded, openGroups]);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-app text-fg-muted">Cargando...</div>;

  const handleLogoutAll = async () => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      await fetch(`${getApiBaseUrl()}/auth/logout-all`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sr-theme', next);
    setTheme(next);
  };

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-app text-fg">
      <aside className="flex w-60 shrink-0 flex-col border-r border-hair-soft bg-surface">
        <div className="shrink-0 border-b border-hair-soft p-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 text-lg font-bold text-fg">
            {brand.logoUrl &&
            (brand.logoUrl.startsWith('data:') ||
              brand.logoUrl.startsWith('http://') ||
              brand.logoUrl.startsWith('https://')) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-lg border border-hair object-cover"
              />
            ) : null}
            <span className="truncate">{sidebarTitle}</span>
          </Link>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <div className="space-y-1">
            {PINNED.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border-r-2 border-transparent px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-[color:var(--brand-nav-active,var(--brand-accent))] bg-[color-mix(in_srgb,var(--brand-nav-active,var(--brand-accent))_18%,transparent)] text-[color:var(--brand-nav-active,var(--brand-accent))]'
                      : 'text-fg-muted hover:bg-raised hover:text-fg',
                  )}
                >
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-current' : 'text-fg-muted')} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-4 space-y-1">
            {GROUPS.map(({ title, icon: Icon, items }) => {
              const open = openGroups[title] ?? false;
              const groupActive = items.some(({ href }) => isActivePath(pathname, href));
              return (
                <div key={title}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenGroups((current) => ({ ...current, [title]: !open }))}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-raised hover:text-fg',
                      groupActive
                        ? 'text-[color:var(--brand-nav-active,var(--brand-accent))]'
                        : 'text-fg-muted',
                    )}
                  >
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', groupActive ? 'text-current' : 'text-fg-muted')} />
                    <span className="min-w-0 flex-1 truncate">{title}</span>
                    <ChevronDown
                      className={cn('h-4 w-4 shrink-0 text-fg-faint transition-transform', open && 'rotate-180')}
                    />
                  </button>
                  {open ? (
                    <div className="ml-5 mt-0.5 space-y-0.5 border-l border-hair-soft pl-3">
                      {items.map(({ href, label }) => {
                        const active = isActivePath(pathname, href);
                        return (
                          <Link
                            key={href}
                            href={href}
                            className={cn(
                              'flex items-center rounded-lg border-r-2 border-transparent px-3 py-2 text-sm transition-colors',
                              active
                                ? 'border-[color:var(--brand-nav-active,var(--brand-accent))] bg-[color-mix(in_srgb,var(--brand-nav-active,var(--brand-accent))_18%,transparent)] font-medium text-[color:var(--brand-nav-active,var(--brand-accent))]'
                                : 'text-fg-muted hover:bg-raised hover:text-fg',
                            )}
                          >
                            {label}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </nav>
        <div className="shrink-0 border-t border-hair-soft p-2">
          <button
            type="button"
            onClick={handleLogoutAll}
            className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-fg-faint transition-colors hover:bg-[var(--crit-soft)] hover:text-crit"
          >
            Cerrar sesión en todos los dispositivos
          </button>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 justify-end gap-2 border-b border-hair-soft px-4 py-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Cambiar tema"
            className="rounded-lg border border-hair px-2.5 py-1.5 text-fg-muted transition-colors hover:bg-raised hover:text-fg"
          >
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
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
