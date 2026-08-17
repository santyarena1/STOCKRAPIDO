// Changelog de StockRápido — se completa con cada cambio que sale a producción.
// REGLA: con cada feature/mejora/fix relevante, agregar un ítem a la versión de arriba
// (o crear una versión nueva). Lo ve el usuario final en el módulo /changelog y en el popup.

export type ChangeTag = 'NUEVO' | 'MEJORA' | 'FIX';

export type ChangeItem = {
  tag: ChangeTag;
  title: string;
  desc: string;
};

export type ChangelogVersion = {
  version: string;
  /** ISO YYYY-MM-DD */
  date: string;
  /** Resumen "en pocas palabras" (opcional). */
  summary?: string;
  items: ChangeItem[];
};

/** Más nueva primero. */
export const CHANGELOG: ChangelogVersion[] = [
  {
    version: 'v1.6',
    date: '2026-08-17',
    summary: 'Logo de StockRápido en la web, en el sistema y en la pestaña.',
    items: [
      {
        tag: 'MEJORA',
        title: 'Logo de StockRápido',
        desc: 'En la landing se ve el logo completo, con el slogan. Adentro del sistema queda la bolsa y el nombre, sin el slogan. En la pestaña del navegador, solo la bolsa con la S.',
      },
    ],
  },
  {
    version: 'v1.5',
    date: '2026-08-16',
    summary: 'Soporte con tickets y, para el equipo de StockRápido, un panel de todas las cuentas y sus pagos.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Tickets de soporte',
        desc: 'En Administración → Soporte podés abrir un ticket si hay un problema técnico o con un pago. Queda el hilo de mensajes.',
      },
      {
        tag: 'MEJORA',
        title: 'Estado del pago en Plan y facturación',
        desc: 'Se ve si estás al día, en prueba o con un pago pendiente, la fecha del último pago y la próxima renovación. Desde ahí también se abre un ticket.',
      },
    ],
  },
  {
    version: 'v1.4',
    date: '2026-08-16',
    summary: 'Landing pública con login, y planes claros: Mostrador, Fiscal y Pro.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Página de inicio',
        desc: 'Si no estás logueado ves una landing del sistema (qué hace, planes y precios). El login está en esa misma pantalla. Las cuentas nuevas tienen 14 días de prueba.',
      },
      {
        tag: 'NUEVO',
        title: 'Planes y facturación',
        desc: 'Mostrador es el kiosco del día a día. Fiscal suma Factura C a AFIP. Pro trae las listas de Tokin, Mondelez y Juntos+ y las compras con IA. Se paga por mes o por año (2 meses de regalo).',
      },
    ],
  },
  {
    version: 'v1.3',
    date: '2026-08-16',
    summary:
      'Ahora podés ocultar productos en el ticket impreso y ver de un vistazo la ficha de un producto.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Producto silencioso',
        desc: 'Marcás un producto como “silencioso” y en el comprobante impreso (factura o comprobante interno) sale con un texto configurable (ej. “Item kiosco”). En estadísticas, historial y todo el resto conserva su nombre real. Toggle arriba en la ficha, acción masiva en la lista y etiqueta PS. El texto se configura en Configuración → Ticket, y en el POS hay un toggle para mostrar nombres reales.',
      },
      {
        tag: 'NUEVO',
        title: 'Vista rápida del producto',
        desc: 'Desde la lista de productos, el botón “Vista rápida” abre un resumen con solo los datos que el producto tiene cargados, sin necesidad de entrar a la ficha.',
      },
    ],
  },
  {
    version: 'v1.2',
    date: '2026-08-14',
    summary: 'Nuevo módulo para cargar y descontar stock escaneando productos.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Stock rápido',
        desc: 'Escaneás productos para sumar (Ingreso) o restar (Egreso) stock de a uno. Soporta escaneos rápidos sin perder ninguno, muestra una lista viva con el neto por producto y tiene un historial de movimientos.',
      },
    ],
  },
  {
    version: 'v1.1',
    date: '2026-08-14',
    summary: 'La cuenta corriente de cada cliente quedó mucho más clara.',
    items: [
      {
        tag: 'MEJORA',
        title: 'Cuenta corriente en el POS',
        desc: 'Selector de cliente fijo arriba del carrito (siempre visible, muestra el saldo del cliente) y botón “A cuenta corriente” para cargar la venta directo a su cuenta.',
      },
      {
        tag: 'MEJORA',
        title: 'Clientes más claros',
        desc: 'Saldo destacado por cliente (Debe / A favor / Al día) y un movimiento unificado de la cuenta corriente: compras a cuenta y pagos en orden, con el saldo corriente al lado.',
      },
    ],
  },
  {
    version: 'v1.0',
    date: '2026-08-13',
    summary: 'Primeras integraciones de proveedores y mejoras de búsqueda.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Sincronización Juntos+',
        desc: 'Integración con Juntos+ (Coca-Cola FEMSA): se sincroniza el catálogo con precios y costos.',
      },
      {
        tag: 'MEJORA',
        title: 'Búsqueda del POS',
        desc: 'Busca por cualquier código del producto (barcode, SKU, referencia, etc.) y encuentra coincidencias aproximadas.',
      },
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0]?.version ?? 'v1.0';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Formatea "2026-08-16" -> "16 Ago 2026" sin depender de zona horaria. */
export function formatChangelogDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  return `${d} ${MESES[m - 1] ?? ''} ${y}`;
}

export const TAG_STYLE: Record<ChangeTag, string> = {
  NUEVO: 'border-[color:var(--ok)]/40 bg-[var(--ok-soft)] text-ok',
  MEJORA: 'border-[color:var(--brand-accent)]/40 bg-brand-highlight text-brand',
  FIX: 'border-[color:var(--warn)]/40 bg-[var(--warn-soft)] text-warn',
};
