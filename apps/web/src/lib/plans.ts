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
  | 'aiPurchases';

export type PlanLimits = {
  maxUsers: number | null;
  maxProducts: number | null;
  maxSyncProviders: number | null;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
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

export const TRIAL_DAYS = 14;

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
];

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    id: 'mostrador',
    name: 'Mostrador',
    tagline: 'Lo básico: cobrar, stock y caja.',
    description:
      'El kiosco del día a día. POS, productos, caja, fiado, promos y reportes. Sin factura electrónica ni listas de distribuidores.',
    monthlyPrice: 19900,
    yearlyPrice: 199000,
    highlighted: true,
    cta: 'Empezar con Mostrador',
    features: BASICO,
    limits: { maxUsers: 5, maxProducts: null, maxSyncProviders: 0 },
    bullets: [
      'POS con lector, atajos y ticket',
      'Productos, stock, compras a mano y proveedores',
      'Caja, fiado, promos y reportes',
      'Hasta 5 usuarios (dueño, cajero, repositor)',
      'Figuritas y pantalla del cliente',
    ],
  },
  {
    id: 'kiosco',
    name: 'Fiscal',
    tagline: 'Lo mismo, y factura a AFIP.',
    description:
      'Cuando el cliente pide factura. Misma operatoria del Mostrador, más Factura C electrónica (ARCA/AFIP).',
    monthlyPrice: 34900,
    yearlyPrice: 349000,
    cta: 'Sumar facturación',
    features: [...BASICO, 'fiscal'],
    limits: { maxUsers: 5, maxProducts: null, maxSyncProviders: 0 },
    bullets: [
      'Todo Mostrador',
      'Factura electrónica AFIP (Factura C)',
      'Punto de venta, CUIT y certificado en el sistema',
      'Reimpresión y seguimiento de comprobantes',
      'Hasta 5 usuarios',
    ],
  },
  {
    id: 'red',
    name: 'Pro',
    tagline: 'Listas de distribuidores e IA.',
    description:
      'Importás catálogos y precios de Tokin, Mondelez y Juntos+. Las facturas de compra se cargan con IA.',
    monthlyPrice: 54900,
    yearlyPrice: 549000,
    cta: 'Pasarme a Pro',
    features: [...BASICO, 'fiscal', 'sync', 'aiPurchases'],
    limits: { maxUsers: null, maxProducts: null, maxSyncProviders: null },
    bullets: [
      'Todo Fiscal, usuarios sin tope',
      'Sync Tokin, Mondelez y Juntos+',
      'Precios B2B y pedidos al proveedor',
      'Compras con IA: subís el PDF y se carga sola',
      'Mapeo de columnas con asistencia',
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
};

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

export function formatPlanPrice(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function yearlyEquivalentMonthly(plan: PlanDefinition): number {
  return Math.round(plan.yearlyPrice / 12);
}
