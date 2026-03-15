'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

type TourStep = { target: string; label: string; placement?: 'top' | 'bottom' | 'left' | 'right' };

const TOUR_CONFIG: Record<string, TourStep[]> = {
  '/dashboard': [
    { target: '[data-tour="dashboard-pos"]', label: 'Clic acá para ir al punto de venta y cobrar.', placement: 'bottom' },
    { target: '[data-tour="dashboard-ventas-hoy"]', label: 'Total vendido hoy y cantidad de ventas.', placement: 'bottom' },
    { target: '[data-tour="dashboard-stock-bajo"]', label: 'Productos con stock por debajo del mínimo.', placement: 'bottom' },
    { target: '[data-tour="dashboard-por-vencer"]', label: 'Productos que vencen en los próximos 30 días. Clic para ver en Reportes.', placement: 'bottom' },
    { target: '[data-tour="dashboard-caja"]', label: 'Indica si la caja está abierta o cerrada. "Ver caja" o "Abrir caja" te lleva a Caja.', placement: 'bottom' },
    { target: '[data-tour="dashboard-links"]', label: 'Accesos rápidos: Reportes, Productos, Compras, Clientes.', placement: 'top' },
  ],
  '/pos': [
    { target: '[data-tour="pos-search"]', label: 'Buscador: escribí nombre o código de barras. F2 para enfocar. Los resultados aparecen abajo; Enter o clic agrega al carrito.', placement: 'bottom' },
    { target: '[data-tour="pos-manual"]', label: 'Producto manual: cargar un ítem sin código (nombre y precio). Útil para servicios.', placement: 'bottom' },
    { target: '[data-tour="pos-results"]', label: 'Acá aparecen los productos de la búsqueda. Usá ↑/↓ y Enter para agregar, o clic en la fila.', placement: 'top' },
    { target: '[data-tour="pos-cart"]', label: 'Carrito: cada fila tiene − y + para cantidad, campo de precio editable y × para quitar. El total se actualiza solo.', placement: 'left' },
    { target: '[data-tour="pos-fiado"]', label: 'Vender al fiado: elegir un cliente para dejar la venta en cuenta corriente.', placement: 'top' },
    { target: '[data-tour="pos-pausar"]', label: 'Pausar (F6): guarda esta venta en espera y vacía el carrito para atender otro cliente.', placement: 'top' },
    { target: '[data-tour="pos-cobrar"]', label: 'Cobrar (F5): abre el cuadro para elegir forma de pago (Efectivo, Transferencia, etc.) y confirma la venta.', placement: 'top' },
    { target: '[data-tour="pos-shortcuts"]', label: 'Botón ?: muestra todos los atajos de teclado (F2, F4, F5, etc.).', placement: 'bottom' },
  ],
  '/ventas': [
    { target: '[data-tour="ventas-filters"]', label: 'Filtros: fechas Desde/Hasta, límite de resultados y cliente (para ver ventas al fiado).', placement: 'bottom' },
    { target: '[data-tour="ventas-table"]', label: 'Tabla de ventas: fecha, total, forma de pago, cliente. "Ver detalle" abre el detalle de ítems.', placement: 'top' },
  ],
  '/caja': [
    { target: '[data-tour="caja-open"]', label: 'Abrir caja: monto inicial (ej. vuelto) y notas. Solo una caja abierta a la vez.', placement: 'bottom' },
    { target: '[data-tour="caja-movements"]', label: 'Movimientos: ingresos y egresos de dinero con monto y nota.', placement: 'top' },
    { target: '[data-tour="caja-close"]', label: 'Cerrar caja: conteo por forma de pago y cierre del turno.', placement: 'top' },
  ],
  '/productos': [
    { target: '[data-tour="productos-nuevo"]', label: 'Nuevo producto: crea un producto con nombre, código, precio, stock, categoría.', placement: 'bottom' },
    { target: '[data-tour="productos-filters"]', label: 'Buscar, filtrar por categoría, stock bajo o por vencer.', placement: 'bottom' },
    { target: '[data-tour="productos-table"]', label: 'Lista de productos. Clic en el nombre para editar.', placement: 'top' },
  ],
  '/movimientos': [
    { target: '[data-tour="movimientos-table"]', label: 'Historial de entradas y salidas de stock de todos los productos. Clic en el producto para ir a editarlo.', placement: 'top' },
  ],
  '/reportes': [
    { target: '[data-tour="reportes-periodo"]', label: 'Período: Hoy, Semana o Mes para ventas y márgenes.', placement: 'bottom' },
    { target: '[data-tour="reportes-export"]', label: 'Exportar CSV: descarga las ventas para Excel.', placement: 'bottom' },
  ],
  '/compras': [
    { target: '[data-tour="compras-proveedor"]', label: 'Elegí el proveedor de esta compra. Podés crear uno nuevo desde acá.', placement: 'bottom' },
    { target: '[data-tour="compras-form"]', label: 'Formulario de la compra. Cada fila es un ítem: buscá producto o cargá a mano.', placement: 'top' },
    { target: '[data-tour="compras-items"]', label: 'Ítems: nombre/código, cantidad, costo, precio venta, vencimiento. "+ Agregar ítem" para más filas.', placement: 'top' },
    { target: '[data-tour="compras-guardar"]', label: 'Guardar compra registra la compra, actualiza stock y precios.', placement: 'top' },
    { target: '[data-tour="compras-history"]', label: 'Historial: filtrar por proveedor y fechas. Ver, Repetir o Editar.', placement: 'top' },
  ],
  '/proveedores': [
    { target: '[data-tour="proveedores-nuevo"]', label: 'Nuevo proveedor: abre el formulario para cargar nombre, teléfono, email, dirección.', placement: 'bottom' },
    { target: '[data-tour="proveedores-form"]', label: 'Completá nombre (obligatorio), teléfono, email y dirección. Guardar para crear.', placement: 'top' },
    { target: '[data-tour="proveedores-list"]', label: 'Lista de proveedores. Se eligen en Compras al cargar una compra.', placement: 'top' },
  ],
  '/clientes': [
    { target: '[data-tour="clientes-nuevo"]', label: 'Nuevo cliente: abre el formulario.', placement: 'bottom' },
    { target: '[data-tour="clientes-form"]', label: 'Nombre (obligatorio), teléfono y notas. Sirve para vender al fiado en el POS.', placement: 'top' },
    { target: '[data-tour="clientes-total"]', label: 'Total fiado: suma de deudas de todos los clientes.', placement: 'bottom' },
    { target: '[data-tour="clientes-cobrar"]', label: 'Cobrar: registrar un pago de un cliente para bajar su saldo.', placement: 'top' },
  ],
  '/promociones': [
    { target: '[data-tour="promos-nueva"]', label: 'Nueva promoción: abre el formulario.', placement: 'bottom' },
    { target: '[data-tour="promos-form"]', label: 'Nombre, tipo (%, monto, BOGO, precio fijo), valor. Buscá productos para combos y definí cantidades.', placement: 'top' },
    { target: '[data-tour="promos-list"]', label: 'Lista de promociones. Editar o eliminar.', placement: 'top' },
  ],
  '/productos/nuevo': [
    { target: '[data-tour="nuevo-producto-form"]', label: 'Formulario de nuevo producto. Completá los campos y guardá.', placement: 'bottom' },
    { target: '[data-tour="nuevo-producto-nombre"]', label: 'Nombre del producto (obligatorio).', placement: 'bottom' },
    { target: '[data-tour="nuevo-producto-barcode"]', label: 'Código de barras. Opcional; sirve para buscar en el POS.', placement: 'bottom' },
    { target: '[data-tour="nuevo-producto-categoria"]', label: 'Categoría. Podés elegir una existente o crear una nueva.', placement: 'bottom' },
    { target: '[data-tour="nuevo-producto-costo-precio"]', label: 'Costo (lo que te cuesta) y Precio venta (obligatorio).', placement: 'top' },
    { target: '[data-tour="nuevo-producto-stock"]', label: 'Stock inicial y stock mínimo (para alertas de reposición).', placement: 'top' },
    { target: '[data-tour="nuevo-producto-vencimiento"]', label: 'Vencimiento opcional. Útil para productos con fecha de vencimiento.', placement: 'top' },
    { target: '[data-tour="nuevo-producto-guardar"]', label: 'Guardar crea el producto y te lleva a la lista. Cancelar vuelve sin guardar.', placement: 'bottom' },
  ],
  // Editar producto: subpantalla /productos/[id]
  '/productos/editar': [
    { target: '[data-tour="editar-producto-form"]', label: 'Datos del producto: nombre, código, categoría, costo, precio, stock mínimo. Guardar aplica los cambios.', placement: 'bottom' },
    { target: '[data-tour="editar-producto-stock"]', label: 'Stock actual y lotes (cada lote tiene cantidad, costo y vencimiento). Se crean al cargar compras.', placement: 'top' },
    { target: '[data-tour="editar-producto-ajuste"]', label: 'Ajuste de stock: cantidad (+ o -) y motivo. Útil para correcciones o mermas.', placement: 'top' },
    { target: '[data-tour="editar-producto-movimientos"]', label: 'Historial de movimientos: entradas y salidas de stock con fecha y motivo.', placement: 'top' },
  ],
  '/config': [
    { target: '[data-tour="config-negocio"]', label: 'Datos del negocio: nombre, CUIT, dirección. Guardar para actualizar.', placement: 'bottom' },
    { target: '[data-tour="config-categorias"]', label: 'Categorías de productos. Agregá una nueva con el campo y el botón Agregar.', placement: 'top' },
  ],
  '/usuarios': [
    { target: '[data-tour="usuarios-nuevo"]', label: 'Nuevo usuario: abre el formulario para crear un usuario (email, nombre, contraseña, rol).', placement: 'bottom' },
    { target: '[data-tour="usuarios-form"]', label: 'Email, nombre, contraseña y rol (Cajero, Admin, etc.). Crear usuario para dar de alta.', placement: 'top' },
    { target: '[data-tour="usuarios-list"]', label: 'Lista de usuarios. Podés activar o desactivar cada uno.', placement: 'top' },
  ],
  '/billing': [
    { target: '[data-tour="billing-info"]', label: 'Plan y facturación: información del plan actual y estado de pago.', placement: 'bottom' },
  ],
};

