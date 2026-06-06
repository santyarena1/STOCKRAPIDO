import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    if (!options?.cashRegisterId?.trim()) {
      throw new BadRequestException('Tenés que tener la caja abierta para registrar ventas.');
    }
    const reg = await this.prisma.cashRegister.findFirst({
      where: { id: options.cashRegisterId.trim(), businessId, closedAt: null },
    });
    if (!reg) throw new BadRequestException('Caja no encontrada o cerrada. Abrí caja desde el menú Caja.');

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
        cashRegisterId: options.cashRegisterId.trim(),
        items: { create: saleItems },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    for (const item of items) {
      const isManual = !item.productId || String(item.productId).startsWith('manual-');
      if (!isManual && item.productId) {
        await this.products.deductStockFromBatches(item.productId, businessId, item.qty);
        await this.prisma.stockMove.create({
          data: {
            productId: item.productId,
            qty: -item.qty,
            reason: 'venta',
            reference: sale.id,
          },
        });
      }
    }

    if (options?.customerId && options?.paymentMethod === 'fiado') {
      await this.prisma.customer.update({
        where: { id: options.customerId },
        data: { balance: { increment: totalFinal } },
      });
    }

    return sale;
  }

  async list(businessId: string, from?: Date, to?: Date, customerId?: string, limit = 50, productId?: string) {
    const where: Record<string, unknown> = { businessId };
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = from;
      if (to) (where.createdAt as Record<string, Date>).lte = to;
    }
    if (customerId) where.customerId = customerId;
    const pid = productId?.trim();
    if (pid) where.items = { some: { productId: pid } };
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

  async deleteSale(businessId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    for (const it of sale.items) {
      if (it.productId && it.qty > 0) {
        await this.products.adjustStock(
          it.productId,
          businessId,
          it.qty,
          'correccion_venta',
          `anula-venta:${saleId}`,
        );
      }
    }

    if (sale.paymentMethod === 'fiado' && sale.customerId) {
      await this.prisma.customer.update({
        where: { id: sale.customerId },
        data: { balance: { decrement: Number(sale.totalFinal) } },
      });
    }

    await this.prisma.sale.delete({ where: { id: saleId } });
    return { ok: true };
  }

  async updateSale(
    businessId: string,
    saleId: string,
    dto: {
      discount?: number;
      paymentMethod?: string;
      customerId?: string | null;
    },
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    const oldFinal = Number(sale.totalFinal);
    const oldPayment = sale.paymentMethod;
    const oldCustomerId = sale.customerId;

    let discount = dto.discount !== undefined ? dto.discount : Number(sale.discount);
    if (discount < 0) throw new BadRequestException('Descuento inválido');

    const total = sale.items.reduce((s, i) => s + Number(i.subtotal), 0);
    if (discount > total) discount = total;
    const totalFinal = total - discount;

    const newPayment = dto.paymentMethod !== undefined ? dto.paymentMethod : oldPayment;
    const newCustomerId = dto.customerId !== undefined ? dto.customerId : oldCustomerId;

    if (oldPayment === 'fiado' && oldCustomerId) {
      await this.prisma.customer.update({
        where: { id: oldCustomerId },
        data: { balance: { decrement: oldFinal } },
      });
    }

    if (newPayment === 'fiado' && newCustomerId) {
      await this.prisma.customer.update({
        where: { id: newCustomerId },
        data: { balance: { increment: totalFinal } },
      });
    }

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        discount: new Decimal(discount),
        total: new Decimal(total),
        totalFinal: new Decimal(totalFinal),
        ...(dto.paymentMethod !== undefined && { paymentMethod: dto.paymentMethod }),
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
      },
    });

    return this.getOne(saleId, businessId);
  }

  async updateSaleItem(
    businessId: string,
    saleId: string,
    itemId: string,
    dto: { qty?: number; unitPrice?: number },
  ) {
    const item = await this.prisma.saleItem.findFirst({
      where: { id: itemId, saleId },
      include: { sale: true },
    });
    if (!item || item.sale.businessId !== businessId) throw new NotFoundException('Ítem no encontrado');

    const sale = item.sale;
    const oldQty = item.qty;
    const oldFinal = Number(sale.totalFinal);
    const newQty = dto.qty !== undefined ? dto.qty : oldQty;
    const newUnit = dto.unitPrice !== undefined ? dto.unitPrice : Number(item.unitPrice);

    if (newQty < 1) throw new BadRequestException('La cantidad debe ser al menos 1');
    if (newUnit < 0) throw new BadRequestException('Precio inválido');

    if (item.productId) {
      const delta = newQty - oldQty;
      if (delta > 0) {
        await this.products.deductStockFromBatches(item.productId, businessId, delta);
      } else if (delta < 0) {
        await this.products.adjustStock(
          item.productId,
          businessId,
          -delta,
          'correccion_venta',
          `venta:${saleId}`,
        );
      }
    }

    const newSubtotal = newQty * newUnit;
    await this.prisma.saleItem.update({
      where: { id: itemId },
      data: {
        qty: newQty,
        unitPrice: new Decimal(newUnit),
        subtotal: new Decimal(newSubtotal),
      },
    });

    const items = await this.prisma.saleItem.findMany({ where: { saleId } });
    const sumItems = items.reduce((s, i) => s + Number(i.subtotal), 0);
    const discount = Number(sale.discount);
    const totalFinal = Math.max(0, sumItems - discount);

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        total: new Decimal(sumItems),
        totalFinal: new Decimal(totalFinal),
      },
    });

    if (sale.paymentMethod === 'fiado' && sale.customerId) {
      const deltaBal = totalFinal - oldFinal;
      if (deltaBal !== 0) {
        await this.prisma.customer.update({
          where: { id: sale.customerId },
          data: { balance: { increment: deltaBal } },
        });
      }
    }

    return this.getOne(saleId, businessId);
  }

  async deleteSaleItem(businessId: string, saleId: string, itemId: string) {
    const item = await this.prisma.saleItem.findFirst({
      where: { id: itemId, saleId },
      include: { sale: true },
    });
    if (!item || item.sale.businessId !== businessId) throw new NotFoundException('Ítem no encontrado');

    const sale = item.sale;
    const oldFinal = Number(sale.totalFinal);

    if (item.productId && item.qty > 0) {
      await this.products.adjustStock(
        item.productId,
        businessId,
        item.qty,
        'correccion_venta',
        `quita-item-venta:${saleId}`,
      );
    }

    await this.prisma.saleItem.delete({ where: { id: itemId } });

    const remaining = await this.prisma.saleItem.count({ where: { saleId } });
    if (remaining === 0) {
      if (sale.paymentMethod === 'fiado' && sale.customerId) {
        await this.prisma.customer.update({
          where: { id: sale.customerId },
          data: { balance: { decrement: oldFinal } },
        });
      }
      await this.prisma.sale.delete({ where: { id: saleId } });
      return { removed: true as const, saleDeleted: true };
    }

    const items = await this.prisma.saleItem.findMany({ where: { saleId } });
    const sumItems = items.reduce((s, i) => s + Number(i.subtotal), 0);
    const discount = Number(sale.discount);
    let adjDiscount = discount;
    if (adjDiscount > sumItems) adjDiscount = sumItems;
    const totalFinal = Math.max(0, sumItems - adjDiscount);

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        total: new Decimal(sumItems),
        discount: new Decimal(adjDiscount),
        totalFinal: new Decimal(totalFinal),
      },
    });

    if (sale.paymentMethod === 'fiado' && sale.customerId) {
      await this.prisma.customer.update({
        where: { id: sale.customerId },
        data: { balance: { increment: totalFinal - oldFinal } },
      });
    }

    return { removed: true as const, saleDeleted: false, sale: await this.getOne(saleId, businessId) };
  }

  async cleanupDuplicates(businessId: string, windowSeconds = 30): Promise<{ deleted: number; ids: string[] }> {
    const sales = await this.prisma.sale.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, totalFinal: true, paymentMethod: true, createdAt: true },
    });

    const toDelete = new Set<string>();
    for (let i = 0; i < sales.length; i++) {
      if (toDelete.has(sales[i].id)) continue;
      for (let j = i + 1; j < sales.length; j++) {
        const diffSeconds = (sales[j].createdAt.getTime() - sales[i].createdAt.getTime()) / 1000;
        if (diffSeconds > windowSeconds) break;
        if (
          sales[j].userId === sales[i].userId &&
          String(sales[j].totalFinal) === String(sales[i].totalFinal) &&
          sales[j].paymentMethod === sales[i].paymentMethod
        ) {
          toDelete.add(sales[j].id);
        }
      }
    }

    const deleted: string[] = [];
    for (const id of toDelete) {
      try {
        await this.deleteSale(businessId, id);
        deleted.push(id);
      } catch { /* skip si ya fue borrada o hubo error */ }
    }
    return { deleted: deleted.length, ids: deleted };
  }
}
