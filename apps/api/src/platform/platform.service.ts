import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { getPlan } from '../billing/plans';
import { SupportService } from '../support/support.service';

@Injectable()
export class PlatformService {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
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
      },
    });
    if (!business) throw new NotFoundException('Cuenta no encontrada');

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

  /**
   * Auditoría exhaustiva del historial de ventas de un negocio:
   * sumas ítems↔cabecera, descuentos, precios vs catálogo, huérfanos, vacías, etc.
   */
  async salesAudit(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) throw new NotFoundException('Cuenta no encontrada');

    const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const differs = (a: number, b: number) => Math.abs(money(a) - money(b)) > 0.02;

    const sales = await this.prisma.sale.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            qty: true,
            unitPrice: true,
            subtotal: true,
            discount: true,
            product: { select: { id: true, name: true, price: true, isActive: true } },
          },
        },
        user: { select: { name: true, email: true } },
      },
    });

    const byStatus: Record<string, { count: number; sumTotalFinal: number }> = {};
    const byPayment: Record<string, { count: number; sumTotalFinal: number }> = {};

    const itemSubtotalMismatch: Array<Record<string, unknown>> = [];
    const saleTotalMismatch: Array<Record<string, unknown>> = [];
    const saleFinalMismatch: Array<Record<string, unknown>> = [];
    const priceVsCatalog: Array<Record<string, unknown>> = [];
    const orphanProduct: Array<Record<string, unknown>> = [];
    const emptySales: Array<Record<string, unknown>> = [];
    const negativeOrOdd: Array<Record<string, unknown>> = [];

    let completedCount = 0;
    let sumTotal = 0;
    let sumDiscount = 0;
    let sumTotalFinal = 0;
    let sumItemsSubtotal = 0;
    let unitsSold = 0;
    let manualLines = 0;
    let catalogLines = 0;

    for (const sale of sales) {
      const status = sale.status || 'unknown';
      const pay = sale.paymentMethod || '(sin medio)';
      const total = Number(sale.total);
      const discount = Number(sale.discount);
      const totalFinal = Number(sale.totalFinal);

      if (!byStatus[status]) byStatus[status] = { count: 0, sumTotalFinal: 0 };
      byStatus[status].count += 1;
      byStatus[status].sumTotalFinal = money(byStatus[status].sumTotalFinal + totalFinal);

      if (status === 'completed') {
        completedCount += 1;
        sumTotal = money(sumTotal + total);
        sumDiscount = money(sumDiscount + discount);
        sumTotalFinal = money(sumTotalFinal + totalFinal);
        if (!byPayment[pay]) byPayment[pay] = { count: 0, sumTotalFinal: 0 };
        byPayment[pay].count += 1;
        byPayment[pay].sumTotalFinal = money(byPayment[pay].sumTotalFinal + totalFinal);
      }

      if (!sale.items.length) {
        emptySales.push({ saleId: sale.id, createdAt: sale.createdAt, status, totalFinal });
      }

      if (total < 0 || discount < 0 || totalFinal < 0 || discount > total + 0.02) {
        negativeOrOdd.push({
          saleId: sale.id,
          createdAt: sale.createdAt,
          status,
          total,
          discount,
          totalFinal,
        });
      }

      let itemsSum = 0;
      for (const item of sale.items) {
        const qty = item.qty;
        const unitPrice = Number(item.unitPrice);
        const subtotal = Number(item.subtotal);
        const itemDiscount = Number(item.discount || 0);
        const expectedPlain = money(qty * unitPrice);
        const expectedWithItemDisc = money(qty * unitPrice - itemDiscount);
        itemsSum = money(itemsSum + subtotal);
        unitsSold += qty;
        if (item.productId) catalogLines += 1;
        else manualLines += 1;

        if (differs(expectedPlain, subtotal) && differs(expectedWithItemDisc, subtotal)) {
          itemSubtotalMismatch.push({
            saleId: sale.id,
            itemId: item.id,
            productId: item.productId,
            name: item.product?.name || item.productName,
            qty,
            unitPrice,
            itemDiscount,
            subtotal,
            expectedQtyTimesPrice: expectedPlain,
            createdAt: sale.createdAt,
          });
        }

        if (item.productId && !item.product) {
          orphanProduct.push({
            saleId: sale.id,
            itemId: item.id,
            productId: item.productId,
            productName: item.productName,
            unitPrice,
            qty,
            createdAt: sale.createdAt,
          });
        }

        if (item.product && status === 'completed') {
          const catalogPrice = Number(item.product.price);
          const diff = money(unitPrice - catalogPrice);
          if (Math.abs(diff) >= 1 && (catalogPrice === 0 || Math.abs(diff) / Math.max(catalogPrice, 1) >= 0.05)) {
            priceVsCatalog.push({
              saleId: sale.id,
              itemId: item.id,
              productId: item.productId,
              name: item.product.name,
              soldUnitPrice: unitPrice,
              catalogPriceNow: catalogPrice,
              diff,
              qty,
              createdAt: sale.createdAt,
            });
          }
        }
      }

      if (status === 'completed') sumItemsSubtotal = money(sumItemsSubtotal + itemsSum);

      if (differs(itemsSum, total)) {
        saleTotalMismatch.push({
          saleId: sale.id,
          createdAt: sale.createdAt,
          status,
          itemsSum,
          saleTotal: total,
          diff: money(itemsSum - total),
          itemCount: sale.items.length,
        });
      }

      const expectedFinal = money(total - discount);
      if (differs(expectedFinal, totalFinal)) {
        saleFinalMismatch.push({
          saleId: sale.id,
          createdAt: sale.createdAt,
          status,
          total,
          discount,
          totalFinal,
          expectedFinal,
          diff: money(totalFinal - expectedFinal),
        });
      }
    }

    const completed = sales.filter((s) => s.status === 'completed');
    const possibleDuplicates: Array<Record<string, unknown>> = [];
    for (let i = 0; i < completed.length; i++) {
      for (let j = i + 1; j < completed.length; j++) {
        const a = completed[i];
        const b = completed[j];
        const dt = Math.abs(a.createdAt.getTime() - b.createdAt.getTime());
        if (dt > 30_000) {
          if (b.createdAt.getTime() - a.createdAt.getTime() > 30_000) break;
          continue;
        }
        if (
          Number(a.totalFinal) === Number(b.totalFinal) &&
          a.userId === b.userId &&
          (a.paymentMethod || '') === (b.paymentMethod || '')
        ) {
          possibleDuplicates.push({
            a: a.id,
            b: b.id,
            totalFinal: Number(a.totalFinal),
            paymentMethod: a.paymentMethod,
            secondsApart: money(dt / 1000),
            createdAtA: a.createdAt,
            createdAtB: b.createdAt,
          });
        }
      }
    }

    priceVsCatalog.sort((a, b) => Math.abs(Number(b.diff)) - Math.abs(Number(a.diff)));
    const first = sales[0]?.createdAt ?? null;
    const last = sales[sales.length - 1]?.createdAt ?? null;

    return {
      business: { id: business.id, name: business.name },
      generatedAt: new Date().toISOString(),
      summary: {
        salesTotal: sales.length,
        completedCount,
        voidedOrOther: sales.length - completedCount,
        dateRange: { from: first, to: last },
        sumTotal,
        sumDiscount,
        sumTotalFinal,
        sumItemsSubtotal,
        itemsVsHeaderOk: Math.abs(sumItemsSubtotal - sumTotal) <= 0.02,
        unitsSold,
        catalogLines,
        manualLines,
        averageTicket: completedCount ? money(sumTotalFinal / completedCount) : 0,
      },
      byStatus,
      byPayment,
      issues: {
        itemSubtotalMismatch: { count: itemSubtotalMismatch.length, samples: itemSubtotalMismatch.slice(0, 50) },
        saleTotalMismatch: { count: saleTotalMismatch.length, samples: saleTotalMismatch.slice(0, 50) },
        saleFinalMismatch: { count: saleFinalMismatch.length, samples: saleFinalMismatch.slice(0, 50) },
        emptySales: { count: emptySales.length, samples: emptySales.slice(0, 50) },
        negativeOrOdd: { count: negativeOrOdd.length, samples: negativeOrOdd.slice(0, 50) },
        orphanProduct: { count: orphanProduct.length, samples: orphanProduct.slice(0, 50) },
        possibleDuplicates: { count: possibleDuplicates.length, samples: possibleDuplicates.slice(0, 50) },
        priceVsCatalogNow: {
          count: priceVsCatalog.length,
          note: 'Compara precio cobrado vs precio actual del producto (el catálogo pudo cambiar después de la venta).',
          topDiffs: priceVsCatalog.slice(0, 40),
        },
      },
      verdict: {
        mathOk:
          itemSubtotalMismatch.length === 0 &&
          saleTotalMismatch.length === 0 &&
          saleFinalMismatch.length === 0 &&
          negativeOrOdd.length === 0,
        dataQualityNotes: [
          emptySales.length ? `${emptySales.length} ventas sin ítems` : null,
          orphanProduct.length ? `${orphanProduct.length} ítems con productId huérfano` : null,
          possibleDuplicates.length ? `${possibleDuplicates.length} posibles duplicados (<30s)` : null,
          priceVsCatalog.length
            ? `${priceVsCatalog.length} líneas con precio distinto al catálogo actual (≥$1 y ≥5%)`
            : null,
        ].filter(Boolean),
      },
    };
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
