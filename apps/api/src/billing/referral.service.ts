import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BillingCycle,
  getPlan,
  planPrice,
  REFERRAL_DISCOUNT_MONTHS,
  REFERRAL_DISCOUNT_PER_MONTH,
} from './plans';
import {
  discountFromGrants,
  generateReferralCode,
  normalizeReferralCode,
  payableAmount,
  type ReferralConsumption,
} from './referral.util';

type DbClient = PrismaService | Prisma.TransactionClient;

type ReferralMetaPayload = {
  grants: Array<{ id: string; role: 'referrer' | 'referee'; months: number; amount: number }>;
};

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  shareUrl(code: string): string {
    const web = (this.config.get<string>('WEB_URL') || 'http://localhost:3000').replace(/\/$/, '');
    return `${web}/register?ref=${encodeURIComponent(code)}`;
  }

  async ensureCode(businessId: string, db: DbClient = this.prisma): Promise<string> {
    const current = await db.business.findUnique({
      where: { id: businessId },
      select: { referralCode: true },
    });
    if (current?.referralCode) return current.referralCode;

    for (let attempt = 0; attempt < 12; attempt++) {
      const code = generateReferralCode();
      const taken = await db.business.findFirst({
        where: { referralCode: code },
        select: { id: true },
      });
      if (taken) continue;
      const sellerTaken = await db.platformSeller.findFirst({
        where: { code },
        select: { id: true },
      });
      if (sellerTaken) continue;
      try {
        const updated = await db.business.update({
          where: { id: businessId },
          data: { referralCode: code },
          select: { referralCode: true },
        });
        if (updated.referralCode) return updated.referralCode;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new BadRequestException('No se pudo generar un código de referido. Reintentá.');
  }

  async applyCode(referredBusinessId: string, rawCode: string, db: DbClient = this.prisma) {
    const code = normalizeReferralCode(rawCode);
    if (!code) throw new BadRequestException('Código de referido inválido.');

    const referrer = await db.business.findFirst({
      where: { referralCode: code },
      select: { id: true, name: true, referralCode: true },
    });
    if (!referrer) throw new BadRequestException('No encontramos ese código de referido.');
    if (referrer.id === referredBusinessId) {
      throw new BadRequestException('No podés usar el código de tu propio local.');
    }

    const already = await db.referral.findUnique({
      where: { referredBusinessId },
      select: { id: true },
    });
    if (already) throw new BadRequestException('Este local ya usó un código de referido.');

    await db.referral.create({
      data: {
        code,
        referrerBusinessId: referrer.id,
        referredBusinessId,
        discountAmount: REFERRAL_DISCOUNT_PER_MONTH,
        months: REFERRAL_DISCOUNT_MONTHS,
        refereeMonthsLeft: REFERRAL_DISCOUNT_MONTHS,
        referrerMonthsLeft: REFERRAL_DISCOUNT_MONTHS,
      },
    });

    return { referrerId: referrer.id, referrerName: referrer.name, code };
  }

  async lookup(rawCode: string) {
    const code = normalizeReferralCode(rawCode);
    if (!code) return { valid: false as const };
    const seller = await this.prisma.platformSeller.findFirst({
      where: { code },
      select: { name: true, active: true },
    });
    if (seller) {
      if (!seller.active) return { valid: false as const, reason: 'inactive' as const };
      return { valid: true as const, kind: 'seller' as const, name: seller.name, referrerName: seller.name, code };
    }
    const referrer = await this.prisma.business.findFirst({
      where: { referralCode: code },
      select: { name: true },
    });
    if (!referrer) return { valid: false as const };
    return { valid: true as const, kind: 'local' as const, name: referrer.name, referrerName: referrer.name, code };
  }

  async quote(businessId: string, cycle: BillingCycle, listPrice: number, db: DbClient = this.prisma) {
    const grants = await this.loadOpenGrants(businessId, db);
    const referee = discountFromGrants(
      grants.asReferee.map((g) => ({
        id: g.id,
        monthsLeft: g.refereeMonthsLeft,
        discountPerMonth: Number(g.discountAmount),
      })),
      cycle,
    );
    const referrer = discountFromGrants(
      grants.asReferrer.map((g) => ({
        id: g.id,
        monthsLeft: g.referrerMonthsLeft,
        discountPerMonth: Number(g.discountAmount),
      })),
      cycle,
    );
    const discount = referee.discount + referrer.discount;
    const amount = payableAmount(listPrice, discount);
    const cappedDiscount = Math.min(discount, Math.max(0, listPrice));
    const meta: ReferralMetaPayload = {
      grants: [
        ...referee.consumptions.map((c) => ({ ...c, role: 'referee' as const })),
        ...referrer.consumptions.map((c) => ({ ...c, role: 'referrer' as const })),
      ],
    };
    return {
      listPrice,
      discount: cappedDiscount,
      amount,
      meta: meta.grants.length ? meta : null,
    };
  }

  async consumePaid(invoice: {
    id: string;
    businessId: string;
    status: string;
    cycle: string;
    discount: { toString(): string } | number;
    referralMeta: Prisma.JsonValue | null;
  }) {
    const meta = parseReferralMeta(invoice.referralMeta);
    if (!meta?.grants.length) return;

    for (const grant of meta.grants) {
      if (grant.months <= 0) continue;
      if (grant.role === 'referee') {
        await this.prisma.referral.updateMany({
          where: { id: grant.id, referredBusinessId: invoice.businessId },
          data: { refereeMonthsLeft: { decrement: grant.months } },
        });
      } else {
        await this.prisma.referral.updateMany({
          where: { id: grant.id, referrerBusinessId: invoice.businessId },
          data: { referrerMonthsLeft: { decrement: grant.months } },
        });
      }
    }

    await this.prisma.referral.updateMany({
      where: { refereeMonthsLeft: { lt: 0 } },
      data: { refereeMonthsLeft: 0 },
    });
    await this.prisma.referral.updateMany({
      where: { referrerMonthsLeft: { lt: 0 } },
      data: { referrerMonthsLeft: 0 },
    });
  }

  async snapshot(businessId: string) {
    const code = await this.ensureCode(businessId);
    const [received, made] = await Promise.all([
      this.prisma.referral.findUnique({
        where: { referredBusinessId: businessId },
        include: { referrer: { select: { name: true, referralCode: true } } },
      }),
      this.prisma.referral.findMany({
        where: { referrerBusinessId: businessId },
        orderBy: { createdAt: 'desc' },
        include: { referred: { select: { name: true } } },
      }),
    ]);

    const asRefereeLeft = received?.refereeMonthsLeft ?? 0;
    const asReferrerLeft = made.reduce((n, r) => n + Math.max(0, r.referrerMonthsLeft), 0);
    const monthlyAmount =
      (asRefereeLeft > 0 ? REFERRAL_DISCOUNT_PER_MONTH : 0) +
      made.filter((r) => r.referrerMonthsLeft > 0).length * REFERRAL_DISCOUNT_PER_MONTH;

    return {
      code,
      shareUrl: this.shareUrl(code),
      discountPerMonth: REFERRAL_DISCOUNT_PER_MONTH,
      discountMonths: REFERRAL_DISCOUNT_MONTHS,
      referredBy: received
        ? {
            businessName: received.referrer.name,
            code: received.code,
            monthsLeft: received.refereeMonthsLeft,
          }
        : null,
      referralsMade: made.map((r) => ({
        id: r.id,
        businessName: r.referred.name,
        createdAt: r.createdAt,
        monthsLeft: r.referrerMonthsLeft,
      })),
      activeDiscount: {
        monthlyAmount,
        monthsLeftAsReferee: asRefereeLeft,
        monthsLeftAsReferrer: asReferrerLeft,
      },
    };
  }

  /** Recalcula un pendiente por transferencia si entra un referido nuevo. No toca Mercado Pago. */
  async refreshPendingTransferInvoice(businessId: string) {
    const pending = await this.prisma.invoice.findFirst({
      where: { businessId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) return;
    if (pending.method === 'mercadopago' && pending.mpPreferenceId) return;

    const plan = getPlan(pending.planId);
    const cycle = pending.cycle === 'yearly' ? 'yearly' : 'monthly';
    const quoted = await this.quote(businessId, cycle, planPrice(plan, cycle));
    const notes = quoted.discount > 0 ? referralNotes(quoted.discount, quoted.meta?.grants ?? []) : pending.notes;

    await this.prisma.invoice.update({
      where: { id: pending.id },
      data: {
        amount: new Prisma.Decimal(quoted.amount),
        discount: new Prisma.Decimal(quoted.discount),
        referralMeta: quoted.meta ? (quoted.meta as Prisma.InputJsonValue) : Prisma.JsonNull,
        notes,
      },
    });
  }

  private async loadOpenGrants(businessId: string, db: DbClient) {
    const [asReferee, asReferrer] = await Promise.all([
      db.referral.findMany({
        where: { referredBusinessId: businessId, refereeMonthsLeft: { gt: 0 } },
      }),
      db.referral.findMany({
        where: { referrerBusinessId: businessId, referrerMonthsLeft: { gt: 0 } },
      }),
    ]);
    return { asReferee, asReferrer };
  }
}

export function referralNotes(discount: number, grants: ReferralConsumption[]): string {
  const count = grants.length;
  const label = count === 1 ? '1 referido' : `${count} referidos`;
  return `Descuento de referidos (${label}): −$${discount.toLocaleString('es-AR')}`;
}

function parseReferralMeta(raw: Prisma.JsonValue | null): ReferralMetaPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const grants = (raw as { grants?: unknown }).grants;
  if (!Array.isArray(grants)) return null;
  const parsed = grants
    .map((g) => {
      if (!g || typeof g !== 'object') return null;
      const row = g as { id?: unknown; role?: unknown; months?: unknown; amount?: unknown };
      if (typeof row.id !== 'string') return null;
      if (row.role !== 'referrer' && row.role !== 'referee') return null;
      const months = Number(row.months);
      const amount = Number(row.amount);
      if (!Number.isFinite(months) || months <= 0) return null;
      return { id: row.id, role: row.role, months, amount: Number.isFinite(amount) ? amount : 0 };
    })
    .filter((g): g is ReferralMetaPayload['grants'][number] => !!g);
  return parsed.length ? { grants: parsed } : null;
}
