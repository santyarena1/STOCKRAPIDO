import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Descuenta stock por lotes (FIFO por vencimiento). Si no hay lotes, descuenta del stock total (legacy).
   */
  async deductStockFromBatches(productId: string, businessId: string, qty: number): Promise<void> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new BadRequestException('Producto no encontrado');
    if (!product.stockControl || qty <= 0) return;
    const batches = await this.prisma.productBatch.findMany({
      where: { productId, businessId, qty: { gt: 0 } },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (batches.length === 0) {
      const newStock = Math.max(0, product.stock - qty);
      await this.prisma.product.update({
        where: { id: productId },
        data: { stock: newStock },
      });
      return;
    }
    let remaining = qty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.qty, remaining);
      remaining -= deduct;
      const newQty = batch.qty - deduct;
      if (newQty <= 0) {
        await this.prisma.productBatch.delete({ where: { id: batch.id } });
      } else {
        await this.prisma.productBatch.update({
          where: { id: batch.id },
          data: { qty: newQty },
        });
      }
    }
    await this.prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: qty } },
    });
  }

  async search(businessId: string, q: string, limit = 20) {
    const term = q.trim();
    if (!term) return [];
    const byBarcode = await this.prisma.product.findMany({
      where: { businessId, barcode: term, isActive: true },
      take: 1,
      include: { category: true },
    });
    if (byBarcode.length) return byBarcode;
    return this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { name: { contains: term } },
          { barcode: { contains: term } },
        ],
      },
      take: limit,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async list(businessId: string, categoryId?: string, lowStock?: boolean) {
    const where: Record<string, unknown> = { businessId, isActive: true };
    if (categoryId) where.categoryId = categoryId;
    let list = await this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    if (lowStock)
      list = list.filter((p: { stockControl: boolean; stock: number; minStock: number }) => p.stockControl && p.stock <= p.minStock);
    return list;
  }

  async create(businessId: string, data: {
    name: string;
    barcode?: string;
    categoryId?: string;
    cost?: number;
    price: number;
    stock?: number;
    minStock?: number;
    stockControl?: boolean;
    brand?: string;
    iva?: number;
    expiresAt?: string;
  }) {
    return this.prisma.product.create({
      data: {
        businessId,
        name: data.name,
        barcode: data.barcode,
        categoryId: data.categoryId,
        cost: data.cost != null ? new Decimal(data.cost) : null,
        price: new Decimal(data.price),
        stock: data.stock ?? 0,
        minStock: data.minStock ?? 0,
        stockControl: data.stockControl ?? true,
        brand: data.brand,
        iva: data.iva != null ? new Decimal(data.iva) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
      include: { category: true },
    });
  }

  async update(id: string, businessId: string, data: Partial<{
    name: string;
    barcode: string;
    categoryId: string;
    cost: number;
    price: number;
    minStock: number;
    stockControl: boolean;
    isActive: boolean;
    brand: string;
    iva: number;
    expiresAt: string;
  }>) {
    const update: Record<string, unknown> = { ...data };
    if (data.cost != null) update.cost = new Decimal(data.cost);
    if (data.price != null) update.price = new Decimal(data.price);
    if (data.iva != null) update.iva = new Decimal(data.iva);
    if (data.expiresAt != null) update.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    return this.prisma.product.update({
      where: { id, businessId },
      data: update,
      include: { category: true },
    });
  }

  async adjustStock(id: string, businessId: string, qty: number, reason: string, reference?: string) {
    const product = await this.prisma.product.findFirst({ where: { id, businessId } });
    if (!product) return null;
    await this.prisma.stockMove.create({
      data: { productId: id, qty, reason, reference },
    });
    if (qty < 0) {
      await this.deductStockFromBatches(id, businessId, Math.abs(qty));
    } else {
      await this.prisma.productBatch.create({
        data: {
          productId: id,
          businessId,
          qty,
          unitCost: product.cost ?? new Decimal(0),
          purchaseItemId: null,
        },
      });
      await this.prisma.product.update({
        where: { id },
        data: { stock: { increment: qty } },
      });
    }
    return this.prisma.product.findFirst({
      where: { id, businessId },
      include: { category: true, batches: true },
    });
  }

  async getOne(id: string, businessId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, businessId },
      include: {
        category: true,
        batches: { orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!p) return null;
    return p;
  }

  async getAllStockMoves(businessId: string, limit = 100) {
    const products = await this.prisma.product.findMany({
      where: { businessId },
      select: { id: true },
    });
    const ids = products.map((p) => p.id);
    return this.prisma.stockMove.findMany({
      where: { productId: { in: ids } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, barcode: true } } },
    });
  }

  async getStockMoves(productId: string, businessId: string, limit = 50) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) return [];
    return this.prisma.stockMove.findMany({
      where: { productId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}