function getRouteFromPath(pathname: string): string {
  // Subpantallas con ruta dinámica: editar producto es /productos/[id]
  if (pathname === '/productos/nuevo') return '/productos/nuevo';
  if (pathname.startsWith('/productos/')) return '/productos/editar';
  // Rutas más específicas primero
  const routes = Object.keys(TOUR_CONFIG).sort((a, b) => b.length - a.length);
  for (const r of routes) {
    if (pathname === r || pathname.startsWith(r + '/')) return r;
  }
  return pathname;
}

type MeasuredStep = TourStep & { rect: DOMRect };

export function TutorialOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const route = getRouteFromPath(pathname);
  const steps = TOUR_CONFIG[route] ?? [];
  const [measured, setMeasured] = useState<MeasuredStep[]>([]);
  const [viewport, setViewport] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1920, h: typeof window !== 'undefined' ? window.innerHeight : 1080 });

  const measure = useCallback(() => {
    if (typeof window !== 'undefined') setViewport({ w: window.innerWidth, h: window.innerHeight });
    if (!open || steps.length === 0) {
      setMeasured([]);
      return;
    }
    const next: MeasuredStep[] = [];
    for (const step of steps) {
      const el = document.querySelector(step.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) next.push({ ...step, rect });
      }
    }
    setMeasured(next);
  }, [open, pathname, steps]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(measure, 100);
    return () => clearTimeout(t);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  if (!open) return null;

  const padding = 4;
  const maskRects = measured.map((m) => ({
    x: m.rect.left - padding,
    y: m.rect.top - padding,
    w: m.rect.width + padding * 2,
    h: m.rect.height + padding * 2,
  }));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      {/* Fondo oscuro con agujeros (SVG mask) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} width={viewport.w} height={viewport.h} viewBox={`0 0 ${viewport.w} ${viewport.h}`}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="white" />
            {maskRects.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="black" rx="4" />
            ))}
          </mask>
        </defs>
        <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="rgba(0,0,0,0.75)" mask="url(#tour-mask)" />
      </svg>

      {/* Bordes de resalte alrededor de cada elemento */}
      {measured.map((m, i) => (
        <div
          key={i}
          className="absolute rounded-lg pointer-events-none border-2 border-sky-400 shadow-lg shadow-sky-500/30"
          style={{
            zIndex: 2,
            left: m.rect.left - 2,
            top: m.rect.top - 2,
            width: m.rect.width + 4,
            height: m.rect.height + 4,
          }}
        />
      ))}

      {/* Etiquetas con flecha (index para desplazamiento y evitar superposición) */}
      {measured.map((m, i) => (
        <Tooltip key={i} index={i} rect={m.rect} label={m.label} placement={m.placement ?? 'bottom'} zIndex={3} />
      ))}

      {/* Botón Cerrar y mensaje */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto" style={{ zIndex: 10 }}>
        {measured.length === 0 && steps.length === 0 && (
          <p className="text-slate-400 text-sm">No hay guía visual para esta pantalla.</p>
        )}
        <p className="text-slate-300 text-sm">Clic en cualquier lado para cerrar</p>
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-500"
        >
          Cerrar tutorial
        </button>
      </div>
    </div>
  );
}

