'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

type TutorialSection = { title: string; items: { label: string; desc: string }[] };

const TUTORIAL_BY_ROUTE: Record<string, TutorialSection[]> = {
  '/dashboard': [
    { title: 'Resumen', items: [
      { label: 'Tarjeta POS', desc: 'Enlace para ir al punto de venta y cobrar.' },
      { label: 'Ventas hoy', desc: 'Total vendido y cantidad de ventas del día.' },
      { label: 'Stock bajo', desc: 'Cantidad de productos con stock por debajo del mínimo.' },
      { label: 'Por vencer', desc: 'Productos que vencen en los próximos 30 días. Clic para ir a Reportes.' },
      { label: 'Caja abierta / cerrada', desc: 'Indica si tenés la caja abierta. "Ver caja" o "Abrir caja" te lleva a la pantalla de Caja.' },
      { label: 'Botones Reportes, Productos, Compras, Clientes', desc: 'Accesos rápidos a cada sección.' },
    ]},
  ],
  '/pos': [
    { title: 'Búsqueda y productos', items: [
      { label: 'Campo de búsqueda', desc: 'Escribí nombre o código de barras del producto. Podés usar F2 para enfocar. Al buscar aparecen resultados; Enter o clic agrega al carrito.' },
      { label: 'Botón "Producto manual"', desc: 'Abre un cuadro para cargar un ítem sin código: nombre y precio. Útil para servicios o productos que no están en el sistema.' },
      { label: 'Lista de resultados', desc: 'Usá ↑/↓ para moverte y Enter para agregar. Clic en una fila también agrega.' },
    ]},
    { title: 'Carrito', items: [
      { label: 'Nombre del producto', desc: 'Se muestra a la izquierda de cada fila.' },
      { label: 'Botón − (menos)', desc: 'Resta 1 unidad. Si llega a 0, el ítem se quita del carrito.' },
      { label: 'Campo cantidad', desc: 'Número editable. Podés tipear la cantidad directo (mínimo 1).' },
      { label: 'Botón + (más)', desc: 'Suma 1 unidad.' },
      { label: 'Campo precio ($)', desc: 'Precio de venta por unidad. Es editable; podés cambiarlo para esta venta.' },
      { label: 'Subtotal por fila', desc: 'Cantidad × precio (en azul).' },
      { label: '× (quitar)', desc: 'Elimina el ítem del carrito. Atajo: Ctrl+Backspace quita el último ítem.' },
    ]},
    { title: 'Totales y cobro', items: [
      { label: 'Subtotal', desc: 'Suma de todos los ítems del carrito.' },
      { label: 'Descuento (F4)', desc: 'Si aplicaste descuento con F4, se muestra aquí.' },
      { label: 'Total', desc: 'Monto final a cobrar.' },
      { label: '"Al fiado: nombre"', desc: 'Si elegiste un cliente para vender al fiado, se muestra su nombre.' },
      { label: 'Botón Cobrar (F5)', desc: 'Abre el cuadro para elegir forma de pago. Luego confirma la venta.' },
      { label: 'Formas de pago', desc: 'Efectivo, Tarjeta débito/crédito, Transferencia, Mercado Pago, Fiado. Podés elegir con teclas 1 a 6.' },
      { label: 'Botón Descuento (F4)', desc: 'Abre un cuadro para aplicar un descuento en pesos sobre el total del carrito.' },
      { label: 'Botón Pausar (F6)', desc: 'Guarda la venta actual en espera y deja el carrito vacío para atender otro cliente. Después podés recuperarla desde "Ventas en espera".' },
      { label: 'Botón ?', desc: 'Muestra la lista de atajos de teclado.' },
    ]},
  ],
  '/ventas': [
    { title: 'Filtros', items: [
      { label: 'Desde / Hasta', desc: 'Fechas para filtrar las ventas. Dejá en blanco para no filtrar por fecha.' },
      { label: 'Límite', desc: 'Cantidad máxima de ventas a mostrar (ej. 50, 100).' },
      { label: 'Cliente', desc: 'Filtrar solo ventas de un cliente (útil para ver ventas al fiado de una persona).' },
    ]},
    { title: 'Tabla de ventas', items: [
      { label: 'Fecha', desc: 'Fecha y hora de la venta.' },
      { label: 'Total', desc: 'Monto total de la venta.' },
      { label: 'Forma de pago', desc: 'Efectivo, Transferencia, Fiado, etc.' },
      { label: 'Cliente', desc: 'Si fue al fiado, nombre del cliente.' },
      { label: 'Ver detalle', desc: 'Abre un cuadro con los ítems de esa venta (productos, cantidades, precios).' },
    ]},
    { title: 'Resumen y detalle', items: [
      { label: 'Totales abajo de la tabla', desc: 'Suma de ventas y descuentos del período filtrado.' },
      { label: 'Modal de detalle', desc: 'Lista de productos, cantidades, precios unitarios y total de esa venta. También muestra forma de pago.' },
    ]},
  ],
  '/caja': [
    { title: 'Abrir caja', items: [
      { label: 'Monto inicial', desc: 'Efectivo con el que abrís la caja (ej. vuelto para dar cambio).' },
      { label: 'Notas', desc: 'Opcional: comentario del turno o motivo.' },
      { label: 'Botón Abrir caja', desc: 'Registra la apertura. Solo podés tener una caja abierta a la vez.' },
    ]},
    { title: 'Caja abierta', items: [
      { label: 'Movimiento: Ingreso / Egreso', desc: 'Tipo de movimiento (entrada o salida de dinero).' },
      { label: 'Monto', desc: 'Cantidad en pesos.' },
      { label: 'Nota', desc: 'Motivo opcional (ej. "Pago de servicio", "Retiro para depósito").' },
      { label: 'Agregar movimiento', desc: 'Registra el movimiento en la caja actual.' },
      { label: 'Cerrar caja', desc: 'Te pide el conteo por forma de pago (efectivo, etc.) y cierra el turno. Después podés ver el historial.' },
    ]},
    { title: 'Historial', items: [
      { label: 'Desde / Hasta', desc: 'Filtro de fechas para ver cierres anteriores.' },
      { label: 'Lista de cierres', desc: 'Cada fila muestra apertura, cierre, montos y movimientos de ese turno.' },
    ]},
  ],
  '/productos': [
    { title: 'Acciones y filtros', items: [
      { label: 'Botón Nuevo producto', desc: 'Lleva al formulario para crear un producto (nombre, código, precio, stock, categoría, etc.).' },
      { label: 'Buscar', desc: 'Filtra por nombre o código de barras en la lista actual.' },
      { label: 'Todas las categorías', desc: 'Desplegable para ver solo productos de una categoría.' },
      { label: 'Stock bajo', desc: 'Si está marcado, muestra solo productos con stock por debajo del mínimo.' },
      { label: 'Por vencer (30 días)', desc: 'Si está marcado, muestra solo productos que vencen en los próximos 30 días.' },
    ]},
    { title: 'Tabla', items: [
      { label: 'Producto', desc: 'Nombre; clic para editar el producto.' },
      { label: 'Categoría', desc: 'Categoría asignada.' },
      { label: 'Precio', desc: 'Precio de venta.' },
      { label: 'Stock', desc: 'Cantidad actual en stock.' },
      { label: 'Mín.', desc: 'Stock mínimo (para alertas).' },
      { label: 'Vencimiento', desc: 'Fecha de vencimiento si tiene.' },
    ]},
  ],
  '/compras': [
    { title: 'Nueva compra', items: [
      { label: 'Proveedor', desc: 'Elegí un proveedor de la lista o creá uno nuevo desde el selector.' },
      { label: 'Buscar producto', desc: 'En cada fila podés buscar por nombre o código y elegir un producto existente, o cargar datos a mano.' },
      { label: 'Filas: Nombre, Código, Categoría', desc: 'Si no usás búsqueda, completá nombre, código de barras y categoría manualmente.' },
      { label: 'Cantidad', desc: 'Unidades compradas.' },
      { label: 'Costo unit.', desc: 'Precio de costo por unidad.' },
      { label: 'Precio venta', desc: 'Precio al que vas a vender (para que quede guardado en el producto).' },
      { label: 'Stock mín.', desc: 'Stock mínimo para este producto (opcional).' },
      { label: 'Vencimiento', desc: 'Fecha de vencimiento del lote (opcional).' },
      { label: 'Agregar ítem', desc: 'Añade otra fila para otro producto en la misma compra.' },
      { label: 'Quitar (×)', desc: 'Elimina esa fila del formulario.' },
      { label: 'Guardar compra', desc: 'Registra la compra: actualiza stock, costos y precios según lo cargado.' },
    ]},
    { title: 'Historial de compras', items: [
      { label: 'Filtros: Proveedor, Desde, Hasta', desc: 'Filtrar compras por proveedor y rango de fechas.' },
      { label: 'Tabla', desc: 'Cada compra muestra fecha, proveedor, total y acciones.' },
      { label: 'Ver', desc: 'Ver detalle de ítems de esa compra.' },
      { label: 'Repetir', desc: 'Carga los mismos ítems en el formulario para hacer una compra similar.' },
      { label: 'Editar', desc: 'Abre el formulario con los datos de esa compra para corregir (si la app lo permite).' },
    ]},
  ],
  '/proveedores': [
    { title: 'Listado y formulario', items: [
      { label: 'Botón Nuevo proveedor / Cerrar', desc: 'Muestra u oculta el formulario de alta.' },
      { label: 'Nombre *', desc: 'Nombre del proveedor (obligatorio).' },
      { label: 'Teléfono', desc: 'Teléfono de contacto.' },
      { label: 'Email', desc: 'Correo electrónico.' },
      { label: 'Dirección', desc: 'Dirección opcional.' },
      { label: 'Guardar', desc: 'Crea el proveedor y lo agrega a la lista. Después podés elegirlo en Compras.' },
    ]},
  ],
  '/clientes': [
    { title: 'Clientes y fiados', items: [
      { label: 'Botón Nuevo cliente / Cerrar', desc: 'Abre o cierra el formulario para dar de alta un cliente.' },
      { label: 'Nombre, Teléfono, Notas', desc: 'Datos del cliente. Al guardar queda disponible para vender "al fiado" en el POS.' },
      { label: 'Total fiado', desc: 'Suma de saldos en cuenta corriente de todos los clientes.' },
      { label: 'Lista de clientes', desc: 'Nombre, teléfono y saldo (deuda).' },
      { label: 'Cobrar / Registrar pago', desc: 'Abre un cuadro para registrar un pago del cliente: monto y nota. Reduce su saldo fiado.' },
      { label: 'Morosos', desc: 'Clientes con saldo pendiente (deuda).' },
    ]},
  ],
  '/reportes': [
    { title: 'Período y datos', items: [
      { label: 'Hoy / Semana / Mes', desc: 'Período para ventas, productos más vendidos y márgenes.' },
      { label: 'Ventas', desc: 'Total vendido y cantidad de ventas en el período.' },
      { label: 'Productos más vendidos', desc: 'Lista de productos con cantidades y totales.' },
      { label: 'Margen', desc: 'Ingresos, costos y margen en el período.' },
      { label: 'Stock bajo', desc: 'Productos con stock por debajo del mínimo.' },
      { label: 'Por vencer', desc: 'Productos que vencen en los próximos 30 días.' },
      { label: 'Exportar CSV', desc: 'Descarga un archivo con las ventas para abrir en Excel o similar.' },
    ]},
  ],
  '/movimientos': [
    { title: 'Movimientos de stock', items: [
      { label: 'Descripción', desc: 'Historial de todas las entradas y salidas de stock: compras, ventas, ajustes manuales, etc.' },
      { label: 'Columnas', desc: 'Fecha y hora, producto, cantidad (+ o -), motivo del movimiento.' },
      { label: 'Motivos', desc: 'Pueden ser "Compra", "Venta", "Ajuste", "Vencimiento", etc., según cómo esté configurado.' },
    ]},
  ],
  '/promociones': [
    { title: 'Listado y filtro', items: [
      { label: 'Solo activas', desc: 'Si está marcado, muestra solo promociones activas y vigentes.' },
      { label: 'Nueva promoción', desc: 'Abre el formulario para crear una promoción.' },
    ]},
    { title: 'Crear / editar promoción', items: [
      { label: 'Nombre', desc: 'Nombre de la promoción (ej. "2x1 en gaseosas").' },
      { label: 'Descripción', desc: 'Texto opcional que describe la oferta.' },
      { label: 'Tipo', desc: 'Porcentaje de descuento, monto fijo, BOGO (comprá N llevá M gratis) o Precio fijo del combo.' },
      { label: 'Valor', desc: 'Según el tipo: % de descuento, monto en $, cantidades para BOGO, o precio total del combo.' },
      { label: 'Monto mínimo', desc: 'Opcional: compra mínima para que aplique la promoción.' },
      { label: 'Código', desc: 'Código opcional que el cliente puede ingresar (si está implementado en el POS).' },
      { label: 'Válida desde / hasta', desc: 'Fechas de vigencia. Vacío = sin límite.' },
      { label: 'Buscar producto', desc: 'Para combos: buscá productos y agregálos con cantidad (ej. 3 alfajores, 1 coca).' },
      { label: 'Productos del combo', desc: 'Lista de productos y cantidades que forman la promoción. En "precio fijo" es el precio total de todo el combo.' },
      { label: 'Categorías', desc: 'Opcional: que la promo aplique solo a productos de ciertas categorías.' },
      { label: 'Activa', desc: 'Si está marcada, la promoción puede aplicarse; si no, queda guardada pero no se usa.' },
    ]},
    { title: 'Tabla de promociones', items: [
      { label: 'Nombre, tipo, valor, vigencia', desc: 'Resumen de cada promoción.' },
      { label: 'Editar / Eliminar', desc: 'Modificar o borrar la promoción.' },
    ]},
  ],
  '/config': [
    { title: 'Configuración', items: [
      { label: 'Opciones', desc: 'Datos del negocio, moneda, y otras preferencias que aparezcan en esta pantalla. Cada campo suele indicar para qué sirve.' },
    ]},
  ],
  '/usuarios': [
    { title: 'Usuarios', items: [
      { label: 'Lista de usuarios', desc: 'Usuarios que pueden iniciar sesión en la aplicación.' },
      { label: 'Nuevo usuario / Editar', desc: 'Crear o modificar usuario: nombre, email, contraseña y rol si aplica.' },
    ]},
  ],
  '/billing': [
    { title: 'Plan y facturación', items: [
      { label: 'Contenido', desc: 'Información del plan contratado, facturación y renovación, si la app tiene esta sección activa.' },
    ]},
  ],
};

