/**
 * Aritmética de fidelización y decisión fiscal del MODO PRO.
 * Enteros en centavos y puntos. El redondeo de puntos es siempre hacia abajo.
 */

export type FiscalMode = 'internal' | 'factura_c' | 'auto_mp';

export type PointBuckets = {
  purchased: number;
  free: number;
};

const INTERNAL_TENDERS = new Set(['efectivo', 'fiado', 'cuenta_corriente', 'puntos']);

export function arsToCents(value: unknown): number {
  if (value == null || value === '') return 0;
  let raw: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    raw = value.toFixed(2);
  } else if (typeof value === 'object' && value && 'toFixed' in (value as object)) {
    raw = (value as { toFixed: (digits: number) => string }).toFixed(2);
  } else {
    raw = String(value).trim().replace(/\s/g, '').replace(',', '.');
  }
  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  const [wholeRaw, frac = ''] = body.split('.');
  const whole = wholeRaw || '0';
  if (!/^\d+$/.test(whole)) return 0;
  const fracDigits = (frac.replace(/\D/g, '') + '00').slice(0, 2);
  const cents = Number(whole) * 100 + Number(fracDigits);
  if (!Number.isSafeInteger(cents)) return 0;
  return neg ? -cents : cents;
}

export function centsToArsString(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

export function formatPoints(points: number): string {
  return Math.trunc(points).toLocaleString('es-AR');
}

export function formatArsFromCents(cents: number): string {
  const neg = cents < 0;
  const whole = Math.floor(Math.abs(Math.trunc(cents)) / 100);
  return `${neg ? '-' : ''}$${whole.toLocaleString('es-AR')}`;
}

/** 10 puntos = $1 cuando pointsPerArs = 10. Nunca redondea hacia arriba. */
export function arsCentsToPurchasedPoints(cents: number, pointsPerArs: number): number {
  const rate = normalizePointsPerArs(pointsPerArs);
  const amount = Math.max(0, Math.trunc(cents));
  return Math.floor((amount * rate) / 100);
}

export function pointsToCents(points: number, pointsPerArs: number): number {
  const rate = normalizePointsPerArs(pointsPerArs);
  const qty = Math.max(0, Math.trunc(points));
  return Math.floor((qty * 100) / rate);
}

/**
 * earnedPoints = floor(eligibleArs * cashbackPercent / 100 * pointsPerArs)
 * cashbackPercent admite hasta 2 decimales.
 */
export function calculateCashbackPoints(
  eligibleCents: number,
  cashbackPercent: number,
  pointsPerArs: number,
): number {
  const eligible = Math.max(0, Math.trunc(eligibleCents));
  const rate = normalizePointsPerArs(pointsPerArs);
  const percentHundredths = Math.max(0, Math.round(Number(cashbackPercent) * 100));
  return Math.floor((eligible * percentHundredths * rate) / 1_000_000);
}

export function normalizePointsPerArs(value: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('La conversión de puntos tiene que ser un entero mayor a cero.');
  }
  return n;
}

export function maxRedeemablePoints(totalCents: number, balancePoints: number, pointsPerArs: number): number {
  const affordable = Math.max(0, Math.trunc(balancePoints));
  const fitsSale = arsCentsToPurchasedPoints(Math.max(0, totalCents), pointsPerArs);
  return Math.min(affordable, fitsSale);
}

/**
 * Gasta primero puntos gratuitos y después puntos comprados.
 * Así el prepago conserva valor y el cashback no se regenera sobre regalos.
 */
export function allocatePointSpend(buckets: PointBuckets, points: number): {
  freeUsed: number;
  purchasedUsed: number;
} {
  const requested = Math.trunc(points);
  if (!Number.isFinite(requested) || requested < 0) {
    throw new Error('La cantidad de puntos no es válida.');
  }
  if (requested === 0) return { freeUsed: 0, purchasedUsed: 0 };
  const freeAvailable = Math.max(0, Math.trunc(buckets.free));
  const purchasedAvailable = Math.max(0, Math.trunc(buckets.purchased));
  if (requested > freeAvailable + purchasedAvailable) {
    throw new Error('No tenés puntos suficientes.');
  }
  const freeUsed = Math.min(freeAvailable, requested);
  return { freeUsed, purchasedUsed: requested - freeUsed };
}

