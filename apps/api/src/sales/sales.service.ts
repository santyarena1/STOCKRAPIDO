import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { ProductsService } from '../products/products.service';

export type SaleItemInput =
  | { productId: string; qty: number; unitPrice: number }
  | { productId?: string; name?: string; qty: number; unitPrice: number };

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private products: ProductsService,
  ) {}

  async create(
    businessId: string,
    userId: string,
    items: SaleItemInput[],
    options?: { customerId?: string; discount?: number; paymentMethod?: string; cashRegisterId?: string },
  ) {
    const discount = options?.discount ?? 0;
    let total = 0;
    const saleItems = items.map((i) => {
      const subtotal = i.qty * i.unitPrice;
      total += subtotal;
      const isManual = !i.productId || String(i.productId).startsWith('manual-');
      return {
        productId: isManual ? null : (i as { productId: string }).productId,
        productName: isManual ? ((i as { name?: string }).name || 'Producto manual') : null,
        qty: i.qty,
        unitPrice: new Decimal(i.unitPrice),
        subtotal: new Decimal(subtotal),
      };
    });
    const totalFinal = total - discount;

    const sale = await this.prisma.sale.create({
      data: {
        businessId,
        userId,
        customerId: options?.customerId,
        total: new Decimal(total),
        discount: new Decimal(discount),
        totalFinal: new Decimal(totalFinal),
        paymentMethod: options?.paymentMethod,
        cashRegisterId: options?.cashRegisterId,
        items: { create: saleItems },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    for (const item of items) {
      const isManual = !item.productId || String(item.productId).startsWith('manual-');
      if (!isManual && item.productId) {
        await this.products.deductStockFromBatches(item.productId, businessId, item.qty);
      }
    }

    if (options?.customerId) {
      await this.prisma.customer.update({
        where: { id: options.customerId },
        data: { balance: { increment: totalFinal } },
      });
    }

    return sale;
  }

  async list(businessId: string, from?: Date, to?: Date, customerId?: string, limit = 50) {
    const where: Record<string, unknown> = { businessId };
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = from;
      if (to) (where.createdAt as Record<string, Date>).lte = to;
    }
    if (customerId) where.customerId = customerId;
    return this.prisma.sale.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: true } }, user: { select: { name: true } }, customer: true },
    });
  }

  async getOne(id: string, businessId: string) {
    return this.prisma.sale.findFirst({
      where: { id, businessId },
      include: { items: { include: { product: true } }, user: true, customer: true },
    });
  }
}
