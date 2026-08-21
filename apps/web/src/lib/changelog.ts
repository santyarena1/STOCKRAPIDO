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
    version: 'v1.10',
    date: '2026-08-21',
    summary: 'Módulo Facturas en el historial y aviso de tope facturado.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Facturas en historial de ventas',
        desc: 'En Historial de ventas hay una pestaña Facturas con las Factura C autorizadas, totales del período y notas de crédito.',
      },
      {
        tag: 'NUEVO',
        title: 'Aviso de tope facturado',
        desc: 'Definís un monto límite (mes, 30 días o acumulado). Antes de emitir la próxima Factura C en el POS o desde el historial, avisamos si te estás acercando al tope.',
      },
      {
        tag: 'MEJORA',
        title: 'Progreso y facturación en lote',
        desc: 'En Facturas ves barra de progreso, total facturado y lo que queda por facturar. En Pendientes seleccionás varias ventas y las emitís de una.',
      },
      {
        tag: 'FIX',
        title: 'Total facturado correcto',
        desc: 'El total facturado ahora suma las Factura C del filtro de fechas (fecha de la venta), sin mezclarlo con el período del tope.',
      },
    ],
  },
  {
    version: 'v1.9',
    date: '2026-08-20',
    summary: 'Comisión sobre costo o venta, y Precios Claros con EAN coexistente.',
    items: [
      {
        tag: 'MEJORA',
        title: 'Comisión: base costo o venta',
        desc: 'En cada entidad de Comisionados elegís si el % se calcula sobre el costo o sobre el precio de venta.',
      },
      {
        tag: 'NUEVO',
        title: 'Precios Claros: match y EAN',
        desc: 'En la ficha del producto buscás coincidencias por nombre (y IA si hay key). Al aplicar, se completa lo vacío y el EAN de Precios Claros se suma junto al código actual, sin reemplazarlo.',
      },
      {
        tag: 'FIX',
        title: 'Primera foto: motivo de omitidos',
        desc: 'Si no aplica ninguna imagen, ahora explica por qué (falta key de Serper, sin resultados, etc.) en vez de solo decir “0 aplicadas · N omitidos”.',
      },
      {
        tag: 'NUEVO',
        title: 'Precios Claros masivo',
        desc: 'En Inventario → Precios Claros sembrás/barres un catálogo local, buscás coincidencias en lote y podés pedir ayuda de IA cuando el nombre no pega. El EAN se asocia sin reemplazar el código actual.',
      },
    ],
  },
  {
    version: 'v1.8',
    date: '2026-08-18',
    summary: 'Fotos con Serper, lista de productos más clara, códigos internos y etiquetas A4.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Imágenes con Serper',
        desc: 'En Configuración cargás la API key de Serper. Después podés buscar fotos de Google y asignarlas al crear o editar un producto, en el producto rápido del POS, o en el editor masivo de imágenes.',
      },
      {
        tag: 'MEJORA',
        title: 'Lista de productos más clara',
        desc: 'El buscador, la categoría, el proveedor, la marca y el orden van juntos en un solo bloque. Las categorías ya no aparecen como chips sueltos. Las estadísticas quedan abajo, plegadas.',
      },
      {
        tag: 'NUEVO',
        title: 'Generar código de barras interno',
        desc: 'En alta o edición de producto, si no tiene EAN, generás un código interno (EAN-13 de uso interno) y lo guardás en la ficha. Sirve para pistolear en el mostrador.',
      },
      {
        tag: 'NUEVO',
        title: 'Imprimir etiquetas en A4',
        desc: 'Desde el producto o desde la lista (seleccionados o todo el filtro) imprimís etiquetas chicas. Elegís qué sale: nombre, SKU, categoría, barras, números y precio. El precio viene apagado.',
      },
      {
        tag: 'FIX',
        title: 'Cabecera de Productos',
        desc: 'Los botones de exportar, importar e imprimir ya no se superponen al título. Quedan en una barra aparte y se acomodan si la pantalla es angosta.',
      },
      {
        tag: 'FIX',
        title: 'Imprimir etiquetas',
        desc: 'Al tocar Imprimir etiquetas se abre el diálogo aunque la API todavía no tenga el endpoint nuevo. Si hay productos seleccionados, imprime esos. Imprimir A4 ya no depende de una ventana emergente que el navegador bloqueaba.',
      },
      {
        tag: 'FIX',
        title: 'Guardar API de Serper',
        desc: 'La key de Serper se guarda en este dispositivo aunque la API del servidor no tenga esa ruta. Después podés buscar fotos igual.',
      },
      {
        tag: 'FIX',
        title: 'Fotos masivas solo si falta imagen',
        desc: 'El botón Primera foto pone la primera coincidencia de Serper y saltea los productos que ya tienen foto. Muestra el progreso (Foto 3/40) y, si no hay selección, usa la página actual.',
      },
      {
        tag: 'FIX',
        title: 'Etiquetas A4 completas',
        desc: 'Al imprimir ya no se cortan páginas. El código de barras ocupa todo el ancho de la etiqueta.',
      },
      {
        tag: 'MEJORA',
        title: 'Búsqueda por código en Productos',
        desc: 'Si buscás un código exacto, ese producto sale primero y solo. Ya no queda perdido en el medio de la lista.',
      },
      {
        tag: 'MEJORA',
        title: 'Ficha de producto más ágil',
        desc: 'Campos frecuentes arriba, vacíos en desplegables y botón Guardar flotante siempre visible.',
      },
      {
        tag: 'FIX',
        title: 'Serper y códigos en cualquier PC',
        desc: 'La key de Serper se guarda en el negocio (no solo en un navegador). Generar código interno también funciona si la API vieja no tiene el endpoint.',
      },
      {
        tag: 'NUEVO',
        title: 'Silencioso desde el POS',
        desc: 'En la búsqueda o el carrito podés marcar PS: solo este carrito, o guardarlo fijo en el producto.',
      },
      {
        tag: 'NUEVO',
        title: 'Precios Claros (base)',
        desc: 'Quedó el módulo y el plan para consultar la API/dataset del gobierno por EAN o nombre. La búsqueda live se completa en el próximo paso.',
      },
      {
        tag: 'NUEVO',
        title: 'Productos comisionados',
        desc: 'En la ficha activás Producto comisionado y lo asociás a una entidad (Juan, etc.). En Ventas y caja → Comisionados ves productos, saldo (costo + %) y registrás pagos parciales. La deuda se suma al vender.',
      },
    ],
  },
  {
    version: 'v1.7',
    date: '2026-08-18',
    summary: 'En el POS volvió el botón para asociar un código de barras que no coincidía exacto.',
    items: [
      {
        tag: 'FIX',
        title: 'Asociar código en el POS',
        desc: 'Si escaneás o buscás un código y no pega exacto, en cada producto de la lista aparece «Asociar». Lo guarda como código de barras de ese producto y la próxima vez el escaneo sí lo encuentra.',
      },
    ],
  },
  {
    version: 'v1.6',
    date: '2026-08-17',
    summary: 'Logo de StockRápido en la web, en el sistema y en la pestaña.',
    items: [
      {
        tag: 'MEJORA',
        title: 'Logo de StockRápido',
        desc: 'En la landing se ve el logo completo, con el slogan. Adentro del sistema queda la bolsa y el nombre, sin el slogan. En la pestaña del navegador, solo la bolsa con la S. Siempre sin fondo blanco, recortado.',
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
