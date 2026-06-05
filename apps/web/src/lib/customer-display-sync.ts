/** Misma pestaña/origen: BroadcastChannel sincroniza POS ↔ pantalla cliente (segundo monitor). */

export const CUSTOMER_DISPLAY_CHANNEL = 'stockrapido-customer-display';

/** Cuánto se muestra el cartel de «Compra confirmada» en la pantalla cliente (solo eso, luego vuelve al estado normal). */
export const CUSTOMER_DISPLAY_SUCCESS_MS = 10_000;

/** Transferencia / MP: mostrar alias al cliente. Tarjetas: mostrar QR. El cajero confirma después en el POS. */
export function paymentNeedsCustomerConfirmStep(methodId: string): boolean {
  return (
    methodId === 'transferencia' ||
    methodId === 'mercadopago' ||
    methodId === 'tarjeta_debito' ||
    methodId === 'tarjeta_credito'
  );
}

export function paymentShowsAliasOnCustomer(methodId: string): boolean {
  return methodId === 'transferencia' || methodId === 'mercadopago';
}

export function paymentShowsQrOnCustomer(methodId: string): boolean {
  return methodId === 'tarjeta_debito' || methodId === 'tarjeta_credito';
}

export type CustomerDisplayBroadcast =
  | {
      kind: 'sale';
      phase: 'idle' | 'cart' | 'payment';
      /** En cobro: método elegido por el cajero para mostrar alias/QR antes de confirmar la venta */
      selectedPaymentMethod?: string | null;
      items: { name: string; qty: number; unitPrice: number; lineTotal: number; imageUrl?: string | null }[];
      subtotal: number;
      discount: number;
      total: number;
      fiadoCustomerName?: string | null;
    }
  | {
      kind: 'success';
      total: number;
      paymentMethod: string;
      paymentLabel: string;
    };

/** Una instancia en el POS para emitir sin recrear el canal. */
let posChannel: BroadcastChannel | null = null;

export function getCustomerDisplayBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!posChannel) posChannel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
  return posChannel;
}

/** Instancia en la pantalla cliente para escuchar. */
let viewerChannel: BroadcastChannel | null = null;

function getViewerBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!viewerChannel) viewerChannel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
  return viewerChannel;
}

export function broadcastCustomerDisplay(msg: CustomerDisplayBroadcast) {
  try {
    const ch = getCustomerDisplayBroadcastChannel();
    ch?.postMessage(msg);
  } catch {
    /* ignore */
  }
}

export function subscribeCustomerDisplay(handler: (msg: CustomerDisplayBroadcast) => void) {
  const ch = getViewerBroadcastChannel();
  if (!ch) return () => {};
  const fn = (ev: MessageEvent<CustomerDisplayBroadcast>) => {
    if (!ev?.data || typeof ev.data !== 'object') return;
    handler(ev.data);
  };
  ch.addEventListener('message', fn as EventListener);
  return () => ch.removeEventListener('message', fn as EventListener);
}

export function openCustomerDisplayWindow() {
  if (typeof window === 'undefined') return null;
  const w = window.open(
    '/customer-display',
    'stockrapidoCustomerDisplay',
    'noopener,noreferrer,width=1200,height=900',
  );
  return w;
}
