/** Canal de movimientos manuales (coincide con category en CashMovement). */
export type MovChannel = 'efectivo' | 'banco';

/** Ventas POS: efectivo en caja física; banco = tarjetas/transferencias/MP; fiado no suma caja. */
export function saleChannel(paymentMethod: string | null | undefined): MovChannel | null {
  if (!paymentMethod || paymentMethod === 'fiado') return null;
  if (paymentMethod === 'efectivo') return 'efectivo';
  if (
    ['tarjeta_debito', 'tarjeta_credito', 'transferencia', 'mercadopago'].includes(paymentMethod)
  ) {
    return 'banco';
  }
  return 'banco';
}

export function movementChannel(category: string | null | undefined): MovChannel {
  return category === 'banco' ? 'banco' : 'efectivo';
}
