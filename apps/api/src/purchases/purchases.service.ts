import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

type PurchaseItemInput = {
  productId?: string;
  barcode?: string;
  productName?: string;
  qty: number;
  unitCost: number;
  expiresAt?: string;
  categoryId?: string;
  price?: number;
  minStock?: number;
};

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService) {}

  private async resolveProductId(
    businessId: string,
    item: PurchaseItemInput,
  ): Promise<{ productId: string; expiresAt: Date | null; price: number; priceProvided: boolean; categoryId: string | null }> {
    const priceProvided = item.price != null && item.price !== undefined;
    const price = priceProvided ? Number(item.price) : item.unitCost;
    const categoryId = item.categoryId?.trim() ? item.categoryId.trim() : null;
    if (item.productId) {
      const p = await this.prisma.product.findFirst({
        where: { id: item.productId, businessId, isActive: true },
      });
      if (!p) throw new BadRequestException(`Producto ${item.productId} no encontrado`);
      return {
        productId: item.productId,
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
        price: priceProvided ? price : Number(p.price),
        priceProvided,
        categoryId,
      };
    }
    const name = (item.productName ?? '').trim();
    if (!name) throw new BadRequestException('Cada ítem debe tener producto (nombre o selección).');

    let product = null;
    if (item.barcode?.trim()) {
      product = await this.prisma.product.findFirst({
        where: { businessId, barcode: item.barcode.trim(), isActive: true },
      });
    }
    if (!product) {
      const categoryId = item.categoryId?.trim() ? item.categoryId.trim() : null;
      product = await this.prisma.product.create({
        data: {
          businessId,
          name,
          barcode: item.barcode?.trim() || null,
          categoryId,
          cost: new Decimal(item.unitCost),
          price: new Decimal(price),
          minStock: item.minStock ?? 0,
          stock: 0,
          stockControl: true,
          expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
        },
        include: { category: true },
      });
    }
    return {
      productId: (product as any).id,
      expiresAt,
      price: priceProvided ? price : Number((product as any).price),
      priceProvided: priceProvided,
      categoryId,
    };
  }

  async create(
    businessId: string,
    supplierId: string,
    items: PurchaseItemInput[],
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, businessId },
    });
    if (!supplier) throw new BadRequestException('Proveedor no encontrado');

    const resolved: { productId: string; qty: number; unitCost: number; expiresAt: Date | null; price: number; priceProvided: boolean; categoryId: string | null }[] = [];
    for (const item of items) {
      if (!item.qty || item.qty <= 0) continue;
      const out = await this.resolveProductId(businessId, item);
      resolved.push({
        productId: out.productId,
        qty: item.qty,
        unitCost: item.unitCost,
        expiresAt: out.expiresAt,
        price: out.price,
        priceProvided: out.priceProvided,
        categoryId: out.categoryId,
      });
    }
    if (resolved.length === 0) throw new BadRequestException('Agregá al menos un ítem con cantidad mayor a 0.');

    let total = 0;
    const createItems = resolved.map((r) => {
      const subtotal = r.qty * r.unitCost;
      total += subtotal;
      return {
        productId: r.productId,
        qty: r.qty,
        unitCost: new Decimal(r.unitCost),
        subtotal: new Decimal(subtotal),
        expiresAt: r.expiresAt,
      };
    });

    const purchase = await this.prisma.purchase.create({
      data: {
        businessId,
        supplierId,
        total: new Decimal(total),
        items: { create: createItems },
      },
      include: { items: { include: { product: { include: { category: true } } } }, supplier: true },
    });

    for (let i = 0; i < purchase.items.length; i++) {
      const item = purchase.items[i];
      const r = resolved[i];
      await this.prisma.productBatch.create({
        data: {
          productId: r.productId,
          businessId,
          qty: r.qty,
          unitCost: new Decimal(r.unitCost),
          expiresAt: r.expiresAt,
          purchaseItemId: item.id,
        },
      });
      await this.prisma.product.updateMany({
        where: { id: r.productId, businessId },
        data: {
          stock: { increment: r.qty },
          cost: new Decimal(r.unitCost),
          ...(r.priceProvided ? { price: new Decimal(r.price) } : {}),
          ...(r.categoryId != null ? { categoryId: r.categoryId } : {}),
        },
      });
      await this.prisma.stockMove.create({
        data: {
          productId: r.productId,
          qty: r.qty,
          reason: 'compra',
          reference: purchase.id,
        },
      });
    }
    return purchase;
  }

  async list(
    businessId: string,
    supplierId?: string,
    limit = 50,
    from?: Date,
    to?: Date,
  ) {
    const where: Record<string, unknown> = { businessId };
    if (supplierId) where.supplierId = supplierId;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = from;
      if (to) (where.createdAt as Record<string, Date>).lte = to;
    }
    return this.prisma.purchase.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: { include: { category: true } } } },
        supplier: true,
      },
    });
  }

  async getLowStockProducts(businessId: string) {
    const list = await this.prisma.product.findMany({
      where: { businessId, isActive: true, stockControl: true },
      include: { category: true },
    });
    return list.filter((p) => p.stock <= p.minStock);
  }

  async update(
    purchaseId: string,
    businessId: string,
    supplierId: string,
    items: PurchaseItemInput[],
  ) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, businessId },
      include: { items: true },
    });
    if (!purchase) throw new BadRequestException('Compra no encontrada');

    // Revertir stock de los ítems actuales: borrar lotes y descontar de producto
    for (const item of purchase.items) {
      const batches = await this.prisma.productBatch.findMany({
        where: { purchaseItemId: item.id },
      });
      for (const batch of batches) {
        await this.prisma.product.updateMany({
          where: { id: batch.productId, businessId },
          data: { stock: { decrement: batch.qty } },
        });
        await this.prisma.productBatch.delete({ where: { id: batch.id } });
      }
      await this.prisma.stockMove.create({
        data: {
          productId: item.productId,
          qty: -item.qty,
          reason: 'compra_editada',
          reference: purchaseId,
        },
      });
    }
    await this.prisma.purchaseItem.deleteMany({ where: { purchaseId } });

    // Resolver nuevos ítems (igual que create)
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, businessId },
    });
    if (!supplier) throw new BadRequestException('Proveedor no encontrado');

    const resolved: { productId: string; qty: number; unitCost: number; expiresAt: Date | null; price: number; priceProvided: boolean; categoryId: string | null }[] = [];
    for (const item of items) {
      if (!item.qty || item.qty <= 0) continue;
      const out = await this.resolveProductId(businessId, item);
      resolved.push({
        productId: out.productId,
        qty: item.qty,
        unitCost: item.unitCost,
        expiresAt: out.expiresAt,
        price: out.price,
        priceProvided: out.priceProvided,
        categoryId: out.categoryId,
      });
    }
    if (resolved.length === 0) throw new BadRequestException('Agregá al menos un ítem con cantidad mayor a 0.');

    let total = 0;
    const createItems = resolved.map((r) => {
      const subtotal = r.qty * r.unitCost;
      total += subtotal;
      return {
        productId: r.productId,
        qty: r.qty,
        unitCost: new Decimal(r.unitCost),
        subtotal: new Decimal(subtotal),
        expiresAt: r.expiresAt,
      };
    });

    await this.prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        supplierId,
        total: new Decimal(total),
        items: { create: createItems },
      },
    });

    const updated = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { items: { include: { product: { include: { category: true } } } }, supplier: true },
    });
    if (!updated) throw new BadRequestException('Error al actualizar');

    for (let i = 0; i < updated.items.length; i++) {
      const item = updated.items[i];
      const r = resolved[i];
      await this.prisma.productBatch.create({
        data: {
          productId: r.productId,
          businessId,
          qty: r.qty,
          unitCost: new Decimal(r.unitCost),
          expiresAt: r.expiresAt,
          purchaseItemId: item.id,
        },
      });
      await this.prisma.product.updateMany({
        where: { id: r.productId, businessId },
        data: {
          stock: { increment: r.qty },
          cost: new Decimal(r.unitCost),
          ...(r.priceProvided ? { price: new Decimal(r.price) } : {}),
          ...(r.categoryId != null ? { categoryId: r.categoryId } : {}),
        },
      });
      await this.prisma.stockMove.create({
        data: {
          productId: r.productId,
          qty: r.qty,
          reason: 'compra',
          reference: purchaseId,
        },
      });
    }
    return updated;
  }
}
