export const STOCK_REASONS = [
  { value: 'compra', label: 'Compra a proveedor' },
  { value: 'compra_editada', label: 'Compra editada (reversión)' },
  { value: 'venta', label: 'Venta (ajuste manual)' },
  { value: 'ajuste', label: 'Ajuste de inventario' },
  { value: 'pérdida', label: 'Pérdida' },
  { value: 'rotura', label: 'Rotura' },
  { value: 'vencimiento', label: 'Vencimiento' },
  { value: 'devolución', label: 'Devolución de cliente' },
  { value: 'otro', label: 'Otro' },
] as const;