const ROUTE_ORDER = [
  '/dashboard', '/pos', '/ventas', '/caja', '/productos', '/movimientos',
  '/compras', '/proveedores', '/clientes', '/reportes', '/promociones',
  '/config', '/usuarios', '/billing',
];

function getRouteFromPath(pathname: string): string {
  return ROUTE_ORDER.find((r) => pathname === r || pathname.startsWith(r + '/')) ?? '/dashboard';
}

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pos': 'POS',
  '/ventas': 'Historial de ventas',
  '/caja': 'Caja',
  '/productos': 'Productos',
  '/movimientos': 'Movimientos',
  '/compras': 'Compras',
  '/proveedores': 'Proveedores',
  '/clientes': 'Clientes / Fiados',
  '/reportes': 'Reportes',
  '/promociones': 'Promociones',
  '/config': 'Configuración',
  '/usuarios': 'Usuarios',
  '/billing': 'Plan y facturación',
};

export function TutorialModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [selectedRoute, setSelectedRoute] = useState('/dashboard');
  useEffect(() => {
    if (open) setSelectedRoute(getRouteFromPath(pathname));
  }, [open, pathname]);
  const sections = TUTORIAL_BY_ROUTE[selectedRoute] ?? TUTORIAL_BY_ROUTE['/dashboard'] ?? [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/80">
          <h2 className="text-lg font-bold text-white">Tutorial — ¿Qué es cada cosa?</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-2 border-b border-slate-700 bg-slate-800/50">
          <label className="text-xs text-slate-400 block mb-1">Pantalla a consultar</label>
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm"
          >
            {ROUTE_ORDER.map((route) => (
              <option key={route} value={route}>
                {ROUTE_LABELS[route] ?? route}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {sections.length === 0 ? (
            <p className="text-slate-400">No hay tutorial para esta pantalla todavía.</p>
          ) : (
            sections.map((sec) => (
              <section key={sec.title}>
                <h3 className="text-sky-400 font-semibold mb-3">{sec.title}</h3>
                <ul className="space-y-3">
                  {sec.items.map((item) => (
                    <li key={item.label} className="flex gap-3">
                      <span className="shrink-0 font-medium text-slate-200 min-w-[140px]">{item.label}</span>
                      <span className="text-slate-400 text-sm">{item.desc}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
