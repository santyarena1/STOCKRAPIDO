import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { ReferralService } from '../billing/referral.service';
import { getPlan } from '../billing/plans';
import { SupportService } from '../support/support.service';

@Injectable()
export class PlatformService {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
    private referrals: ReferralService,
    private support: SupportService,
  ) {}

  async overview() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [
      businesses,
      trials,
      pendingPayment,
      active,
      complimentary,
      openTickets,
      pendingInvoices,
      salesToday,
    ] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.business.count({ where: { planStatus: 'trial' } }),
      this.prisma.business.count({ where: { planStatus: 'pending_payment' } }),
      this.prisma.business.count({ where: { planStatus: 'active' } }),
      this.prisma.business.count({ where: { planStatus: 'complimentary' } }),
      this.support.openCount(),
      this.prisma.invoice.count({ where: { status: 'pending' } }),
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: startOfDay }, status: 'completed' },
        _sum: { totalFinal: true },
        _count: true,
      }),
    ]);
    return {
      businesses,
      trials,
      pendingPayment,
      active,
      complimentary,
      openTickets,
      pendingInvoices,
      salesToday: {
        count: salesToday._count,
        amount: Number(salesToday._sum.totalFinal || 0),
      },
    };
  }

  async listBusinesses(q?: string, status?: string) {
    const where: Prisma.BusinessWhereInput = {};
    if (status) where.planStatus = status;
    if (q?.trim()) {
      const term = q.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { cuit: { contains: term, mode: 'insensitive' } },
        { users: { some: { email: { contains: term, mode: 'insensitive' } } } },
      ];
    }
    const rows = await this.prisma.business.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        users: {
          where: { role: 'OWNER' },
          select: { id: true, name: true, email: true, isActive: true },
          take: 1,
        },
        invoices: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { users: true, products: true, sales: true, supportTickets: true } },
      },
    });
    const ids = rows.map((b) => b.id);
    const lastSales = ids.length
      ? await this.prisma.sale.groupBy({
          by: ['businessId'],
          where: { businessId: { in: ids } },
          _max: { createdAt: true },
        })
      : [];
    const lastSaleMap = new Map(lastSales.map((s) => [s.businessId, s._max.createdAt]));
    const openTickets = ids.length
      ? await this.prisma.supportTicket.groupBy({
          by: ['businessId'],
          where: { businessId: { in: ids }, status: { in: ['open', 'in_progress', 'waiting'] } },
          _count: true,
        })
      : [];
    const ticketMap = new Map(openTickets.map((t) => [t.businessId, t._count]));

    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      cuit: b.cuit,
      createdAt: b.createdAt,
      planId: b.planId,
      planName: getPlan(b.planId).name,
      planStatus: b.planStatus,
      billingCycle: b.billingCycle,
      trialEndsAt: b.trialEndsAt,
      planRenewsAt: b.planRenewsAt,
      owner: b.users[0] || null,
      usersCount: b._count.users,
      productsCount: b._count.products,
      salesCount: b._count.sales,
      openTickets: ticketMap.get(b.id) || 0,
      lastSaleAt: lastSaleMap.get(b.id) || null,
      referralCode: b.referralCode,
      pendingInvoice:
        b.planStatus === 'complimentary' || !b.invoices[0]
          ? null
          : {
              id: b.invoices[0].id,
              amount: Number(b.invoices[0].amount),
              status: b.invoices[0].status,
              method: b.invoices[0].method,
            },
    }));
  }

  async getBusiness(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            isPlatformAdmin: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        invoices: { orderBy: { createdAt: 'desc' }, take: 24 },
        supportTickets: {
          orderBy: { updatedAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, name: true, email: true } }, _count: { select: { messages: true } } },
        },
        referralReceived: { include: { referrer: { select: { id: true, name: true, referralCode: true } } } },
        referralsMade: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { referred: { select: { id: true, name: true } } },
        },
      },
    });
    if (!business) throw new NotFoundException('Cuenta no encontrada');
    const referralCode = await this.referrals.ensureCode(id);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const [products, salesToday, salesMonth, lastSales, openCajas] = await Promise.all([
      this.prisma.product.count({ where: { businessId: id } }),
      this.prisma.sale.aggregate({
        where: { businessId: id, createdAt: { gte: startOfDay }, status: 'completed' },
        _sum: { totalFinal: true },
        _count: true,
      }),
      this.prisma.sale.aggregate({
        where: { businessId: id, createdAt: { gte: startOfMonth }, status: 'completed' },
        _sum: { totalFinal: true },
        _count: true,
      }),
      this.prisma.sale.findMany({
        where: { businessId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          totalFinal: true,
          paymentMethod: true,
          status: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.cashRegister.findMany({
        where: { businessId: id, closedAt: null },
        select: { id: true, openedAt: true, openingCash: true, userId: true },
      }),
    ]);

    const lastPaid = business.invoices.find((inv) => inv.status === 'paid') || null;
    const pending =
      business.planStatus === 'complimentary'
        ? null
        : business.invoices.find((inv) => inv.status === 'pending') || null;

    return {
      id: business.id,
      name: business.name,
      cuit: business.cuit,
      address: business.address,
      createdAt: business.createdAt,
      planId: business.planId,
      planName: getPlan(business.planId).name,
      planStatus: business.planStatus,
      billingCycle: business.billingCycle,
      trialEndsAt: business.trialEndsAt,
      planRenewsAt: business.planRenewsAt,
      paymentStatus: this.paymentStatus(business.planStatus, !!business.trialEndsAt && business.trialEndsAt > new Date(), !!pending),
      lastPaidAt: lastPaid?.paidAt || null,
      pendingInvoice: pending ? this.serializeInvoice(pending) : null,
      invoices: business.invoices.map((inv) => this.serializeInvoice(inv)),
      users: business.users,
      tickets: business.supportTickets,
      referral: {
        code: referralCode,
        referredBy: business.referralReceived
          ? {
              id: business.referralReceived.referrer.id,
              name: business.referralReceived.referrer.name,
              code: business.referralReceived.code,
              monthsLeft: business.referralReceived.refereeMonthsLeft,
            }
          : null,
        referralsMade: business.referralsMade.map((r) => ({
          id: r.id,
          businessId: r.referred.id,
          name: r.referred.name,
          createdAt: r.createdAt,
          monthsLeft: r.referrerMonthsLeft,
        })),
      },
      stats: {
        products,
        salesTodayCount: salesToday._count,
        salesTodayAmount: Number(salesToday._sum.totalFinal || 0),
        salesMonthCount: salesMonth._count,
        salesMonthAmount: Number(salesMonth._sum.totalFinal || 0),
        openCajas: openCajas.length,
      },
      recentSales: lastSales.map((s) => ({
        ...s,
        totalFinal: Number(s.totalFinal),
      })),
      openCajas: openCajas.map((c) => ({
        id: c.id,
        openedAt: c.openedAt,
        openingCash: Number(c.openingCash),
        userId: c.userId,
      })),
    };
  }

  async updateBusiness(
    id: string,
    dto: { planId?: string; planStatus?: string; billingCycle?: string; trialEndsAt?: string | null },
  ) {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException('Cuenta no encontrada');
    const trialEndsAt =
      dto.trialEndsAt === undefined ? undefined : dto.trialEndsAt ? new Date(dto.trialEndsAt) : null;
    if (dto.planStatus === 'complimentary') {
      await this.prisma.invoice.updateMany({
        where: { businessId: id, status: 'pending' },
        data: { status: 'void', notes: 'Anulada: cuenta pasada a cortesía' },
      });
    }
    await this.prisma.business.update({
      where: { id },
      data: {
        ...(dto.planId ? { planId: dto.planId } : {}),
        ...(dto.planStatus ? { planStatus: dto.planStatus } : {}),
        ...(dto.billingCycle ? { billingCycle: dto.billingCycle } : {}),
        ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
        ...(dto.planStatus === 'complimentary' ? { trialEndsAt: null, planRenewsAt: null } : {}),
      },
    });
    return this.getBusiness(id);
  }

  markInvoicePaid(invoiceId: string, notes?: string) {
    return this.billing.markInvoicePaid(invoiceId, undefined, 'transfer').then(async (inv) => {
      if (notes) {
        await this.prisma.invoice.update({ where: { id: invoiceId }, data: { notes } });
      }
      return inv;
    });
  }

  async voidInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Comprobante no encontrado');
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'void', notes: invoice.notes || 'Anulado desde el panel admin' },
    });
  }

  async setUserPlatformAdmin(userId: string, isPlatformAdmin: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isPlatformAdmin },
      select: { id: true, email: true, name: true, isPlatformAdmin: true },
    });
  }

  private paymentStatus(planStatus: string, trialActive: boolean, hasPending: boolean) {
    if (planStatus === 'complimentary') return { key: 'complimentary', label: 'Cortesía · no se cobra' };
    if (hasPending || planStatus === 'pending_payment') return { key: 'pending', label: 'Pago pendiente' };
    if (trialActive || planStatus === 'trial') return { key: 'trial', label: 'Prueba' };
    if (planStatus === 'active') return { key: 'paid', label: 'Al día' };
    if (planStatus === 'past_due') return { key: 'overdue', label: 'Pago vencido' };
    if (planStatus === 'canceled') return { key: 'canceled', label: 'Cancelado' };
    return { key: planStatus, label: planStatus };
  }

  private serializeInvoice(inv: {
    id: string;
    planId: string;
    cycle: string;
    amount: Prisma.Decimal | { toString(): string } | number;
    currency: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    paidAt: Date | null;
    method: string | null;
    notes: string | null;
    createdAt: Date;
  }) {
    return {
      id: inv.id,
      planId: inv.planId,
      planName: getPlan(inv.planId).name,
      cycle: inv.cycle,
      amount: Number(inv.amount),
      discount: Number((inv as { discount?: unknown }).discount ?? 0),
      currency: inv.currency,
      status: inv.status,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      paidAt: inv.paidAt,
      method: inv.method,
      notes: inv.notes,
      createdAt: inv.createdAt,
    };
  }
}
