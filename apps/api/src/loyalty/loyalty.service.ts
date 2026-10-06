import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoyaltyWalletService } from './loyalty-wallet.service';
import {
  arsCentsToPurchasedPoints,
  arsToCents,
  assertClaimable,
  assertPendingReview,
  assertSameTenant,
  centsToArsString,
  formatArsFromCents,
  formatPoints,
  maskPhone,
  movementLabel,
  normalizeEmail,
  normalizePhone,
  planSaleLoyalty,
  pointsToCents,
} from '../../../../shared/loyalty-money';
import { openSecret, publicWebUrl, randomCode, randomPin, randomToken, sealSecret, sha256 } from './loyalty-crypto';

type Tx = Prisma.TransactionClient;
type LockedAccount = {
  id: string;
  businessId: string;
  balancePoints: number;
  purchasedPoints: number;
  freePoints: number;
  active: boolean;
  name: string;
};

const SESSION_DAYS = 30;

@Injectable()
export class LoyaltyService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private wallet: LoyaltyWalletService,
  ) {}

  async getConfig(businessId: string) {
    const config = await this.prisma.loyaltyConfig.findUnique({ where: { businessId } });
    if (!config) return { configured: false as const, wallet: this.wallet.status() };
    return { configured: true as const, ...this.presentConfig(config), wallet: this.wallet.status() };
  }

  async saveConfig(
    businessId: string,
    businessName: string,
    patch: {
      enabled?: boolean;
      pointsPerArs?: number;
      cashbackPercent?: number;
      checkInTtlMinutes?: number;
      claimTtlHours?: number;
      transferAlias?: string | null;
      transferCbuCvu?: string | null;
      transferHolder?: string | null;
      transferBank?: string | null;
      transferInstructions?: string | null;
      programName?: string;
      publicSlug?: string;
    },
  ) {
    const data = this.configData(patch);
    const current = await this.prisma.loyaltyConfig.findUnique({ where: { businessId } });
    if (!current) {
      const business = businessName
        ? { name: businessName }
        : await this.prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
      const created = await this.prisma.loyaltyConfig.create({
        data: {
          businessId,
          enabled: patch.enabled !== false,
          publicSlug:
            (typeof data.publicSlug === 'string' && data.publicSlug) ||
            (await this.uniqueSlug(patch.publicSlug || business?.name || 'local')),
          programName: (typeof data.programName === 'string' && data.programName) || 'Fidelización',
          pointsPerArs: typeof data.pointsPerArs === 'number' ? data.pointsPerArs : undefined,
          cashbackPercent: data.cashbackPercent,
          checkInTtlMinutes: typeof data.checkInTtlMinutes === 'number' ? data.checkInTtlMinutes : undefined,
          claimTtlHours: typeof data.claimTtlHours === 'number' ? data.claimTtlHours : undefined,
          transferAlias: typeof data.transferAlias === 'string' || data.transferAlias === null ? data.transferAlias : undefined,
          transferCbuCvu: typeof data.transferCbuCvu === 'string' || data.transferCbuCvu === null ? data.transferCbuCvu : undefined,
          transferHolder: typeof data.transferHolder === 'string' || data.transferHolder === null ? data.transferHolder : undefined,
          transferBank: typeof data.transferBank === 'string' || data.transferBank === null ? data.transferBank : undefined,
          transferInstructions:
            typeof data.transferInstructions === 'string' || data.transferInstructions === null
              ? data.transferInstructions
              : undefined,
        },
      });
      return { configured: true as const, ...this.presentConfig(created), wallet: this.wallet.status() };
    }
    if (data.publicSlug && data.publicSlug !== current.publicSlug) {
      const taken = await this.prisma.loyaltyConfig.findUnique({ where: { publicSlug: data.publicSlug } });
      if (taken && taken.businessId !== businessId) throw new BadRequestException('Ese identificador público ya está en uso.');
    }
    const updated = await this.prisma.loyaltyConfig.update({ where: { businessId }, data });
    return { configured: true as const, ...this.presentConfig(updated), wallet: this.wallet.status() };
  }

  async posContext(businessId: string) {
    const config = await this.prisma.loyaltyConfig.findUnique({ where: { businessId } });
    if (!config?.enabled) return { enabled: false as const };
    return {
      enabled: true as const,
      pointsPerArs: config.pointsPerArs,
      cashbackPercent: Number(config.cashbackPercent),
      programName: config.programName,
      publicSlug: config.publicSlug,
      publicUrl: `${publicWebUrl()}/fidelidad/${config.publicSlug}`,
    };
  }

  async dashboard(businessId: string) {
    const config = await this.requireConfig(businessId);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [balances, tx, pendingTopups, pendingRedemptions, waiting, salesTotal, salesLinked, recurrence] =
      await Promise.all([
        this.prisma.loyaltyAccount.aggregate({
          where: { businessId },
          _sum: { balancePoints: true, purchasedPoints: true, freePoints: true },
          _count: true,
        }),
        this.prisma.loyaltyTransaction.groupBy({
          by: ['type'],
          where: { businessId },
          _sum: { pointsDelta: true },
        }),
        this.prisma.loyaltyTopupRequest.count({ where: { businessId, status: 'PENDING' } }),
        this.prisma.loyaltyRedemption.count({ where: { businessId, status: 'PENDING' } }),
        this.prisma.loyaltyCheckIn.count({
          where: { businessId, status: 'WAITING', expiresAt: { gt: new Date() } },
        }),
        this.prisma.sale.count({ where: { businessId, status: 'completed', createdAt: { gte: since } } }),
        this.prisma.sale.count({
          where: { businessId, status: 'completed', createdAt: { gte: since }, loyaltyAccountId: { not: null } },
        }),
        this.prisma.sale.groupBy({
          by: ['loyaltyAccountId'],
          where: { businessId, status: 'completed', loyaltyAccountId: { not: null } },
          _count: { _all: true },
        }),
      ]);
    const byType = new Map(tx.map((row) => [row.type, row._sum.pointsDelta || 0]));
    const circulating = balances._sum.balancePoints || 0;
    const identified = recurrence.length;
    const repeat = recurrence.filter((row) => row._count._all >= 2).length;
    return {
      enabled: config.enabled,
      programName: config.programName,
      pointsPerArs: config.pointsPerArs,
      accounts: balances._count,
      circulatingPoints: circulating,
      circulatingArsLabel: formatArsFromCents(pointsToCents(Math.max(0, circulating), config.pointsPerArs)),
      purchasedOutstanding: balances._sum.purchasedPoints || 0,
      freeOutstanding: balances._sum.freePoints || 0,
      pointsPurchased: byType.get('PURCHASED') || 0,
      pointsGifted: (byType.get('EARNED') || 0) + (byType.get('BONUS') || 0),
      pointsSpent: Math.abs(byType.get('REDEMPTION') || 0),
      pendingTopups,
      pendingRedemptions,
      waiting,
      linkedSales30d: salesLinked,
      sales30d: salesTotal,
      identificationRate: salesTotal ? salesLinked / salesTotal : 0,
      recurrenceRate: identified ? repeat / identified : 0,
    };
  }

  async listAccounts(businessId: string, q?: string) {
    const config = await this.requireConfig(businessId);
    const accounts = await this.prisma.loyaltyAccount.findMany({
      where: {
        businessId,
        ...(q?.trim() ? { name: { contains: q.trim(), mode: 'insensitive' } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        balancePoints: true,
        active: true,
        appleSerial: true,
        googleObjectId: true,
        createdAt: true,
        _count: { select: { sales: { where: { status: 'completed' } } } },
        sales: {
          where: { status: 'completed' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    return accounts.map((account) => ({
      id: account.id,
      name: account.name,
      phone: maskPhone(account.phone),
      email: account.email ? this.maskEmail(account.email) : null,
      balancePoints: account.balancePoints,
      arsLabel: formatArsFromCents(pointsToCents(account.balancePoints, config.pointsPerArs)),
      purchases: account._count.sales,
      lastPurchaseAt: account.sales[0]?.createdAt ?? null,
      appleWallet: Boolean(account.appleSerial),
      googleWallet: Boolean(account.googleObjectId),
      active: account.active,
    }));
  }

  async getAccount(businessId: string, accountId: string) {
    const config = await this.requireConfig(businessId);
    const account = await this.prisma.loyaltyAccount.findFirst({
      where: { id: accountId, businessId },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 40 },
        sales: {
          where: { status: { in: ['completed', 'voided'] } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            createdAt: true,
            totalFinal: true,
            status: true,
            loyaltyPointsEarned: true,
            loyaltyPointsRedeemed: true,
            loyaltyArsRedeemed: true,
          },
        },
        topups: { orderBy: { createdAt: 'desc' }, take: 20 },
        redemptions: { orderBy: { createdAt: 'desc' }, take: 20, include: { reward: { select: { name: true } } } },
        customer: { select: { id: true, name: true } },
      },
    });
    if (!account) throw new NotFoundException('Cuenta de fidelidad no encontrada.');
    return {
      id: account.id,
      name: account.name,
      phone: account.phone,
      email: account.email,
      active: account.active,
      customer: account.customer,
      balancePoints: account.balancePoints,
      purchasedPoints: account.purchasedPoints,
      freePoints: account.freePoints,
      pointsLabel: formatPoints(account.balancePoints),
      arsLabel: formatArsFromCents(pointsToCents(account.balancePoints, config.pointsPerArs)),
      appleWallet: Boolean(account.appleSerial),
      googleWallet: Boolean(account.googleObjectId),
      walletSyncError: account.walletSyncError,
      transactions: account.transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        label: movementLabel(tx.type, tx.pointsDelta),
        pointsDelta: tx.pointsDelta,
        purchasedDelta: tx.purchasedDelta,
        freeDelta: tx.freeDelta,
        arsEquivalent: tx.arsEquivalent,
        createdAt: tx.createdAt,
        metadata: tx.metadata,
      })),
      sales: account.sales,
      topups: account.topups,
      redemptions: account.redemptions.map((row) => ({
        id: row.id,
        code: row.code,
        status: row.status,
        pointsCost: row.pointsCost,
        rewardName: row.reward.name,
        createdAt: row.createdAt,
        deliveredAt: row.deliveredAt,
      })),
    };
  }

  async adjust(businessId: string, userId: string, accountId: string, pointsDelta: number, reason: string) {
    const cleanReason = reason?.trim();
    if (!cleanReason) throw new BadRequestException('El ajuste necesita un motivo.');
    const delta = Math.trunc(Number(pointsDelta));
    if (!Number.isFinite(delta) || delta === 0) throw new BadRequestException('Indicá cuántos puntos sumar o restar.');
    const config = await this.requireConfig(businessId);
    const movement = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockAccount(tx, businessId, accountId);
      let purchasedDelta = 0;
      let freeDelta = 0;
      if (delta > 0) freeDelta = delta;
      else {
        const spend = Math.abs(delta);
        const available = Math.max(0, locked.freePoints) + Math.max(0, locked.purchasedPoints);
        if (spend > available) throw new BadRequestException('No hay puntos suficientes para ese descuento.');
        const freeUsed = Math.min(Math.max(0, locked.freePoints), spend);
        freeDelta = -freeUsed;
        purchasedDelta = -(spend - freeUsed);
      }
      return this.writeMovement(tx, {
        businessId,
        accountId,
        type: 'MANUAL_ADJUSTMENT',
        pointsDelta: delta,
        purchasedDelta,
        freeDelta,
        arsCents: pointsToCents(Math.abs(delta), config.pointsPerArs),
        idempotencyKey: `adjust:${randomToken(12)}`,
        createdByUserId: userId,
        metadata: { reason: cleanReason },
        allowNegative: false,
      });
    });
    await this.audit(userId, 'loyalty.adjust', accountId, { pointsDelta: delta, reason: cleanReason });
    await this.syncWallet(accountId);
    return movement;
  }

  async resetPin(businessId: string, userId: string, accountId: string) {
    const account = await this.prisma.loyaltyAccount.findFirst({ where: { id: accountId, businessId } });
    if (!account) throw new NotFoundException('Cuenta de fidelidad no encontrada.');
    const pin = randomPin();
    await this.prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: { pinHash: await argon2.hash(pin, { type: 2 }), pinFailedCount: 0, pinLockedUntil: null },
    });
    await this.prisma.loyaltySession.updateMany({
      where: { loyaltyAccountId: account.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit(userId, 'loyalty.pin_reset', account.id, { assisted: true });
    return { pin, message: 'PIN nuevo. Mostralo una sola vez: no queda guardado en texto.' };
  }

  async listCheckins(businessId: string) {
    await this.expireCheckins(businessId);
    const rows = await this.prisma.loyaltyCheckIn.findMany({
      where: { businessId, status: 'WAITING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      include: { account: { select: { id: true, name: true, phone: true, balancePoints: true } } },
    });
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.account.name, (counts.get(row.account.name) || 0) + 1);
    const config = await this.prisma.loyaltyConfig.findUnique({ where: { businessId } });
    const rate = config?.pointsPerArs || 10;
    return rows.map((row) => ({
      id: row.id,
      accountId: row.account.id,
      name: row.account.name,
      hint: (counts.get(row.account.name) || 0) > 1 ? maskPhone(row.account.phone) : null,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      balancePoints: row.account.balancePoints,
      arsLabel: formatArsFromCents(pointsToCents(row.account.balancePoints, rate)),
    }));
  }

  async cancelCheckin(businessId: string, checkInId: string) {
    const updated = await this.prisma.loyaltyCheckIn.updateMany({
      where: { id: checkInId, businessId, status: 'WAITING' },
      data: { status: 'CANCELLED', openKey: null },
    });
    if (!updated.count) throw new NotFoundException('Esa fila ya no está activa.');
    return { ok: true };
  }

  async lookupCard(businessId: string, token: string) {
    const config = await this.requireEnabled(businessId);
    const account = await this.prisma.loyaltyAccount.findFirst({
      where: { businessId, publicToken: token.trim(), active: true },
    });
    if (!account) throw new NotFoundException('No encontramos esa tarjeta de fidelidad.');
    return this.publicBalance(account, config.pointsPerArs);
  }

  async preview(businessId: string, accountId: string, total: number, pointsRequested: number) {
    const config = await this.requireEnabled(businessId);
    const account = await this.prisma.loyaltyAccount.findFirst({ where: { id: accountId, businessId, active: true } });
    if (!account) throw new NotFoundException('Cuenta de fidelidad no encontrada.');
    try {
      const plan = planSaleLoyalty({
        totalCents: arsToCents(total),
        pointsRequested: Math.max(0, Math.trunc(pointsRequested || 0)),
        buckets: { purchased: account.purchasedPoints, free: account.freePoints },
        pointsPerArs: config.pointsPerArs,
        cashbackPercent: Number(config.cashbackPercent),
        paymentMethod: 'efectivo',
      });
      return {
        pointsRedeemed: plan.pointsRedeemed,
        arsRedeemedLabel: formatArsFromCents(plan.arsRedeemedCents),
        earnedPoints: plan.earnedPoints,
        balancePoints: account.balancePoints,
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  async peekAccountId(businessId: string, accountId?: string | null, checkInId?: string | null) {
    if (checkInId) {
      const checkin = await this.prisma.loyaltyCheckIn.findFirst({
        where: { id: checkInId, businessId, status: 'WAITING' },
        select: { loyaltyAccountId: true },
      });
      return checkin?.loyaltyAccountId ?? null;
    }
    return accountId || null;
  }

  async applyToNewSale(
    tx: Tx,
    input: {
      businessId: string;
      userId: string;
      saleId: string;
      totalCents: number;
      paymentMethod: string;
      loyaltyAccountId?: string | null;
      loyaltyCheckInId?: string | null;
      pointsRequested?: number | null;
    },
  ): Promise<{ accountIdForWallet: string | null }> {
    const wants =
      Boolean(input.loyaltyAccountId || input.loyaltyCheckInId) || (input.pointsRequested || 0) > 0;
    if (!wants) return { accountIdForWallet: null };
    const config = await tx.loyaltyConfig.findUnique({ where: { businessId: input.businessId } });
    if (!config?.enabled) throw new BadRequestException('Fidelización no está activa.');

    let accountId = input.loyaltyAccountId || null;
    if (input.loyaltyCheckInId) {
      const checkin = await tx.loyaltyCheckIn.findFirst({
        where: { id: input.loyaltyCheckInId, businessId: input.businessId },
      });
      if (!checkin || checkin.status !== 'WAITING' || checkin.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Tu sesión en la fila venció. Escaneá nuevamente el QR.');
      }
      if (accountId && accountId !== checkin.loyaltyAccountId) {
        throw new BadRequestException('La cuenta no coincide con la fila.');
      }
      accountId = checkin.loyaltyAccountId;
    }
    if (!accountId) throw new BadRequestException('Elegí un cliente de fidelidad para usar puntos.');
    assertSameTenant(input.businessId, input.businessId);

    const locked = await this.lockAccount(tx, input.businessId, accountId);
    let plan;
    try {
      plan = planSaleLoyalty({
        totalCents: input.totalCents,
        pointsRequested: input.pointsRequested || 0,
        buckets: { purchased: locked.purchasedPoints, free: locked.freePoints },
        pointsPerArs: config.pointsPerArs,
        cashbackPercent: Number(config.cashbackPercent),
        paymentMethod: input.paymentMethod,
      });
    } catch (error) {
      this.rethrow(error);
    }

    if (plan.pointsRedeemed > 0) {
      await this.writeMovement(tx, {
        businessId: input.businessId,
        accountId,
        type: 'REDEMPTION',
        pointsDelta: -plan.pointsRedeemed,
        purchasedDelta: -plan.purchasedUsed,
        freeDelta: -plan.freeUsed,
        arsCents: plan.arsRedeemedCents,
        idempotencyKey: `sale:${input.saleId}:redeem`,
        sourceSaleId: input.saleId,
        metadata: { saleId: input.saleId },
        allowNegative: false,
      });
    }
    if (plan.earnedPoints > 0) {
      await this.writeMovement(tx, {
        businessId: input.businessId,
        accountId,
        type: 'EARNED',
        pointsDelta: plan.earnedPoints,
        purchasedDelta: 0,
        freeDelta: plan.earnedPoints,
        arsCents: pointsToCents(plan.earnedPoints, config.pointsPerArs),
        idempotencyKey: `sale:${input.saleId}:earn`,
        sourceSaleId: input.saleId,
        metadata: { saleId: input.saleId, eligibleCents: plan.eligibleCents },
        allowNegative: false,
      });
    }
    await tx.sale.update({
      where: { id: input.saleId },
      data: {
        paymentMethod: plan.paymentMethod,
        loyaltyAccountId: accountId,
        loyaltyPointsRedeemed: plan.pointsRedeemed,
        loyaltyArsRedeemed: new Decimal(centsToArsString(plan.arsRedeemedCents)),
        loyaltyPointsEarned: plan.earnedPoints,
      },
    });
    await tx.loyaltySaleLink.upsert({
      where: { saleId: input.saleId },
      create: {
        businessId: input.businessId,
        saleId: input.saleId,
        loyaltyAccountId: accountId,
        pointsEarned: plan.earnedPoints,
        pointsRedeemed: plan.pointsRedeemed,
        freePointsRedeemed: plan.freeUsed,
        purchasedPointsRedeemed: plan.purchasedUsed,
        arsRedeemed: new Decimal(centsToArsString(plan.arsRedeemedCents)),
        status: 'linked',
        claimedAt: new Date(),
      },
      update: {
        loyaltyAccountId: accountId,
        pointsEarned: plan.earnedPoints,
        pointsRedeemed: plan.pointsRedeemed,
        freePointsRedeemed: plan.freeUsed,
        purchasedPointsRedeemed: plan.purchasedUsed,
        arsRedeemed: new Decimal(centsToArsString(plan.arsRedeemedCents)),
        status: 'linked',
        claimedAt: new Date(),
      },
    });
    if (input.loyaltyCheckInId) {
      await tx.loyaltyCheckIn.update({
        where: { id: input.loyaltyCheckInId },
        data: {
          status: 'COMPLETED',
          openKey: null,
          attachedSaleId: input.saleId,
          attachedByUserId: input.userId,
        },
      });
    }
    await this.awardMilestones(tx, input.businessId, accountId, input.saleId, config.pointsPerArs);
    return { accountIdForWallet: accountId };
  }

  async reverseSale(businessId: string, saleId: string) {
    const accountIds = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      const movements = await tx.loyaltyTransaction.findMany({
        where: { businessId, sourceSaleId: saleId, reversalOfId: null },
      });
      for (const movement of movements) {
        if (movement.type === 'REVERSAL' || movement.type === 'REFUND') continue;
        const already = await tx.loyaltyTransaction.findFirst({ where: { reversalOfId: movement.id } });
        if (already) continue;
        accountIds.add(movement.loyaltyAccountId);
        await this.writeMovement(tx, {
          businessId,
          accountId: movement.loyaltyAccountId,
          type: movement.type === 'REDEMPTION' ? 'REFUND' : 'REVERSAL',
          pointsDelta: -movement.pointsDelta,
          purchasedDelta: -movement.purchasedDelta,
          freeDelta: -movement.freeDelta,
          arsCents: arsToCents(movement.arsEquivalent),
          idempotencyKey: `reversal:${movement.id}`,
          sourceSaleId: saleId,
          reversalOfId: movement.id,
          metadata: { saleId, reverses: movement.id },
          allowNegative: true,
        });
      }
      await tx.loyaltySaleLink.updateMany({
        where: { businessId, saleId },
        data: { status: 'voided' },
      });
    });
    await Promise.all([...accountIds].map((id) => this.syncWallet(id)));
  }

  async issueClaimToken(businessId: string, saleId: string) {
    const config = await this.requireEnabled(businessId);
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, businessId } });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    const link = await this.prisma.loyaltySaleLink.findUnique({ where: { saleId } });
    try {
      assertClaimable({
        saleStatus: sale.status,
        linkStatus: link?.status,
        linkedAccountId: sale.loyaltyAccountId || link?.loyaltyAccountId,
      });
    } catch (error) {
      this.rethrow(error);
    }
    if ((sale.loyaltyPointsEarned || 0) > 0) throw new BadRequestException('Esta compra ya fue acreditada.');
    const points = this.earnPreview(
      arsToCents(sale.totalFinal),
      config.pointsPerArs,
      Number(config.cashbackPercent),
      sale.paymentMethod || 'efectivo',
    );
    if (link?.claimTokenEnc && link.claimExpiresAt && link.claimExpiresAt.getTime() > Date.now() && link.status === 'open') {
      const token = openSecret(link.claimTokenEnc);
      return this.claimPayload(token, link.claimExpiresAt, sale, points);
    }
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + config.claimTtlHours * 60 * 60 * 1000);
    const data = {
      claimTokenHash: sha256(token),
      claimTokenEnc: sealSecret(token),
      claimExpiresAt: expiresAt,
      status: 'open',
    };
    if (!link) {
      await this.prisma.loyaltySaleLink.create({ data: { businessId, saleId, ...data } });
    } else {
      await this.prisma.loyaltySaleLink.update({ where: { id: link.id }, data });
    }
    return this.claimPayload(token, expiresAt, sale, points);
  }

  async register(
    slug: string,
    input: { name: string; phone?: string; email?: string; pin: string },
  ) {
    const config = await this.configBySlug(slug);
    const name = input.name?.trim();
    if (!name || name.length < 2) throw new BadRequestException('Ingresá tu nombre.');
    if (!/^\d{4,6}$/.test(input.pin || '')) throw new BadRequestException('El PIN tiene que tener entre 4 y 6 números.');
    const phone = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);
    if (!phone && !email) throw new BadRequestException('Necesitamos un teléfono o un email.');
    const customerId = phone ? await this.matchCustomer(config.businessId, phone) : null;
    try {
      const account = await this.prisma.loyaltyAccount.create({
        data: {
          businessId: config.businessId,
          customerId,
          name: name.slice(0, 80),
          phone: input.phone?.trim() || null,
          normalizedPhone: phone,
          email: email,
          normalizedEmail: email,
          pinHash: await argon2.hash(input.pin, { type: 2 }),
          publicToken: randomToken(18),
        },
      });
      return this.openSession(account.id, config.pointsPerArs);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Ya existe una cuenta con esos datos. Ingresá con tu PIN.');
      }
      throw error;
    }
  }

  async login(slug: string, input: { phone?: string; email?: string; pin: string }) {
    const config = await this.configBySlug(slug);
    const phone = normalizePhone(input.phone);
    const email = normalizeEmail(input.email);
    if (!phone && !email) throw new BadRequestException('Ingresá tu teléfono o email.');
    const account = await this.prisma.loyaltyAccount.findFirst({
      where: {
        businessId: config.businessId,
        ...(phone ? { normalizedPhone: phone } : { normalizedEmail: email }),
      },
    });
    if (!account || !account.active) throw new UnauthorizedException('No encontramos esa cuenta.');
    if (account.pinLockedUntil && account.pinLockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('Demasiados intentos. Probá de nuevo más tarde.');
    }
    const ok = await argon2.verify(account.pinHash, input.pin || '').catch(() => false);
    if (!ok) {
      const fails = account.pinFailedCount + 1;
      await this.prisma.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          pinFailedCount: fails,
          pinLockedUntil: fails >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      });
      throw new UnauthorizedException('El PIN no coincide.');
    }
    await this.prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: { pinFailedCount: 0, pinLockedUntil: null, lastLoginAt: new Date() },
    });
    return this.openSession(account.id, config.pointsPerArs);
  }

  async logout(token: string) {
    if (!token) return { ok: true };
    await this.prisma.loyaltySession.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async sessionAccount(token: string) {
    if (!token) throw new UnauthorizedException('Iniciá sesión para ver tus puntos.');
    const session = await this.prisma.loyaltySession.findFirst({
      where: { tokenHash: sha256(token), revokedAt: null, expiresAt: { gt: new Date() } },
      include: { account: true },
    });
    if (!session?.account.active) throw new UnauthorizedException('Tu sesión venció. Ingresá de nuevo.');
    return session.account;
  }

  async portalHome(token: string) {
    const account = await this.sessionAccount(token);
    const config = await this.requireEnabled(account.businessId);
    const [transactions, sales, rewards, redemptions, checkin, business] = await Promise.all([
      this.prisma.loyaltyTransaction.findMany({
        where: { loyaltyAccountId: account.id, businessId: account.businessId },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      this.prisma.sale.findMany({
        where: { loyaltyAccountId: account.id, businessId: account.businessId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          createdAt: true,
          totalFinal: true,
          status: true,
          loyaltyPointsEarned: true,
          loyaltyPointsRedeemed: true,
        },
      }),
      this.prisma.loyaltyReward.findMany({
        where: { businessId: account.businessId, active: true },
        orderBy: { pointsCost: 'asc' },
      }),
      this.prisma.loyaltyRedemption.findMany({
        where: { loyaltyAccountId: account.id, businessId: account.businessId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { reward: { select: { name: true } } },
      }),
      this.prisma.loyaltyCheckIn.findFirst({
        where: { loyaltyAccountId: account.id, businessId: account.businessId, status: 'WAITING' },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.business.findUnique({ where: { id: account.businessId }, select: { name: true } }),
    ]);
    const wallet = this.wallet.status();
    return {
      businessName: business?.name || 'Tu comercio',
      programName: config.programName,
      account: this.publicBalance(account, config.pointsPerArs),
      checkin: checkin
        ? { id: checkin.id, status: checkin.status, expiresAt: checkin.expiresAt }
        : null,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        label: movementLabel(tx.type, tx.pointsDelta),
        pointsDelta: tx.pointsDelta,
        createdAt: tx.createdAt,
      })),
      sales: sales.map((sale) => ({
        id: sale.id,
        createdAt: sale.createdAt,
        totalLabel: formatArsFromCents(arsToCents(sale.totalFinal)),
        status: sale.status,
        earned: sale.loyaltyPointsEarned,
        redeemed: sale.loyaltyPointsRedeemed,
      })),
      rewards: rewards.map((reward) => ({
        id: reward.id,
        name: reward.name,
        description: reward.description,
        imageUrl: reward.imageUrl,
        pointsCost: reward.pointsCost,
        available: reward.stock == null || reward.stock > 0,
      })),
      redemptions: redemptions.map((row) => ({
        id: row.id,
        code: row.code,
        status: row.status,
        pointsCost: row.pointsCost,
        rewardName: row.reward.name,
        createdAt: row.createdAt,
      })),
      wallet,
      transfer: {
        alias: config.transferAlias,
        cbuCvu: config.transferCbuCvu,
        holder: config.transferHolder,
        bank: config.transferBank,
        instructions: config.transferInstructions,
      },
    };
  }

  async publicProgram(slug: string) {
    const config = await this.configBySlug(slug);
    const business = await this.prisma.business.findUnique({
      where: { id: config.businessId },
      select: { name: true },
    });
    return {
      programName: config.programName,
      businessName: business?.name || 'Comercio',
      pointsPerArs: config.pointsPerArs,
      cashbackPercent: Number(config.cashbackPercent),
      wallet: this.wallet.status(),
    };
  }

  async checkIn(token: string) {
    const account = await this.sessionAccount(token);
    const config = await this.requireEnabled(account.businessId);
    const expiresAt = new Date(Date.now() + config.checkInTtlMinutes * 60 * 1000);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.loyaltyCheckIn.updateMany({
          where: { businessId: account.businessId, loyaltyAccountId: account.id, status: 'WAITING' },
          data: { status: 'CANCELLED', openKey: null },
        });
        return tx.loyaltyCheckIn.create({
          data: {
            businessId: account.businessId,
            loyaltyAccountId: account.id,
            status: 'WAITING',
            expiresAt,
            openKey: account.id,
          },
        });
      });
      return { id: row.id, status: row.status, expiresAt: row.expiresAt, name: account.name };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Ya estás en la fila de este local.');
      }
      throw error;
    }
  }

  async currentCheckin(token: string) {
    const account = await this.sessionAccount(token);
    await this.expireCheckins(account.businessId);
    const row = await this.prisma.loyaltyCheckIn.findFirst({
      where: { loyaltyAccountId: account.id, businessId: account.businessId },
      orderBy: { createdAt: 'desc' },
      include: { attachedSale: { select: { loyaltyPointsEarned: true, status: true } } },
    });
    if (!row) return { status: 'NONE' as const };
    const config = await this.requireConfig(account.businessId);
    const fresh = await this.prisma.loyaltyAccount.findFirst({ where: { id: account.id, businessId: account.businessId } });
    return {
      status: row.status,
      expiresAt: row.expiresAt,
      earnedPoints: row.attachedSale?.loyaltyPointsEarned ?? 0,
      balance: fresh ? this.publicBalance(fresh, config.pointsPerArs) : null,
    };
  }

  async claimPreview(token: string, claimToken: string) {
    const link = await this.linkByToken(claimToken);
    const sale = await this.prisma.sale.findFirst({ where: { id: link.saleId, businessId: link.businessId } });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    try {
      assertClaimable({
        saleStatus: sale.status,
        linkStatus: link.status,
        linkedAccountId: link.loyaltyAccountId || sale.loyaltyAccountId,
      });
    } catch (error) {
      this.rethrow(error);
    }
    if (link.claimExpiresAt && link.claimExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Este código de puntos venció.');
    }
    const config = await this.requireEnabled(link.businessId);
    const business = await this.prisma.business.findUnique({
      where: { id: link.businessId },
      select: { name: true },
    });
    let authenticated = false;
    if (token) {
      try {
        const account = await this.sessionAccount(token);
        authenticated = account.businessId === link.businessId;
      } catch {
        authenticated = false;
      }
    }
    const points = this.earnPreview(
      arsToCents(sale.totalFinal),
      config.pointsPerArs,
      Number(config.cashbackPercent),
      sale.paymentMethod || 'efectivo',
    );
    return {
      totalLabel: formatArsFromCents(arsToCents(sale.totalFinal)),
      createdAt: sale.createdAt,
      points,
      publicSlug: config.publicSlug,
      businessName: business?.name || config.programName,
      authenticated,
    };
  }

  async claim(token: string, claimToken: string) {
    const account = await this.sessionAccount(token);
    const hash = sha256(claimToken);
    const result = await this.prisma.$transaction(async (tx) => {
      const link = await tx.loyaltySaleLink.findFirst({ where: { claimTokenHash: hash } });
      if (!link) throw new NotFoundException('El código de puntos no es válido.');
      assertSameTenant(link.businessId, account.businessId);
      const sale = await tx.sale.findFirst({ where: { id: link.saleId, businessId: link.businessId } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      try {
        assertClaimable({
          saleStatus: sale.status,
          linkStatus: link.status,
          linkedAccountId: link.loyaltyAccountId || sale.loyaltyAccountId,
        });
      } catch (error) {
        this.rethrow(error);
      }
      if (link.claimExpiresAt && link.claimExpiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Este código de puntos venció.');
      }
      const updated = await tx.loyaltySaleLink.updateMany({
        where: { id: link.id, businessId: account.businessId, status: 'open', loyaltyAccountId: null },
        data: { status: 'linked', loyaltyAccountId: account.id, claimedAt: new Date() },
      });
      if (updated.count !== 1) throw new BadRequestException('Esta compra ya fue acreditada.');
      const config = await tx.loyaltyConfig.findUnique({ where: { businessId: account.businessId } });
      if (!config?.enabled) throw new BadRequestException('Fidelización no está activa.');
      const locked = await this.lockAccount(tx, account.businessId, account.id);
      const plan = planSaleLoyalty({
        totalCents: arsToCents(sale.totalFinal),
        pointsRequested: 0,
        buckets: { purchased: locked.purchasedPoints, free: locked.freePoints },
        pointsPerArs: config.pointsPerArs,
        cashbackPercent: Number(config.cashbackPercent),
        paymentMethod: sale.paymentMethod || 'efectivo',
      });
      if (plan.earnedPoints > 0) {
        await this.writeMovement(tx, {
          businessId: account.businessId,
          accountId: account.id,
          type: 'EARNED',
          pointsDelta: plan.earnedPoints,
          purchasedDelta: 0,
          freeDelta: plan.earnedPoints,
          arsCents: pointsToCents(plan.earnedPoints, config.pointsPerArs),
          idempotencyKey: `sale:${sale.id}:earn`,
          sourceSaleId: sale.id,
          metadata: { saleId: sale.id, claim: true },
          allowNegative: false,
        });
      }
      await tx.sale.update({
        where: { id: sale.id },
        data: { loyaltyAccountId: account.id, loyaltyPointsEarned: plan.earnedPoints },
      });
      await tx.loyaltySaleLink.update({
        where: { id: link.id },
        data: { pointsEarned: plan.earnedPoints },
      });
      await this.awardMilestones(tx, account.businessId, account.id, sale.id, config.pointsPerArs);
      const fresh = await tx.loyaltyAccount.findFirst({ where: { id: account.id, businessId: account.businessId } });
      return {
        earnedPoints: plan.earnedPoints,
        balance: this.publicBalance(fresh!, config.pointsPerArs),
      };
    });
    await this.syncWallet(account.id);
    return result;
  }

  async createTopup(
    token: string,
    input: { amountArs?: number; points?: number; payerName: string; note?: string; reference?: string },
  ) {
    const account = await this.sessionAccount(token);
    const config = await this.requireEnabled(account.businessId);
    const payerName = input.payerName?.trim();
    if (!payerName) throw new BadRequestException('Decinos quién hizo la transferencia.');
    let cents = 0;
    let points = 0;
    if (input.amountArs != null && Number(input.amountArs) > 0) {
      cents = arsToCents(input.amountArs);
      points = arsCentsToPurchasedPoints(cents, config.pointsPerArs);
    } else if (input.points != null && Number(input.points) > 0) {
      points = Math.floor(Number(input.points));
      cents = pointsToCents(points, config.pointsPerArs);
      points = arsCentsToPurchasedPoints(cents, config.pointsPerArs);
    }
    if (points < 1 || cents < 1) throw new BadRequestException('Ingresá un monto válido.');
    const row = await this.prisma.loyaltyTopupRequest.create({
      data: {
        businessId: account.businessId,
        loyaltyAccountId: account.id,
        amountArs: new Decimal(centsToArsString(cents)),
        points,
        pointsPerArsSnapshot: config.pointsPerArs,
        payerName: payerName.slice(0, 120),
        note: input.note?.trim() || null,
        reference: input.reference?.trim() || null,
      },
    });
    return {
      id: row.id,
      points: row.points,
      amountLabel: formatArsFromCents(cents),
      status: row.status,
    };
  }

  async listTopups(businessId: string) {
    const rows = await this.prisma.loyaltyTopupRequest.findMany({
      where: { businessId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 80,
      include: { account: { select: { name: true } } },
    });
    const rank: Record<string, number> = { PENDING: 0, APPROVED: 1, REJECTED: 2, CANCELLED: 3 };
    return rows
      .slice()
      .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({
        id: row.id,
        accountName: row.account.name,
        points: row.points,
        amountArs: row.amountArs,
        payerName: row.payerName,
        note: row.note,
        reference: row.reference,
        status: row.status,
        rejectReason: row.rejectReason,
        createdAt: row.createdAt,
      }));
  }

  async approveTopup(businessId: string, userId: string, topupId: string) {
    const accountId = await this.prisma.$transaction(async (tx) => {
      const current = await tx.loyaltyTopupRequest.findFirst({ where: { id: topupId, businessId } });
      if (!current) throw new NotFoundException('Solicitud no encontrada.');
      try {
        assertPendingReview(current.status);
      } catch (error) {
        this.rethrow(error);
      }
      const updated = await tx.loyaltyTopupRequest.updateMany({
        where: { id: topupId, businessId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedById: userId, reviewedAt: new Date() },
      });
      if (updated.count !== 1) throw new BadRequestException('La solicitud ya fue revisada.');
      const movement = await this.writeMovement(tx, {
        businessId,
        accountId: current.loyaltyAccountId,
        type: 'PURCHASED',
        pointsDelta: current.points,
        purchasedDelta: current.points,
        freeDelta: 0,
        arsCents: arsToCents(current.amountArs),
        idempotencyKey: `topup:${current.id}`,
        sourceTopupId: current.id,
        createdByUserId: userId,
        metadata: { payerName: current.payerName },
        allowNegative: false,
      });
      await tx.loyaltyTopupRequest.update({
        where: { id: current.id },
        data: { transactionId: movement.id },
      });
      return current.loyaltyAccountId;
    });
    await this.audit(userId, 'loyalty.topup.approve', topupId, {});
    await this.syncWallet(accountId);
    return { ok: true };
  }

  async rejectTopup(businessId: string, userId: string, topupId: string, reason?: string) {
    const updated = await this.prisma.loyaltyTopupRequest.updateMany({
      where: { id: topupId, businessId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        reviewedById: userId,
        reviewedAt: new Date(),
        rejectReason: reason?.trim() || null,
      },
    });
    if (!updated.count) throw new BadRequestException('La solicitud ya fue revisada.');
    await this.audit(userId, 'loyalty.topup.reject', topupId, { reason: reason?.trim() || null });
    return { ok: true };
  }

  async listRewards(businessId: string) {
    return this.prisma.loyaltyReward.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } });
  }

  async saveReward(
    businessId: string,
    input: {
      id?: string;
      name: string;
      description?: string | null;
      imageUrl?: string | null;
      pointsCost: number;
      active?: boolean;
      stock?: number | null;
      linkedProductId?: string | null;
    },
  ) {
    const name = input.name?.trim();
    const pointsCost = Math.trunc(Number(input.pointsCost));
    if (!name) throw new BadRequestException('El premio necesita un nombre.');
    if (!Number.isFinite(pointsCost) || pointsCost < 1) throw new BadRequestException('El costo en puntos no es válido.');
    if (input.linkedProductId) {
      const product = await this.prisma.product.findFirst({
        where: { id: input.linkedProductId, businessId },
        select: { id: true },
      });
      if (!product) throw new BadRequestException('El producto vinculado no existe en este negocio.');
    }
    const data = {
      name: name.slice(0, 80),
      description: input.description?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      pointsCost,
      active: input.active !== false,
      stock: input.stock == null || input.stock === ('' as unknown) ? null : Math.max(0, Math.trunc(Number(input.stock))),
      linkedProductId: input.linkedProductId || null,
    };
    if (Number.isNaN(data.stock as number)) data.stock = null;
    if (input.id) {
      const existing = await this.prisma.loyaltyReward.findFirst({ where: { id: input.id, businessId } });
      if (!existing) throw new NotFoundException('Premio no encontrado.');
      return this.prisma.loyaltyReward.update({ where: { id: existing.id }, data });
    }
    return this.prisma.loyaltyReward.create({ data: { ...data, businessId } });
  }

  async redeemReward(token: string, rewardId: string) {
    const account = await this.sessionAccount(token);
    const result = await this.prisma.$transaction(async (tx) => {
      const reward = await tx.loyaltyReward.findFirst({ where: { id: rewardId, businessId: account.businessId, active: true } });
      if (!reward) throw new NotFoundException('Ese premio no está disponible.');
      if (reward.stock != null) {
        const reserved = await tx.loyaltyReward.updateMany({
          where: { id: reward.id, businessId: account.businessId, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        });
        if (!reserved.count) throw new BadRequestException('No hay stock de este premio.');
      }
      const locked = await this.lockAccount(tx, account.businessId, account.id);
      if (locked.balancePoints < reward.pointsCost) throw new BadRequestException('No tenés puntos suficientes.');
      const freeUsed = Math.min(Math.max(0, locked.freePoints), reward.pointsCost);
      const purchasedUsed = reward.pointsCost - freeUsed;
      let code = randomCode();
      for (let i = 0; i < 5; i += 1) {
        const exists = await tx.loyaltyRedemption.findFirst({ where: { businessId: account.businessId, code } });
        if (!exists) break;
        code = randomCode();
      }
      const redemption = await tx.loyaltyRedemption.create({
        data: {
          businessId: account.businessId,
          loyaltyAccountId: account.id,
          rewardId: reward.id,
          pointsCost: reward.pointsCost,
          code,
          status: 'PENDING',
        },
      });
      const config = await tx.loyaltyConfig.findUnique({ where: { businessId: account.businessId } });
      const movement = await this.writeMovement(tx, {
        businessId: account.businessId,
        accountId: account.id,
        type: 'REDEMPTION',
        pointsDelta: -reward.pointsCost,
        purchasedDelta: -purchasedUsed,
        freeDelta: -freeUsed,
        arsCents: pointsToCents(reward.pointsCost, config?.pointsPerArs || 10),
        idempotencyKey: `reward:${redemption.id}`,
        sourceRedemptionId: redemption.id,
        metadata: { rewardId: reward.id, code },
        allowNegative: false,
      });
      await tx.loyaltyRedemption.update({ where: { id: redemption.id }, data: { transactionId: movement.id } });
      const fresh = await tx.loyaltyAccount.findFirst({ where: { id: account.id } });
      return { code, pointsCost: reward.pointsCost, balancePoints: fresh?.balancePoints || 0, name: reward.name };
    });
    await this.syncWallet(account.id);
    return result;
  }

  async listRedemptions(businessId: string) {
    const rows = await this.prisma.loyaltyRedemption.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 80,
      include: { account: { select: { name: true } }, reward: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      pointsCost: row.pointsCost,
      accountName: row.account.name,
      rewardName: row.reward.name,
      createdAt: row.createdAt,
      deliveredAt: row.deliveredAt,
    }));
  }

  async deliverRedemption(businessId: string, userId: string, redemptionId: string) {
    const redemption = await this.prisma.loyaltyRedemption.findFirst({
      where: { id: redemptionId, businessId },
      include: { reward: true },
    });
    if (!redemption) throw new NotFoundException('Canje no encontrado.');
    if (redemption.status === 'REDEEMED') throw new BadRequestException('Este canje ya fue utilizado.');
    if (redemption.status !== 'PENDING') throw new BadRequestException('Este canje ya fue utilizado.');
    const updated = await this.prisma.loyaltyRedemption.updateMany({
      where: { id: redemption.id, businessId, status: 'PENDING' },
      data: { status: 'REDEEMED', deliveredById: userId, deliveredAt: new Date() },
    });
    if (!updated.count) throw new BadRequestException('Este canje ya fue utilizado.');
    if (redemption.reward.linkedProductId) {
      const product = await this.prisma.product.findFirst({
        where: { id: redemption.reward.linkedProductId, businessId, stock: { gt: 0 } },
      });
      if (product) {
        await this.prisma.product.update({ where: { id: product.id }, data: { stock: { decrement: 1 } } });
        await this.prisma.stockMove.create({
          data: { productId: product.id, qty: -1, reason: 'canje_fidelidad', reference: redemption.id },
        });
      }
    }
    await this.audit(userId, 'loyalty.redemption.deliver', redemption.id, { code: redemption.code });
    return { ok: true };
  }

  async cancelRedemption(businessId: string, userId: string, redemptionId: string) {
    const accountId = await this.prisma.$transaction(async (tx) => {
      const redemption = await tx.loyaltyRedemption.findFirst({ where: { id: redemptionId, businessId } });
      if (!redemption) throw new NotFoundException('Canje no encontrado.');
      if (redemption.status !== 'PENDING') throw new BadRequestException('Este canje ya fue utilizado.');
      const updated = await tx.loyaltyRedemption.updateMany({
        where: { id: redemption.id, businessId, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (!updated.count) throw new BadRequestException('Este canje ya fue utilizado.');
      const movement = redemption.transactionId
        ? await tx.loyaltyTransaction.findFirst({ where: { id: redemption.transactionId, businessId } })
        : null;
      if (movement) {
        await this.writeMovement(tx, {
          businessId,
          accountId: redemption.loyaltyAccountId,
          type: 'REFUND',
          pointsDelta: -movement.pointsDelta,
          purchasedDelta: -movement.purchasedDelta,
          freeDelta: -movement.freeDelta,
          arsCents: arsToCents(movement.arsEquivalent),
          idempotencyKey: `reward-cancel:${redemption.id}`,
          sourceRedemptionId: redemption.id,
          reversalOfId: movement.id,
          createdByUserId: userId,
          metadata: { redemptionId: redemption.id },
          allowNegative: true,
        });
      }
      await tx.loyaltyReward.updateMany({
        where: { id: redemption.rewardId, businessId, stock: { not: null } },
        data: { stock: { increment: 1 } },
      });
      return redemption.loyaltyAccountId;
    });
    await this.audit(userId, 'loyalty.redemption.cancel', redemptionId, {});
    await this.syncWallet(accountId);
    return { ok: true };
  }

  async listRules(businessId: string) {
    return this.prisma.loyaltyMilestoneRule.findMany({ where: { businessId }, orderBy: { everyNPurchases: 'asc' } });
  }

  async saveRule(
    businessId: string,
    input: { id?: string; name: string; everyNPurchases: number; bonusPoints: number; active?: boolean },
  ) {
    const name = input.name?.trim();
    const every = Math.trunc(Number(input.everyNPurchases));
    const bonus = Math.trunc(Number(input.bonusPoints));
    if (!name) throw new BadRequestException('La regla necesita un nombre.');
    if (!Number.isFinite(every) || every < 1) throw new BadRequestException('Indicá cada cuántas compras.');
    if (!Number.isFinite(bonus) || bonus < 1) throw new BadRequestException('Indicá cuántos puntos de regalo.');
    const data = { name: name.slice(0, 80), everyNPurchases: every, bonusPoints: bonus, active: Boolean(input.active) };
    if (input.id) {
      const existing = await this.prisma.loyaltyMilestoneRule.findFirst({ where: { id: input.id, businessId } });
      if (!existing) throw new NotFoundException('Regla no encontrada.');
      return this.prisma.loyaltyMilestoneRule.update({ where: { id: existing.id }, data });
    }
    return this.prisma.loyaltyMilestoneRule.create({ data: { ...data, businessId } });
  }

  async qr(businessId: string) {
    const config = await this.requireConfig(businessId);
    const business = await this.prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
    const url = `${publicWebUrl()}/fidelidad/${config.publicSlug}`;
    return { url, programName: config.programName, businessName: business?.name || '', enabled: config.enabled };
  }

  async requestPinEmail(slug: string, emailRaw: string) {
    const config = await this.configBySlug(slug);
    const email = normalizeEmail(emailRaw);
    if (!email) throw new BadRequestException('Ingresá un email válido.');
    const account = await this.prisma.loyaltyAccount.findFirst({
      where: { businessId: config.businessId, normalizedEmail: email },
    });
    if (!account) return { sent: false, message: 'Si el email está registrado, te enviamos instrucciones.' };
    const token = randomToken(24);
    await this.prisma.loyaltyPinReset.create({
      data: {
        businessId: config.businessId,
        loyaltyAccountId: account.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const link = `${publicWebUrl()}/fidelidad/recuperar?token=${token}`;
    const sent = await this.mail.sendLoyaltyPinReset(email, link);
    if (!sent) {
      return {
        sent: false,
        message: 'El correo no está configurado. Pedile al local que te restablezca el PIN.',
      };
    }
    return { sent: true, message: 'Si el email está registrado, te enviamos instrucciones.' };
  }

  async confirmPinEmail(token: string, pin: string) {
    if (!/^\d{4,6}$/.test(pin || '')) throw new BadRequestException('El PIN tiene que tener entre 4 y 6 números.');
    const row = await this.prisma.loyaltyPinReset.findFirst({ where: { tokenHash: sha256(token) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('El enlace de recuperación no es válido o ya venció.');
    }
    await this.prisma.$transaction([
      this.prisma.loyaltyAccount.update({
        where: { id: row.loyaltyAccountId },
        data: { pinHash: await argon2.hash(pin, { type: 2 }), pinFailedCount: 0, pinLockedUntil: null },
      }),
      this.prisma.loyaltyPinReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.loyaltySession.updateMany({
        where: { loyaltyAccountId: row.loyaltyAccountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  async syncWallet(accountId: string) {
    try {
      await this.wallet.syncBalance(accountId);
    } catch (error) {
      await this.prisma.loyaltyAccount.update({
        where: { id: accountId },
        data: { walletSyncError: error instanceof Error ? error.message.slice(0, 500) : 'Error de wallet' },
      }).catch(() => undefined);
    }
  }

  private async awardMilestones(tx: Tx, businessId: string, accountId: string, saleId: string, pointsPerArs: number) {
    const count = await tx.sale.count({
      where: { businessId, loyaltyAccountId: accountId, status: 'completed' },
    });
    const rules = await tx.loyaltyMilestoneRule.findMany({ where: { businessId, active: true } });
    for (const rule of rules) {
      if (count < 1 || count % rule.everyNPurchases !== 0) continue;
      try {
        await tx.loyaltyMilestoneAward.create({
          data: {
            businessId,
            ruleId: rule.id,
            loyaltyAccountId: accountId,
            saleId,
            purchaseCount: count,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') continue;
        throw error;
      }
      const movement = await this.writeMovement(tx, {
        businessId,
        accountId,
        type: 'BONUS',
        pointsDelta: rule.bonusPoints,
        purchasedDelta: 0,
        freeDelta: rule.bonusPoints,
        arsCents: pointsToCents(rule.bonusPoints, pointsPerArs),
        idempotencyKey: `milestone:${rule.id}:${saleId}`,
        sourceSaleId: saleId,
        metadata: { saleId, ruleId: rule.id, purchaseCount: count },
        allowNegative: false,
      });
      await tx.loyaltyMilestoneAward.updateMany({
        where: { ruleId: rule.id, saleId },
        data: { transactionId: movement.id },
      });
    }
  }

  private async writeMovement(
    tx: Tx,
    input: {
      businessId: string;
      accountId: string;
      type: string;
      pointsDelta: number;
      purchasedDelta: number;
      freeDelta: number;
      arsCents: number;
      idempotencyKey: string;
      sourceSaleId?: string | null;
      sourceTopupId?: string | null;
      sourceRedemptionId?: string | null;
      reversalOfId?: string | null;
      createdByUserId?: string | null;
      metadata?: Record<string, unknown>;
      allowNegative: boolean;
    },
  ) {
    const locked = await this.lockAccount(tx, input.businessId, input.accountId);
    const purchasedPoints = locked.purchasedPoints + input.purchasedDelta;
    const freePoints = locked.freePoints + input.freeDelta;
    const balancePoints = purchasedPoints + freePoints;
    if (!input.allowNegative && (balancePoints < 0 || purchasedPoints < 0 || freePoints < 0)) {
      throw new BadRequestException('No tenés puntos suficientes.');
    }
    await tx.loyaltyAccount.update({
      where: { id: locked.id },
      data: { purchasedPoints, freePoints, balancePoints },
    });
    return tx.loyaltyTransaction.create({
      data: {
        businessId: input.businessId,
        loyaltyAccountId: input.accountId,
        type: input.type,
        pointsDelta: input.pointsDelta,
        purchasedDelta: input.purchasedDelta,
        freeDelta: input.freeDelta,
        arsEquivalent: new Decimal(centsToArsString(input.arsCents)),
        sourceSaleId: input.sourceSaleId || null,
        sourceTopupId: input.sourceTopupId || null,
        sourceRedemptionId: input.sourceRedemptionId || null,
        reversalOfId: input.reversalOfId || null,
        idempotencyKey: input.idempotencyKey,
        createdByUserId: input.createdByUserId || null,
        metadata: (input.metadata || undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private async lockAccount(tx: Tx, businessId: string, accountId: string): Promise<LockedAccount> {
    const rows = await tx.$queryRaw<LockedAccount[]>`
      SELECT id, "businessId", "balancePoints", "purchasedPoints", "freePoints", active, name
      FROM "LoyaltyAccount"
      WHERE id = ${accountId} AND "businessId" = ${businessId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new NotFoundException('Cuenta de fidelidad no encontrada.');
    assertSameTenant(row.businessId, businessId);
    if (!row.active) throw new BadRequestException('La cuenta está inactiva.');
    return {
      ...row,
      balancePoints: Number(row.balancePoints),
      purchasedPoints: Number(row.purchasedPoints),
      freePoints: Number(row.freePoints),
    };
  }

  private async requireConfig(businessId: string) {
    const config = await this.prisma.loyaltyConfig.findUnique({ where: { businessId } });
    if (!config) throw new NotFoundException('Todavía no activaste Fidelización.');
    return config;
  }

  private async requireEnabled(businessId: string) {
    const config = await this.requireConfig(businessId);
    if (!config.enabled) throw new BadRequestException('Fidelización no está activa.');
    return config;
  }

  private async configBySlug(slug: string) {
    const config = await this.prisma.loyaltyConfig.findUnique({ where: { publicSlug: slug } });
    if (!config?.enabled) throw new NotFoundException('Este local no tiene fidelización activa.');
    return config;
  }

  private presentConfig(config: {
    enabled: boolean;
    pointsPerArs: number;
    cashbackPercent: Decimal;
    checkInTtlMinutes: number;
    claimTtlHours: number;
    transferAlias: string | null;
    transferCbuCvu: string | null;
    transferHolder: string | null;
    transferBank: string | null;
    transferInstructions: string | null;
    programName: string;
    publicSlug: string;
  }) {
    return {
      enabled: config.enabled,
      pointsPerArs: config.pointsPerArs,
      cashbackPercent: Number(config.cashbackPercent),
      checkInTtlMinutes: config.checkInTtlMinutes,
      claimTtlHours: config.claimTtlHours,
      transferAlias: config.transferAlias,
      transferCbuCvu: config.transferCbuCvu,
      transferHolder: config.transferHolder,
      transferBank: config.transferBank,
      transferInstructions: config.transferInstructions,
      programName: config.programName,
      publicSlug: config.publicSlug,
      publicUrl: `${publicWebUrl()}/fidelidad/${config.publicSlug}`,
    };
  }

  private configData(patch: {
    enabled?: boolean;
    pointsPerArs?: number;
    cashbackPercent?: number;
    checkInTtlMinutes?: number;
    claimTtlHours?: number;
    transferAlias?: string | null;
    transferCbuCvu?: string | null;
    transferHolder?: string | null;
    transferBank?: string | null;
    transferInstructions?: string | null;
    programName?: string;
    publicSlug?: string;
  }) {
    const data: {
      enabled?: boolean;
      pointsPerArs?: number;
      cashbackPercent?: Decimal;
      checkInTtlMinutes?: number;
      claimTtlHours?: number;
      transferAlias?: string | null;
      transferCbuCvu?: string | null;
      transferHolder?: string | null;
      transferBank?: string | null;
      transferInstructions?: string | null;
      programName?: string;
      publicSlug?: string;
    } = {};
    if (patch.enabled !== undefined) data.enabled = Boolean(patch.enabled);
    if (patch.pointsPerArs !== undefined) {
      const rate = Math.trunc(Number(patch.pointsPerArs));
      if (!Number.isFinite(rate) || rate < 1 || rate > 100000) {
        throw new BadRequestException('La conversión de puntos tiene que ser un entero mayor a cero.');
      }
      data.pointsPerArs = rate;
    }
    if (patch.cashbackPercent !== undefined) {
      const percent = Number(patch.cashbackPercent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new BadRequestException('El porcentaje de cashback tiene que estar entre 0 y 100.');
      }
      data.cashbackPercent = new Decimal(percent.toFixed(2));
    }
    if (patch.checkInTtlMinutes !== undefined) {
      const minutes = Math.trunc(Number(patch.checkInTtlMinutes));
      if (minutes < 1 || minutes > 60) throw new BadRequestException('La fila puede durar entre 1 y 60 minutos.');
      data.checkInTtlMinutes = minutes;
    }
    if (patch.claimTtlHours !== undefined) {
      const hours = Math.trunc(Number(patch.claimTtlHours));
      if (hours < 1 || hours > 24 * 90) throw new BadRequestException('El plazo para reclamar no es válido.');
      data.claimTtlHours = hours;
    }
    if (patch.programName !== undefined) data.programName = patch.programName.trim().slice(0, 60) || 'Fidelización';
    if (patch.publicSlug !== undefined) {
      const slug = patch.publicSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (slug.length < 3) throw new BadRequestException('El identificador público es demasiado corto.');
      data.publicSlug = slug;
    }
    const text = (value: string | null | undefined) => (value == null ? null : value.trim().slice(0, 160) || null);
    if (patch.transferAlias !== undefined) data.transferAlias = text(patch.transferAlias);
    if (patch.transferCbuCvu !== undefined) data.transferCbuCvu = text(patch.transferCbuCvu);
    if (patch.transferHolder !== undefined) data.transferHolder = text(patch.transferHolder);
    if (patch.transferBank !== undefined) data.transferBank = text(patch.transferBank);
    if (patch.transferInstructions !== undefined) {
      data.transferInstructions = patch.transferInstructions?.trim().slice(0, 500) || null;
    }
    return data;
  }

  private async uniqueSlug(seed: string) {
    const base =
      seed
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'local';
    for (let i = 0; i < 6; i += 1) {
      const slug = `${base}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'a1'}`;
      const exists = await this.prisma.loyaltyConfig.findUnique({ where: { publicSlug: slug } });
      if (!exists) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  private publicBalance(
    account: { id: string; name: string; balancePoints: number },
    pointsPerArs: number,
  ) {
    const cents = pointsToCents(account.balancePoints, pointsPerArs);
    return {
      id: account.id,
      name: account.name,
      balancePoints: account.balancePoints,
      pointsLabel: formatPoints(account.balancePoints),
      arsLabel: formatArsFromCents(cents),
    };
  }

  private async openSession(accountId: string, pointsPerArs: number) {
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Cuenta de fidelidad no encontrada.');
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.loyaltySession.create({
      data: {
        businessId: account.businessId,
        loyaltyAccountId: account.id,
        tokenHash: sha256(token),
        expiresAt,
      },
    });
    return { token, expiresAt, account: this.publicBalance(account, pointsPerArs) };
  }

  private async matchCustomer(businessId: string, phone: string) {
    const tail = phone.slice(-4);
    const rows = await this.prisma.customer.findMany({
      where: { businessId, phone: { contains: tail } },
      select: { id: true, phone: true },
      take: 20,
    });
    const matches = rows.filter((row) => normalizePhone(row.phone) === phone);
    return matches.length === 1 ? matches[0].id : null;
  }

  private async linkByToken(claimToken: string) {
    const link = await this.prisma.loyaltySaleLink.findFirst({ where: { claimTokenHash: sha256(claimToken) } });
    if (!link) throw new NotFoundException('El código de puntos no es válido.');
    return link;
  }

  private claimPayload(
    token: string,
    expiresAt: Date,
    sale: { totalFinal: Decimal; createdAt: Date },
    points: number,
  ) {
    return {
      url: `${publicWebUrl()}/fidelidad/reclamar/${token}`,
      expiresAt,
      points,
      totalLabel: formatArsFromCents(arsToCents(sale.totalFinal)),
      createdAt: sale.createdAt,
    };
  }

  private earnPreview(totalCents: number, pointsPerArs: number, cashbackPercent: number, paymentMethod = 'efectivo') {
    const plan = planSaleLoyalty({
      totalCents,
      pointsRequested: 0,
      buckets: { purchased: 0, free: 0 },
      pointsPerArs,
      cashbackPercent,
      paymentMethod,
    });
    return plan.earnedPoints;
  }

  private maskEmail(email: string) {
    const [user, host] = email.split('@');
    if (!host) return '***';
    return `${user.slice(0, 1)}***@${host}`;
  }

  private async expireCheckins(businessId: string) {
    await this.prisma.loyaltyCheckIn.updateMany({
      where: { businessId, status: 'WAITING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED', openKey: null },
    });
  }

  private async audit(userId: string, action: string, entityId: string, payload: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: { userId, action, entity: 'Loyalty', entityId, payload: payload as Prisma.InputJsonValue },
    });
  }

  private rethrow(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
    const message = error instanceof Error ? error.message : 'No se pudo completar la operación.';
    throw new BadRequestException(message);
  }
}
