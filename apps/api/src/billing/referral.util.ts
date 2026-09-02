import {
  BillingCycle,
  REFERRAL_DISCOUNT_MONTHS,
  REFERRAL_DISCOUNT_PER_MONTH,
} from './plans';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export type ReferralGrant = {
  id: string;
  monthsLeft: number;
  discountPerMonth?: number;
};

export type ReferralConsumption = {
  id: string;
  months: number;
  amount: number;
};

export function generateReferralCode(length = CODE_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
    out += CODE_ALPHABET[idx];
  }
  return out;
}

export function normalizeReferralCode(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4 || code.length > 16) return null;
  return code;
}

export function monthsToConsume(cycle: BillingCycle, monthsLeft: number): number {
  if (monthsLeft <= 0) return 0;
  if (cycle === 'yearly') return Math.min(REFERRAL_DISCOUNT_MONTHS, monthsLeft);
  return Math.min(1, monthsLeft);
}

export function discountFromGrants(
  grants: ReferralGrant[],
  cycle: BillingCycle,
): { discount: number; consumptions: ReferralConsumption[] } {
  const consumptions: ReferralConsumption[] = [];
  let discount = 0;
  for (const grant of grants) {
    const months = monthsToConsume(cycle, grant.monthsLeft);
    if (months <= 0) continue;
    const perMonth = grant.discountPerMonth ?? REFERRAL_DISCOUNT_PER_MONTH;
    const amount = months * perMonth;
    discount += amount;
    consumptions.push({ id: grant.id, months, amount });
  }
  return { discount, consumptions };
}

export function payableAmount(listPrice: number, discount: number): number {
  if (!Number.isFinite(listPrice) || listPrice < 0) return 0;
  if (!Number.isFinite(discount) || discount <= 0) return Math.round(listPrice);
  return Math.max(0, Math.round(listPrice) - Math.round(discount));
}
