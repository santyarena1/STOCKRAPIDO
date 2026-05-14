export const STOCK_REASONS = [
  { value: 'compra', label: 'Compra a proveedor' },
  { value: 'compra_editada', label: 'Compra editada (reversión)' },
  { value: 'stock_inicial', label: 'Stock inicial (alta de producto)' },
  { value: 'alta_producto', label: 'Alta de producto (sin stock inicial)' },
  { value: 'venta', label: 'Venta' },
  { value: 'ajuste', label: 'Ajuste de inventario' },
  { value: 'pérdida', label: 'Pérdida' },
  { value: 'rotura', label: 'Rotura' },
  { value: 'vencimiento', label: 'Vencimiento' },
  { value: 'devolución', label: 'Devolución de cliente' },
  { value: 'correccion_venta', label: 'Corrección / anulación de venta' },
  { value: 'otro', label: 'Otro' },
] as const;
