import {
  FEATURE_LABELS,
  PLAN_CATALOG,
  type PlanDefinition,
  type PlanFeature,
  type PlanId,
} from './plans';

/** Nombres y copy de la landing. Los IDs reales del sistema no cambian. */
const LANDING_ALIASES: Record<string, PlanId> = {
  basic: 'mostrador',
  pro: 'kiosco',
  premium: 'red',
  mostrador: 'mostrador',
  kiosco: 'kiosco',
  red: 'red',
};

export const LANDING_PLAN_META: Record<
  PlanId,
  {
    name: string;
    tagline: string;
    description: string;
    cta: string;
    highlightLabel?: string;
    bullets: string[];
  }
> = {
  mostrador: {
    name: 'BASIC',
    tagline: 'La gestión del local: ventas, stock y caja.',
    description:
      'Punto de venta, productos, caja, compras, proveedores, fiado, promociones y reportes. Hasta 5 usuarios.',
    cta: 'Contratar BASIC',
    bullets: [
      'Punto de venta con lector, búsqueda y atajos (F2, F4, cobro)',
      'Productos ilimitados: stock, costos, vencimientos y ticket',
      'Caja: apertura, cierre, efectivo, Mercado Pago y egresos',
      'Compras y proveedores cargados a mano',
      'Fiado, promociones, reportes y hasta 5 usuarios',
      'Pantalla del cliente y módulo de figuritas',
    ],
  },
  kiosco: {
    name: 'PRO',
    tagline: 'BASIC más el módulo de facturación.',
    description:
      'Toda la gestión del local y, además, emisión de comprobantes electrónicos (Factura C) desde el mismo sistema.',
    cta: 'Contratar PRO',
    highlightLabel: 'El más elegido',
    bullets: [
      'Todo lo de BASIC',
      'Módulo de facturación: Factura C electrónica',
      'CUIT, punto de venta y certificado cargados en el sistema',
      'En el POS elegís comprobante interno o Factura C',
      'Reimpresión y seguimiento de cada comprobante',
      'Hasta 5 usuarios',
    ],
  },
  red: {
    name: 'PREMIUM',
    tagline: 'Distribuidores e IA, encima de PRO.',
    description:
      'Importás catálogos y precios de Tokin, Mondelez y Juntos+. Las facturas de compra se cargan con IA.',
    cta: 'Contratar PREMIUM',
    bullets: [
      'Todo lo de PRO, usuarios sin tope',
      'Importación de catálogos Tokin, Mondelez y Juntos+',
      'Precios de costo B2B, pedidos y cuenta del proveedor',
      'Compras con IA: subís el PDF o la foto y se arma la compra',
      'Mapeo de columnas del Excel/catálogo del mayorista',
    ],
  },
};

export type LandingPlan = PlanDefinition & {
  highlightLabel?: string;
};

export function landingPlans(): LandingPlan[] {
  return PLAN_CATALOG.map((plan) => ({
    ...plan,
    ...LANDING_PLAN_META[plan.id],
    highlighted: plan.id === 'kiosco',
  }));
}

export function resolveLandingPlanId(value?: string | null): PlanId {
  if (!value) return 'mostrador';
  return LANDING_ALIASES[value.toLowerCase()] ?? 'mostrador';
}

export const LANDING_FEATURE_LABELS: Record<PlanFeature, string> = {
  ...FEATURE_LABELS,
  fiscal: 'Módulo de facturación',
};
