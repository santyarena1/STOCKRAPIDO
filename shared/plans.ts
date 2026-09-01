/** Fuente única de planes StockRápido — importar desde API y web. */

export const PLAN_IDS = ['mostrador', 'kiosco', 'red'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type BillingCycle = 'monthly' | 'yearly';

export type PlanFeature =
  | 'pos'
  | 'products'
  | 'caja'
  | 'salesHistory'
  | 'purchases'
  | 'promotions'
  | 'customers'
  | 'suppliers'
  | 'figuritas'
  | 'customerDisplay'
  | 'reports'
  | 'vendedores'
  | 'fiscal'
  | 'sync'
  | 'aiPurchases'
  | 'publicCatalog'
  | 'multibranch';

export type PlanLimits = {
  maxUsers: number | null;
  maxProducts: number | null;
  maxSyncProviders: number | null;
  /** Fichas publicadas en catálogo comunitario (null = ilimitado). */
  maxCatalogPublish: number | null;
  /** Importaciones desde catálogo por mes calendario (null = ilimitado). */
  maxCatalogImportPerMonth: number | null;
  /** Sucursales (0 = no disponible; futuro). */
  maxBranches: number | null;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
  marketingName: string;
  tagline: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  highlighted?: boolean;
  cta: string;
  features: PlanFeature[];
  limits: PlanLimits;
  bullets: string[];
};

export const CATALOG_SHARE_CONSENT_TEXT =
  'Acepto que las fichas que publique en el catálogo comunitario compartan solo datos no sensibles (nombre, marca, categoría, código de barras, imagen y atributos del producto). Nunca se comparten precios, costos ni stock.';

export const TRIAL_DAYS = 14;

export const YEARLY_MONTHS_CHARGED = 10;

const BASICO: PlanFeature[] = [
  'pos',
  'products',
  'caja',
  'salesHistory',
  'purchases',
  'promotions',
  'customers',
  'suppliers',
  'figuritas',
  'customerDisplay',
  'reports',
  'vendedores',
  'publicCatalog',
];

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: 'mostrador',
    name: 'Mostrador',
    marketingName: 'BASIC',
    tagline: 'Lo básico: cobrar, stock y caja.',
    description:
      'El kiosco del día a día. POS, productos, caja, fiado, promos y reportes. Sin factura electrónica ni listas de distribuidores.',
    monthlyPrice: 19900,
    yearlyPrice: 199000,
    highlighted: true,
    cta: 'Empezar con Mostrador',
    features: BASICO,
    limits: {
      maxUsers: 5,
      maxProducts: 2000,
      maxSyncProviders: 0,
      maxCatalogPublish: null,
      maxCatalogImportPerMonth: 300,
      maxBranches: 0,
    },
    bullets: [
      'POS con lector, atajos y ticket',
      'Productos, stock, compras a mano y proveedores',
      'Caja, fiado, promos y reportes',
      'Hasta 5 usuarios',
      'Catálogo comunitario: publicar fichas ilimitado, importar hasta 300/mes',
    ],
  },
  {
    id: 'kiosco',
    name: 'Fiscal',
    marketingName: 'PRO',
    tagline: 'Lo mismo, y factura a AFIP.',
    description:
      'Cuando el cliente pide factura. Misma operatoria del Mostrador, más Factura C electrónica (ARCA/AFIP).',
    monthlyPrice: 34900,
    yearlyPrice: 349000,
    cta: 'Sumar facturación',
    features: [...BASICO, 'fiscal', 'sync', 'multibranch'],
    limits: {
      maxUsers: 5,
      maxProducts: null,
      maxSyncProviders: 1,
      maxCatalogPublish: null,
      maxCatalogImportPerMonth: null,
      maxBranches: 3,
    },
    bullets: [
      'Todo Mostrador',
      'Factura electrónica AFIP (Factura C)',
      'Catálogo comunitario ilimitado',
      '1 conexión de proveedor sync',
      'Hasta 5 usuarios',
      'Multisucursal (hasta 3 locales, próximamente)',
    ],
  },
  {
    id: 'red',
    name: 'Pro',
    marketingName: 'PREMIUM',
    tagline: 'Listas de distribuidores e IA.',
    description:
      'Importás catálogos y precios de Tokin, Mondelez y Juntos+. Las facturas de compra se cargan con IA.',
    monthlyPrice: 54900,
    yearlyPrice: 549000,
    cta: 'Pasarme a Pro',
    features: [...BASICO, 'fiscal', 'sync', 'aiPurchases', 'multibranch'],
    limits: {
      maxUsers: null,
      maxProducts: null,
      maxSyncProviders: null,
      maxCatalogPublish: null,
      maxCatalogImportPerMonth: null,
      maxBranches: null,
    },
    bullets: [
      'Todo Fiscal, usuarios sin tope',
      'Sync Tokin, Mondelez y Juntos+ (sin tope de conexiones)',
      'Compras con IA',
      'Catálogo comunitario ilimitado',
      'Multisucursal sin tope (próximamente)',
    ],
  },
];

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  pos: 'Punto de venta',
  products: 'Productos y stock',
  caja: 'Caja',
  salesHistory: 'Historial de ventas',
  purchases: 'Compras',
  promotions: 'Promociones y combos',
  customers: 'Clientes y fiado',
  suppliers: 'Proveedores',
  figuritas: 'Figuritas Mundial',
  customerDisplay: 'Pantalla del cliente',
  reports: 'Reportes',
  vendedores: 'Vendedores',
  fiscal: 'Factura electrónica AFIP',
  sync: 'Importación de distribuidores',
  aiPurchases: 'Compras con IA',
  publicCatalog: 'Catálogo comunitario',
  multibranch: 'Multisucursal',
};

