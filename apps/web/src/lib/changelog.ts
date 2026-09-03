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
    version: 'v1.24',
    date: '2026-09-03',
    summary: 'Compras registradas en ARCA a nombre de tu CUIT.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Compras en ARCA',
        desc: 'Importá el CSV de Mis Comprobantes → Recibidos y mirá en StockRápido las facturas que proveedores emitieron a tu CUIT. Opcional: constatá CAE con el mismo certificado de facturación (WSCDC).',
      },
    ],
  },
  {
    version: 'v1.23',
    date: '2026-09-02',
    summary: 'Delivery: API en vivo configurable, landing actualizada y requisitos en productos.',
    items: [
      {
        tag: 'MEJORA',
        title: 'API partner configurable',
        desc: 'En Conexión podés pegar la URL base de Rappi o PedidosYa. Con credenciales + URL, las acciones (menú, pedidos, tienda) llaman a la API real en lugar de simular.',
      },
      {
        tag: 'MEJORA',
        title: 'Requisitos delivery más claros',
        desc: 'En lista y edición de productos: obligatorios vs recomendados, dónde completar cada campo y resumen por app.',
      },
      {
        tag: 'MEJORA',
        title: 'Landing con publicación E2E',
        desc: 'La demo y las preguntas frecuentes explican publicar catálogo, precio con comisión y requisitos por producto.',
      },
    ],
  },
  {
    version: 'v1.22',
    date: '2026-09-02',
    summary: 'Delivery end-to-end: publicar catálogo, precios con comisión y requisitos en productos.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Tab Publicar en Rappi y PedidosYa',
        desc: 'Elegí categorías y productos, editá la ficha por plataforma, validá y enviá el catálogo con precio calculado (margen + comisión).',
      },
      {
        tag: 'NUEVO',
        title: 'Requisitos delivery en productos',
        desc: 'En la ficha y en la lista ves qué campos son obligatorios o recomendados para cada app activa (Rappi / PedidosYa).',
      },
      {
        tag: 'MEJORA',
        title: 'Conexión por plataforma',
        desc: 'Formularios distintos y útiles: Rappi (Store ID + OAuth) y PedidosYa (Chain + Vendor + API Key). Incluye margen y comisión.',
      },
    ],
  },
  {
    version: 'v1.21',
    date: '2026-09-02',
    summary: 'Módulo completo de delivery: Rappi, PedidosYa y central de pedidos.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Central de pedidos delivery',
        desc: 'Bandeja unificada para Rappi y PedidosYa con estados, acciones y registro de venta con baja de stock. Disponible en plan PREMIUM.',
      },
      {
        tag: 'NUEVO',
        title: 'Módulos Rappi y PedidosYa',
        desc: 'Cada plataforma tiene su módulo: conexión API, webhook, menú, mapeos SKU, simulador y control de tienda abierta/cerrada.',
      },
      {
        tag: 'FIX',
        title: 'Iconos delivery más grandes y limpios',
        desc: 'Logos de Rappi y PedidosYa agrandados en sidebar, central y módulos. Se eliminaron bordes blancos del logo de Rappi.',
      },
    ],
  },
  {
    version: 'v1.20',
    date: '2026-09-02',
    summary: 'Landing actualizada con el catálogo comunitario renovado.',
    items: [
      {
        tag: 'MEJORA',
        title: 'Landing con catálogo comunitario',
        desc: 'La página de inicio muestra la demo del catálogo público (tarjetas, filtros, paginación), lo incluye en la tabla de planes y en las preguntas frecuentes.',
      },
    ],
  },
  {
    version: 'v1.19',
    date: '2026-09-02',
    summary: 'Catálogo comunitario: historial de importados, aviso de parecidos y modal para completar la ficha.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Historial de importados del catálogo',
        desc: 'En Productos → Catálogo público → Historial importados ves qué fichas trajiste y cuándo, con enlace al producto local.',
      },
      {
        tag: 'MEJORA',
        title: 'Importar con aviso de productos parecidos',
        desc: 'Al importar una ficha, el sistema te avisa si ya tenés algo similar (mismo código, nombre o marca) antes de confirmar.',
      },
      {
        tag: 'MEJORA',
        title: 'Modal para completar al importar',
        desc: 'Podés cargar código de barras, marca, categoría, precio de venta y costo al importar. Todo opcional: podés importar y completar después.',
      },
      {
        tag: 'MEJORA',
        title: 'Catálogo público renovado en Productos',
        desc: 'En Productos → Catálogo público: tarjetas compactas o lista densa, filtros, orden, paginación y barra de acciones al seleccionar fichas.',
      },
    ],
  },
  {
    version: 'v1.18',
    date: '2026-09-01',
    summary: 'Catálogo comunitario automático, planes ajustados, ventas, usuarios y mejoras de interfaz.',
    items: [
      {
        tag: 'MEJORA',
        title: 'Consentimiento de catálogo comunitario',
        desc: 'Al usar StockRápido, las fichas que publiques comparten solo datos no sensibles (sin precios ni stock). La primera vez que abrís el catálogo se explica en pantalla.',
      },
      {
        tag: 'MEJORA',
        title: 'Límites de catálogo por plan',
        desc: 'Publicar fichas: ilimitado para todos. Importar: BASIC 300/mes; PRO y Premium sin tope. PRO: 1 conexión sync de proveedores.',
      },
      {
        tag: 'FIX',
        title: 'API en Vercel (failed to fetch)',
        desc: 'Corregido el entrypoint del deploy serverless tras incluir shared/plans en el build. La API vuelve a responder.',
      },
      {
        tag: 'MEJORA',
        title: 'Catálogo comunitario sin paso extra de aceptación',
        desc: 'Compartir fichas queda incluido en el uso de la plataforma. La primera vez que abrís Catálogo público en Productos, un aviso explica cómo funciona.',
      },
      {
        tag: 'FIX',
        title: 'Historial de ventas: columna Vendedor',
        desc: 'Muestra el vendedor del POS (no el usuario de la cuenta que cobró).',
      },
      {
        tag: 'MEJORA',
        title: 'Editar usuarios',
        desc: 'En Usuarios podés cambiar nombre y email de cada integrante del equipo.',
      },
      {
        tag: 'MEJORA',
        title: 'Novedades en el menú lateral',
        desc: 'El acceso a Novedades quedó en el menú, arriba de Cerrar sesión, para no tapar botones del POS ni otras pantallas.',
      },
      {
        tag: 'MEJORA',
        title: 'Catálogo comunitario con tus productos',
        desc: 'Al abrir Catálogo público se sincronizan automáticamente las fichas de todos los locales (sin precio ni stock). Los productos nuevos o editados también se publican solos.',
      },
    ],
  },
  {
    version: 'v1.17',
    date: '2026-09-01',
    summary: 'Plataforma premium: planes, catálogo comunitario, onboarding y solo lectura.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Catálogo comunitario',
        desc: 'En Productos → Catálogo público importás fichas sin precio (imagen, nombre, código). Podés compartir tus productos desde la ficha con “Publicar en catálogo”.',
      },
      {
        tag: 'NUEVO',
        title: 'Configuración inicial',
        desc: 'Al registrarte, un asistente te guía: nombre, categorías, primer producto, caja y POS. Podés saltear y retomarlo desde Configuración o /setup.',
      },
      {
        tag: 'MEJORA',
        title: 'Trial vencido: solo lectura',
        desc: 'Si termina la prueba o hay pago pendiente, podés ver todo pero no cargar ventas ni editar hasta activar el plan.',
      },
      {
        tag: 'MEJORA',
        title: 'Configuración reorganizada',
        desc: 'El hub de Configuración agrupa Mi kiosco, POS, facturación, integraciones y seguridad.',
      },
      {
        tag: 'MEJORA',
        title: 'Tutorial paso a paso',
        desc: 'El botón Tutorial avanza de a un paso con Siguiente / Anterior en cada pantalla.',
      },
    ],
  },
  {
    version: 'v1.16',
    date: '2026-09-01',
    summary: 'Cerrar sesión solo en este dispositivo.',
    items: [
      {
        tag: 'MEJORA',
        title: 'Cerrar sesión en este dispositivo',
        desc: 'El botón del menú cierra sesión solo acá. Para cerrar en todos los equipos, andá a Configuración → Seguridad.',
      },
    ],
  },
  {
    version: 'v1.15',
    date: '2026-08-28',
    summary: 'Registrar montos facturados fuera del sistema para el tope fiscal.',
    items: [
      {
        tag: 'NUEVO',
        title: 'Facturas externas por monto',
        desc: 'En Ventas → Facturas podés cargar un monto que facturaste por fuera del sistema. Suma al total facturado y a los topes mensual/anual, sin emitir comprobante desde StockRápido.',
      },
    ],
  },
  {
    version: 'v1.14',
    date: '2026-08-28',
    summary: 'Guardar producto vuelve a la lista y el POS recuerda el carrito.',
    items: [
      {
        tag: 'MEJORA',
        title: 'Editar producto: volver al guardar',
        desc: 'Al guardar cambios en un producto volvés a la pantalla anterior (por ejemplo la lista de productos).',
      },
      {
        tag: 'MEJORA',
        title: 'POS: carrito persistente',
        desc: 'Lo que cargaste en el mostrador se mantiene aunque cambies de pantalla dentro del sistema. Solo en este dispositivo y mientras trabajás; al cobrar o pausar la venta se limpia.',
      },
    ],
  },
  {
    version: 'v1.13',
    date: '2026-08-25',
    summary: 'Link de cuenta para el cliente con estética del sistema y comprobantes.',
    items: [
      {
        tag: 'MEJORA',
        title: 'Link público con look del sistema',
        desc: 'La cuenta del cliente usa la misma tipografía y colores del sistema, con el logo del sidebar (no el del ticket).',
      },
      {
        tag: 'MEJORA',
        title: 'Detalle profesional de cada compra',
        desc: 'Cada movimiento muestra fecha completa, tipo de comprobante, productos con cantidad y precio, y saldo corrido.',
      },
      {
        tag: 'NUEVO',
        title: 'Imprimir o descargar comprobante',
        desc: 'Desde el link, el cliente puede imprimir o descargar el comprobante interno o la Factura C de cada venta a cuenta.',
      },
    ],
  },
  {
    version: 'v1.12',
    date: '2026-08-25',
    summary: 'Link de cuenta corriente operativo y detalle más claro.',
    items: [
      {
        tag: 'FIX',
        title: 'API: share-link de clientes',
        desc: 'Corregimos el build de la API que impedía generar el link único de cuenta corriente (Cannot POST /share-link).',
      },
      {
        tag: 'MEJORA',
        title: 'Detalle de cuenta corriente más claro',
        desc: 'Saldo, ventas y pagos se ven de entrada. Cada venta muestra ítems y botones de editar/facturar/eliminar sin tener que buscar. Link para el cliente bien visible.',
      },
    ],
  },
  {
    version: 'v1.11',
    date: '2026-08-25',
    summary: 'Cuenta corriente más simple en el POS, gestión completa y link para el cliente.',
    items: [
      {
        tag: 'MEJORA',
        title: 'POS: Confirmar cuenta corriente',
        desc: 'Si elegís un cliente, Cobrar pasa a Confirmar y carga directo a la cuenta. No imprime ticket aunque la impresión esté activa.',
      },
      {
        tag: 'FIX',
        title: 'Confirmar sin error fantasma',
        desc: 'Si la venta a cuenta ya se guardó, ya no aparece un “server error” engañoso por un paso posterior (ticket o fiscal).',
      },
      {
        tag: 'NUEVO',
        title: 'Clientes: editar, eliminar y facturar',
        desc: 'En el detalle de la cuenta corriente podés ver cada venta con ítems, editar el descuento, eliminarla (revierte saldo y stock) y facturar una o todas las pendientes. Sigue contando en historial, facturas y estadísticas.',
      },
      {
        tag: 'NUEVO',
        title: 'Link de cuenta para el cliente',
        desc: 'Por cada cliente generás un link permanente de solo lectura para que vea su saldo y movimientos, con la estética del comercio. No vence.',
      },
    ],
  },
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
      {
        tag: 'NUEVO',
        title: 'Topes mensual y anual',
        desc: 'Configurás límite y % de aviso por mes y por año a la vez. Dos barras de progreso y aviso antes de facturar si te acercás a cualquiera.',
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