const TOOLTIP_GAP = 24;
const TOOLTIP_INDEX_OFFSET = 12;
const TOOLTIP_MARGIN = 10;

function Tooltip({
  index,
  rect,
  label,
  placement,
  zIndex,
}: {
  index: number;
  rect: DOMRect;
  label: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  zIndex: number;
}) {
  const isTop = placement === 'top';
  const isBottom = placement === 'bottom';
  const isLeft = placement === 'left';
  const offset = index * TOOLTIP_INDEX_OFFSET;

  let style: React.CSSProperties = {
    position: 'fixed' as const,
    zIndex,
    maxWidth: 280,
    margin: TOOLTIP_MARGIN,
  };
  let arrowClass = '';

  if (isTop) {
    style.left = rect.left + rect.width / 2;
    style.top = rect.top - TOOLTIP_GAP - offset;
    style.transform = 'translate(-50%, -100%)';
    arrowClass = 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-[6px] border-transparent border-t-slate-700';
  } else if (isBottom) {
    style.left = rect.left + rect.width / 2;
    style.top = rect.bottom + TOOLTIP_GAP + offset;
    style.transform = 'translate(-50%, 0)';
    arrowClass = 'top-0 left-1/2 -translate-x-1/2 -translate-y-full border-[6px] border-transparent border-b-slate-700';
  } else if (isLeft) {
    style.left = rect.left - TOOLTIP_GAP - offset;
    style.top = rect.top + rect.height / 2;
    style.transform = 'translate(-100%, -50%)';
    arrowClass = 'right-0 top-1/2 translate-x-full -translate-y-1/2 border-[6px] border-transparent border-l-slate-700';
  } else {
    style.left = rect.right + TOOLTIP_GAP + offset;
    style.top = rect.top + rect.height / 2;
    style.transform = 'translate(0, -50%)';
    arrowClass = 'left-0 top-1/2 -translate-x-full -translate-y-1/2 border-[6px] border-transparent border-r-slate-700';
  }

  return (
    <div className="pointer-events-auto" style={style}>
      <div className="relative bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 shadow-xl">
        <p className="text-slate-100 text-sm leading-relaxed">{label}</p>
        <div className={`absolute w-0 h-0 ${arrowClass}`} />
      </div>
    </div>
  );
}
