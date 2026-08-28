/** Carrito POS en el dispositivo: solo para la sesión de trabajo, no entre dispositivos. */

export type PosSessionCustomer = { id: string; name: string; balance?: number } | null;

export type PosSessionCartItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  discount: number;
  imageUrl?: string | null;
  productSilent?: boolean;
  silentTicket?: boolean;
};

export type PosSessionSnapshot = {
  cart: PosSessionCartItem[];
  discountTotal: number;
  selectedCustomer: PosSessionCustomer;
};

const STORAGE_KEY = 'stockrapido:pos-session';

export function readPosSession(): PosSessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PosSessionSnapshot>;
    if (!v || typeof v !== 'object') return null;
    const cart = Array.isArray(v.cart) ? v.cart : [];
    const discountTotal = typeof v.discountTotal === 'number' && Number.isFinite(v.discountTotal) ? v.discountTotal : 0;
    const selectedCustomer =
      v.selectedCustomer === null
        ? null
        : v.selectedCustomer &&
            typeof v.selectedCustomer.id === 'string' &&
            typeof v.selectedCustomer.name === 'string'
          ? {
              id: v.selectedCustomer.id,
              name: v.selectedCustomer.name,
              balance:
                typeof v.selectedCustomer.balance === 'number' ? v.selectedCustomer.balance : undefined,
            }
          : null;
    return { cart, discountTotal, selectedCustomer };
  } catch {
    return null;
  }
}

export function writePosSession(snapshot: PosSessionSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function clearPosSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
