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
    tagline: 'Cobrar, stock y caja. El local ordenado.',
    description:
      'Punto de venta, productos, caja, compras, proveedores, fiado, promociones y reportes. Hasta 5 usuarios. Lo que hace falta para vender todos los días, en un solo lugar.',
    cta: 'Probar BASIC',
    bullets: [
      'Punto de venta con lector, búsqueda y atajos',
      'Productos: stock, costos, vencimientos y ticket',
      'Caja: apertura, cierre, efectivo y Mercado Pago',
      'Compras y proveedores cargados a mano',
      'Catálogo comunitario: tarjetas, filtros y paginación (importar hasta 300/mes)',
      'Fiado, promociones, reportes y hasta 5 usuarios',
      'Pantalla del cliente y módulo de figuritas',
    ],
  },
  kiosco: {
    name: 'PRO',
    tagline: 'Lo mismo, y factura cuando la piden.',
    description:
      'Toda la gestión del local y, además, Factura C electrónica desde el mismo cobro. No hace falta otro programa.',
    cta: 'Probar PRO',
    highlightLabel: 'El más elegido',
    bullets: [
      'Todo lo de BASIC',
      'Factura C electrónica desde el POS',
      'Catálogo comunitario ilimitado: buscar, filtrar e importar fichas',
      '1 conexión sync de proveedor (Tokin, Mondelez, Juntos+)',
      'Rappi y PedidosYa: central de pedidos y módulos dedicados',
      'CUIT, punto de venta y certificado en el sistema',
      'Comprobante interno o Factura C, según el cliente',
      'Hasta 5 usuarios',
    ],
  },
  red: {
    name: 'PREMIUM',
    tagline: 'Mayoristas y compras, también adentro.',
    description:
      'Las listas de Tokin, Mondelez y Juntos+ entran al sistema. Las facturas de compra se cargan con IA. Seguis vendiendo desde el mismo lugar.',
    cta: 'Probar PREMIUM',
    bullets: [
      'Todo lo de PRO, usuarios sin tope',
      'Sync de proveedores sin tope de conexiones',
      'Catálogo comunitario ilimitado: buscar, filtrar e importar fichas',
      'Costos B2B, pedidos y cuenta del proveedor',
      'Compras con IA: subís el PDF o la foto',
      'Rappi y PedidosYa sin límite',
      'Mapeo de columnas del Excel del mayorista',
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