export type TenantAccessMode = 'full' | 'read_only';

export type TenantAccessReason =
  | null
  | 'trial_expired'
  | 'pending_payment'
  | 'past_due'
  | 'canceled';

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export function getPlan(id: string | null | undefined): PlanDefinition {
  const found = PLAN_CATALOG.find((p) => p.id === id);
  return found ?? PLAN_CATALOG.find((p) => p.id === 'mostrador')!;
}

export function planPrice(plan: PlanDefinition, cycle: BillingCycle): number {
  return cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

export function hasFeature(plan: PlanDefinition, feature: PlanFeature): boolean {
  return plan.features.includes(feature);
}

export function planThatIncludes(feature: PlanFeature): PlanDefinition {
  return PLAN_CATALOG.find((p) => p.features.includes(feature)) ?? PLAN_CATALOG[PLAN_CATALOG.length - 1];
}

export function resolveTenantAccessFromBusiness(business: {
  planId: string;
  planStatus: string;
  trialEndsAt: Date | string | null;
}): {
  mode: TenantAccessMode;
  reason: TenantAccessReason;
  effectivePlanId: PlanId;
  trialActive: boolean;
} {
  const status = business.planStatus || 'active';
  const now = Date.now();
  const trialEnd = business.trialEndsAt ? new Date(business.trialEndsAt).getTime() : 0;
  const trialActive = status === 'trial' && trialEnd > now;

  let mode: TenantAccessMode = 'full';
  let reason: TenantAccessReason = null;

  if (status === 'trial' && !trialActive) {
    mode = 'read_only';
    reason = 'trial_expired';
  } else if (status === 'pending_payment' || status === 'past_due') {
    mode = 'read_only';
    reason = status === 'pending_payment' ? 'pending_payment' : 'past_due';
  } else if (status === 'canceled') {
    mode = 'read_only';
    reason = 'canceled';
  }

  const effectivePlanId: PlanId =
    status === 'canceled' ? 'mostrador' : isPlanId(business.planId) ? business.planId : 'mostrador';

  return { mode, reason, effectivePlanId, trialActive };
}
