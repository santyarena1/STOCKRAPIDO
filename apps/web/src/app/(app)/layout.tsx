'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bike,
  ChevronDown,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Receipt,
  ScanLine,
  Settings,
  Shield,
  SlidersHorizontal,
  ShoppingCart,
  Sun,
  Truck,
  X,
} from 'lucide-react';
import {
  PedidosYaIcon,
  RappiIcon,
} from '@/components/delivery/DeliveryBrandIcons';

function SidebarDeliveryIcon({ provider }: { provider: 'rappi' | 'pedidosya' }) {
  const Icon = provider === 'rappi' ? RappiIcon : PedidosYaIcon;
  return <Icon className="h-6 w-6 shrink-0" />;
}
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { ReadOnlyBanner } from '@/components/ReadOnlyBanner';
import { ChangelogNavLink, ChangelogWidget } from '@/components/ChangelogWidget';
import { BillingProvider, useBilling } from '@/components/billing/BillingProvider';
import { StockRapidoLogo } from '@/components/brand/StockRapidoLogo';
import { api } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/env-urls';
import { STOCKRAPIDO_BRANDING_EVENT } from '@/lib/branding';
import { cn } from '@/lib/cn';
import { Loader } from '@/components/ui/Loader';
import { useSessionUser } from '@/lib/use-session-user';

type Branding = {
  accentColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
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
  { href: '/stock-rapido', label: 'Stock rápido', icon: ScanLine },
];

const GROUPS = [
  {
    title: 'Ventas y caja',
    icon: Receipt,
    items: [
      { href: '/ventas', label: 'Historial de ventas' },
      { href: '/caja', label: 'Caja' },
      { href: '/clientes', label: 'Clientes / Fiados' },
      { href: '/comisionados', label: 'Comisionados' },
    ],
  },
  {
    title: 'Inventario',
    icon: Package,
    items: [
      { href: '/productos', label: 'Productos' },
      { href: '/precios-claros', label: 'Precios Claros' },
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
      { href: '/compras/arca', label: 'Facturas ARCA' },
      { href: '/proveedores', label: 'Proveedores' },
      { href: '/sincronizaciones', label: 'Sincronización' },
      { href: '/catalogo-proveedor', label: 'Catálogo proveedor' },
      { href: '/columnas-proveedores', label: 'Columnas de proveedores' },
      { href: '/pedidos-proveedor', label: 'Pedidos proveedor' },
      { href: '/cuenta-proveedor', label: 'Cuenta corriente' },
    ],
  },
  {
    title: 'Delivery apps',
    icon: Bike,
    items: [
      { href: '/delivery', label: 'Central de pedidos' },
      { href: '/delivery/rappi', label: 'Rappi', deliveryIcon: 'rappi' as const },
      { href: '/delivery/pedidosya', label: 'PedidosYa', deliveryIcon: 'pedidosya' as const },
    ],
  },
  {
    title: 'Análisis',
    icon: BarChart3,
    items: [{ href: '/reportes', label: 'Reportes' }],
  },
  {
    title: 'Configuración',
    icon: SlidersHorizontal,
    items: [
      { href: '/config/negocio', label: 'Negocio' },
      { href: '/config/apariencia', label: 'Apariencia' },
      { href: '/config/ticket', label: 'Ticket' },
      { href: '/config/vendedores', label: 'Vendedores' },
      { href: '/config/proveedores', label: 'Proveedores' },
      { href: '/config/pantalla', label: 'Pantalla cliente' },
      { href: '/config/compras-ia', label: 'Compras IA' },
      { href: '/config/serper', label: 'Imágenes Serper' },
      { href: '/config/categorias', label: 'Categorías' },
      { href: '/config/fiscal', label: 'Fiscal' },
      { href: '/config/seguridad', label: 'Seguridad' },
      { href: '/config/eliminar-datos', label: 'Eliminar datos' },
    ],
  },
  {
    title: 'Administración',
    icon: Settings,
    items: [
      { href: '/usuarios', label: 'Usuarios' },
      { href: '/billing', label: 'Plan & Facturación' },
      { href: '/soporte', label: 'Soporte' },
    ],
  },
];

const PLATFORM_GROUP = {
  title: 'Panel StockRápido',
  icon: Shield,
  items: [
    { href: '/admin', label: 'Cuentas' },
    { href: '/admin/tickets', label: 'Tickets' },
  ],
};

const SIDEBAR_GROUPS_KEY = 'sr-sidebar-groups';