export function planSaleLoyalty(input: {
  totalCents: number;
  pointsRequested: number;
  buckets: PointBuckets;
  pointsPerArs: number;
  cashbackPercent: number;
  paymentMethod: string;
}): {
  freeUsed: number;
  purchasedUsed: number;
  pointsRedeemed: number;
  arsRedeemedCents: number;
  residualCents: number;
  paymentMethod: string;
  eligibleCents: number;
  earnedPoints: number;
  nextBuckets: PointBuckets;
} {
  const totalCents = Math.max(0, Math.trunc(input.totalCents));
  const requested = Math.max(0, Math.trunc(input.pointsRequested || 0));
  const balance = Math.max(0, input.buckets.free) + Math.max(0, input.buckets.purchased);
  if (requested > balance) {
    throw new Error('No tenés puntos suficientes.');
  }
  const cap = maxRedeemablePoints(totalCents, balance, input.pointsPerArs);
  const pointsRedeemed = Math.min(requested, cap);
  const { freeUsed, purchasedUsed } = allocatePointSpend(input.buckets, pointsRedeemed);
  const arsRedeemedCents = pointsToCents(pointsRedeemed, input.pointsPerArs);
  const residualCents = Math.max(0, totalCents - arsRedeemedCents);
  let paymentMethod = (input.paymentMethod || '').trim() || 'efectivo';
  if (residualCents === 0 && totalCents > 0) {
    paymentMethod = 'puntos';
  } else if (residualCents === 0 && totalCents === 0) {
    paymentMethod = paymentMethod === 'puntos' ? 'puntos' : paymentMethod;
  } else if (paymentMethod === 'puntos') {
    throw new Error('Elegí cómo pagar el resto.');
  }
  const purchasedCents = pointsToCents(purchasedUsed, input.pointsPerArs);
  const residualEligible =
    paymentMethod === 'fiado' || paymentMethod === 'cuenta_corriente' ? 0 : residualCents;
  const eligibleCents = residualEligible + purchasedCents;
  const earnedPoints = calculateCashbackPoints(eligibleCents, input.cashbackPercent, input.pointsPerArs);
  return {
    freeUsed,
    purchasedUsed,
    pointsRedeemed,
    arsRedeemedCents,
    residualCents,
    paymentMethod,
    eligibleCents,
    earnedPoints,
    nextBuckets: {
      purchased: input.buckets.purchased - purchasedUsed,
      free: input.buckets.free - freeUsed + earnedPoints,
    },
  };
}

export function resolveFiscalMode(
  mode: string | null | undefined,
  paymentMethod: string | null | undefined,
): 'internal' | 'factura_c' {
  if (mode === 'factura_c') return 'factura_c';
  if (mode === 'auto_mp' || mode === 'automatic') {
    const tender = (paymentMethod || '').trim().toLowerCase();
    if (INTERNAL_TENDERS.has(tender)) return 'internal';
    return 'factura_c';
  }
  return 'internal';
}

export function isFiscalMode(value: unknown): value is FiscalMode {
  return value === 'internal' || value === 'factura_c' || value === 'auto_mp';
}

/** Parte de la venta que entra a caja/banco. Los puntos y el fiado no son ingreso de ese momento. */
export function collectedForChannel(
  totalCents: number,
  loyaltyArsCents: number,
  paymentMethod: string | null | undefined,
): { efectivo: number; banco: number; puntos: number; fiado: number } {
  const total = Math.max(0, Math.trunc(totalCents));
  const points = Math.min(total, Math.max(0, Math.trunc(loyaltyArsCents)));
  const residual = total - points;
  const method = (paymentMethod || '').trim().toLowerCase();
  const out = { efectivo: 0, banco: 0, puntos: points, fiado: 0 };
  if (method === 'efectivo') out.efectivo = residual;
  else if (method === 'fiado' || method === 'cuenta_corriente') out.fiado = residual;
  else if (method === 'puntos' || method === '') out.puntos = points;
  else out.banco = residual;
  return out;
}

export function assertSameTenant(resourceBusinessId: string, requestBusinessId: string): void {
  if (!resourceBusinessId || resourceBusinessId !== requestBusinessId) {
    throw new Error('No encontrado.');
  }
}

export function assertPendingReview(status: string): void {
  if (status !== 'PENDING') throw new Error('La solicitud ya fue revisada.');
}

export function assertClaimable(input: {
  saleStatus: string;
  linkStatus?: string | null;
  linkedAccountId?: string | null;
}): void {
  if (input.saleStatus === 'voided') throw new Error('Esta venta está anulada.');
  if (input.saleStatus !== 'completed') throw new Error('Esta venta no se puede acreditar.');
  if (input.linkedAccountId || input.linkStatus === 'linked' || input.linkStatus === 'voided') {
    throw new Error('Esta compra ya fue acreditada.');
  }
}

export function assertRedemptionDeliverable(status: string): void {
  if (status === 'REDEEMED') throw new Error('Este canje ya fue utilizado.');
  if (status !== 'PENDING') throw new Error('Este canje ya fue utilizado.');
}

export function invertDeltas(tx: { purchasedDelta: number; freeDelta: number; pointsDelta: number }) {
  return {
    purchasedDelta: -tx.purchasedDelta,
    freeDelta: -tx.freeDelta,
    pointsDelta: -tx.pointsDelta,
  };
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54') && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  return digits || null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function maskPhone(value: string | null | undefined): string | null {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `***${digits.slice(-4)}`;
}

export function movementLabel(type: string, pointsDelta: number): string {
  switch (type) {
    case 'PURCHASED':
      return 'Compra de puntos';
    case 'EARNED':
      return 'Puntos por compra';
    case 'BONUS':
      return 'Puntos de regalo';
    case 'MANUAL_ADJUSTMENT':
      return pointsDelta >= 0 ? 'Ajuste a favor' : 'Ajuste';
    case 'REDEMPTION':
      return 'Uso de puntos';
    case 'REVERSAL':
      return 'Reversión';
    case 'REFUND':
      return 'Devolución de puntos';
    default:
      return 'Movimiento';
  }
}