function isActivePath(pathname: string, href: string) {
  return (
    pathname === href ||
    (href === '/compras' && pathname === '/compras') ||
    (href === '/compras/arca' && pathname.startsWith('/compras/arca')) ||
    (href === '/figuritas' && pathname.startsWith('/figuritas')) ||
    (href === '/admin' && (pathname === '/admin' || pathname.startsWith('/admin/negocios'))) ||
    (href === '/admin/tickets' && pathname.startsWith('/admin/tickets')) ||
    (href === '/soporte' && pathname.startsWith('/soporte')) ||
    (href === '/delivery' && pathname === '/delivery') ||
    (href.startsWith('/delivery/') && pathname.startsWith(href)) ||
    (href.startsWith('/config/') && pathname.startsWith(href))
  );
}

function activeGroups(
  pathname: string,
  groups: Array<{ title: string; items: Array<{ href: string; label: string }> }>,
) {
  return Object.fromEntries(
    groups.map((group) => [
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

function BillingBanner() {
  const { data } = useBilling();
  if (!data) return null;
  if (data.status === 'complimentary') return null;
  if (data.trialActive && data.trialEndsAt) {
    const days = Math.max(0, Math.ceil((new Date(data.trialEndsAt).getTime() - Date.now()) / 86400000));
    return (
      <Link href="/billing" className="block border-b border-hair-soft bg-raised px-4 py-2 text-center text-sm text-fg-muted hover:text-fg">
        Prueba del plan {data.plan.name}: {days} día{days === 1 ? '' : 's'} · ver planes
      </Link>
    );
  }
  if (data.status === 'pending_payment') {
    return (
      <Link href="/billing" className="block border-b border-hair-soft bg-[var(--warn-soft)] px-4 py-2 text-center text-sm text-warn">
        Hay un pago pendiente · ir a facturación
      </Link>
    );
  }
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isPlatformAdmin } = useSessionUser();
  const navGroups = isPlatformAdmin ? [...GROUPS, PLATFORM_GROUP] : GROUPS;
  const [ready, setReady] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [brand, setBrand] = useState<Branding>({});
  const [sidebarTitle, setSidebarTitle] = useState('StockRápido');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => activeGroups(pathname, GROUPS));
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const applyBranding = useCallback(() => {
    api<{ name: string; posConfig?: { branding?: Branding } }>('/business/me')
      .then((b) => {
        const br = b.posConfig?.branding;
        setBrand(br ?? {});
        setSidebarTitle(br?.appTitle?.trim() || b.name || 'StockRápido');
        applyCssBrandVars(br);
        document.title = `${br?.appTitle?.trim() || b.name || 'StockRápido'}`;
        const href = br?.faviconUrl?.trim() || br?.logoUrl?.trim();
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
    const active = activeGroups(pathname, navGroups);
    setOpenGroups(
      Object.fromEntries(
        navGroups.map((group) => [group.title, active[group.title] || stored[group.title] || false]),
      ),
    );
    setGroupsLoaded(true);
  }, [pathname, isPlatformAdmin]);

  useEffect(() => {
    if (!groupsLoaded) return;
    localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(openGroups));
  }, [groupsLoaded, openGroups]);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setMobileSidebarOpen(false);
    };
    closeOnDesktop(desktop);
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  if (!ready) return <Loader full label="Cargando" />;

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await fetch(`${getApiBaseUrl()}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      /* salir igual si la API no responde */
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    router.push('/');
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sr-theme', next);
    setTheme(next);
  };

  const sidebarContent = (closeAfterNavigation = false) => (
    <>
      <div className="shrink-0 border-b border-hair-soft p-4">
        <Link
          href="/dashboard"
          onClick={closeAfterNavigation ? () => setMobileSidebarOpen(false) : undefined}
          className="flex min-w-0 items-center gap-2.5 text-lg font-bold text-fg"
        >
          {brand.logoUrl &&
          (brand.logoUrl.startsWith('data:') || brand.logoUrl.startsWith('http://') || brand.logoUrl.startsWith('https://')) ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.logoUrl} alt="" className="h-9 w-9 shrink-0 bg-transparent object-contain" />
              <span className="truncate">{sidebarTitle}</span>
            </>
          ) : (
            <StockRapidoLogo variant="system" href={null} />
          )}
        </Link>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
        <div className="space-y-1">
          {PINNED.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return <Link key={href} href={href} onClick={closeAfterNavigation ? () => setMobileSidebarOpen(false) : undefined} className={cn('flex items-center gap-3 rounded-lg border-r-2 border-transparent px-3 py-2.5 text-sm font-medium transition-colors', active ? 'border-[color:var(--brand-nav-active,var(--brand-accent))] bg-[color-mix(in_srgb,var(--brand-nav-active,var(--brand-accent))_18%,transparent)] text-[color:var(--brand-nav-active,var(--brand-accent))]' : 'text-fg-muted hover:bg-raised hover:text-fg')}><Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-current' : 'text-fg-muted')} /><span>{label}</span></Link>;
          })}
        </div>
        <div className="mt-4 space-y-1">
          {navGroups.map(({ title, icon: Icon, items }) => {
            const open = openGroups[title] ?? false;
            const groupActive = items.some(({ href }) => isActivePath(pathname, href));
            return (
              <div key={title}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenGroups((current) => (current[title] ? {} : { [title]: true }))}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-raised hover:text-fg',
                    groupActive ? 'text-[color:var(--brand-nav-active,var(--brand-accent))]' : 'text-fg-muted',
                  )}
                >
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', groupActive ? 'text-current' : 'text-fg-muted')} />
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-fg-faint transition-transform', open && 'rotate-180')} />
                </button>
                {open ? (
                  <div className="ml-5 mt-0.5 space-y-0.5 border-l border-hair-soft pl-3">
                    {items.map((item) => {
                      const { href, label } = item;
                      const deliveryIcon =
                        'deliveryIcon' in item && (item.deliveryIcon === 'rappi' || item.deliveryIcon === 'pedidosya')
                          ? item.deliveryIcon
                          : undefined;
                      const active = isActivePath(pathname, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={closeAfterNavigation ? () => setMobileSidebarOpen(false) : undefined}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border-r-2 border-transparent px-3 py-2 text-sm transition-colors',
                            active
                              ? 'border-[color:var(--brand-nav-active,var(--brand-accent))] bg-[color-mix(in_srgb,var(--brand-nav-active,var(--brand-accent))_18%,transparent)] font-medium text-[color:var(--brand-nav-active,var(--brand-accent))]'
                              : 'text-fg-muted hover:bg-raised hover:text-fg',
                          )}
                        >
                          {deliveryIcon ? <SidebarDeliveryIcon provider={deliveryIcon} /> : null}
                          <span>{label}</span>
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
      <div className="shrink-0 space-y-1 border-t border-hair-soft p-2">
        <ChangelogNavLink onNavigate={closeAfterNavigation ? () => setMobileSidebarOpen(false) : undefined} />
        <button type="button" onClick={handleLogout} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-fg-faint transition-colors hover:bg-raised hover:text-fg">Cerrar sesión</button>
      </div>
    </>
  );

  return (
    <BillingProvider>
    <div className="flex h-screen min-h-0 overflow-hidden bg-app text-fg">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-hair-soft bg-surface lg:flex">{sidebarContent()}</aside>
      <div className={cn('fixed inset-0 z-40 lg:hidden', mobileSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!mobileSidebarOpen}>
        <button type="button" aria-label="Cerrar menú" onClick={() => setMobileSidebarOpen(false)} className={cn('absolute inset-0 bg-black/60 transition-opacity', mobileSidebarOpen ? 'opacity-100' : 'opacity-0')} />
        <aside className={cn('relative flex h-full w-[min(18rem,85vw)] flex-col border-r border-hair-soft bg-surface shadow-2xl transition-transform duration-200', mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
          <button type="button" aria-label="Cerrar menú" onClick={() => setMobileSidebarOpen(false)} className="absolute right-2 top-2 z-10 rounded-lg border border-hair bg-raised p-2 text-fg-muted"><X className="h-4 w-4" /></button>
          {sidebarContent(true)}
        </aside>
      </div>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-hair-soft px-3 py-2 lg:hidden">
          <button type="button" aria-label="Abrir menú" aria-expanded={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(true)} className="rounded-lg border border-hair bg-raised p-2 text-fg-muted"><Menu className="h-5 w-5" /></button>
          <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-fg">
            {brand.logoUrl && (brand.logoUrl.startsWith('data:') || brand.logoUrl.startsWith('http://') || brand.logoUrl.startsWith('https://')) ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.logoUrl} alt="" className="h-8 w-8 shrink-0 bg-transparent object-contain" />
                <span className="truncate">{sidebarTitle}</span>
              </>
            ) : (
              <StockRapidoLogo variant="system" href={null} />
            )}
          </Link>
          <button type="button" onClick={toggleTheme} aria-label="Cambiar tema" className="rounded-lg border border-hair p-2 text-fg-muted hover:bg-raised">{theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</button>
          <button type="button" onClick={() => setShowTutorial(true)} className="btn-brand rounded-lg px-2.5 py-2 text-xs font-medium">Tutorial</button>
        </div>
        <div className="hidden shrink-0 justify-end gap-2 border-b border-hair-soft px-4 py-2 lg:flex">
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
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <ReadOnlyBanner />
          <BillingBanner />
          {children}
        </div>
      </main>
      <TutorialOverlay open={showTutorial} onClose={() => setShowTutorial(false)} />
      <ChangelogWidget />
    </div>
    </BillingProvider>
  );
}
