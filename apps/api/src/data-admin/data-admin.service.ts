import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CATEGORIES = [
  'ventas', 'movimientos', 'compras', 'clientes', 'productos', 'productos-importados',
  'stock', 'promociones', 'figuritas-pedidos', 'vendedores', 'usuarios', 'configuracion',
] as const;
type WipeCategory = (typeof CATEGORIES)[number];

@Injectable()
export class DataAdminService {
  constructor(private prisma: PrismaService) {}

  async wipe(businessId: string, currentUserId: string, rawCategory?: string, confirmation?: string) {
    if (confirmation?.trim() !== 'confirmo borrar datos') {
      throw new BadRequestException('La confirmación escrita no coincide.');
    }
    if (!CATEGORIES.includes(rawCategory as WipeCategory)) {
      throw new BadRequestException('Categoría de datos inválida.');
    }
    const executor = await this.prisma.user.findFirst({
      where: { id: currentUserId, businessId, isActive: true },
      select: { id: true },
    });
    if (!executor) throw new BadRequestException('El usuario ejecutor no pertenece al negocio.');
    const category = rawCategory as WipeCategory;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      let payload: unknown;
      let rowCount = 0;

      if (category === 'ventas') {
        const rows = await tx.sale.findMany({ where: { businessId }, include: { items: true, fiscalDocument: true } });
        payload = { sales: rows };
        rowCount = rows.reduce((count, row) => count + 1 + row.items.length + (row.fiscalDocument ? 1 : 0), 0);
      } else if (category === 'movimientos') {
        const rows = await tx.stockMove.findMany({ where: { product: { businessId } } });
        payload = { stockMoves: rows }; rowCount = rows.length;
      } else if (category === 'compras') {
        const rows = await tx.purchase.findMany({ where: { businessId }, include: { items: true } });
        payload = { purchases: rows };
        rowCount = rows.reduce((count, row) => count + 1 + row.items.length, 0);
      } else if (category === 'clientes') {
        const rows = await tx.customer.findMany({ where: { businessId }, include: { payments: true, sales: { select: { id: true } } } });
        payload = { customers: rows };
        rowCount = rows.reduce((count, row) => count + 1 + row.payments.length + row.sales.length, 0);
      } else if (category === 'productos' || category === 'productos-importados') {
        const productWhere = category === 'productos'
          ? { businessId }
          : { businessId, OR: [{ sourceProvider: { not: null } }, { sourceConnectionId: { not: null } }] };
        const products = await tx.product.findMany({
          where: productWhere,
          include: { batches: true, stockMoves: true, purchaseItems: true },
        });
        const productIds = products.map((product) => product.id);
        const syncedProducts = await tx.syncedProduct.findMany({
          where: category === 'productos-importados' ? { businessId } : { businessId, linkedProductId: { in: productIds } },
        });
        payload = { products, syncedProducts };
        rowCount = products.reduce((count, product) => count + 1 + product.batches.length + product.stockMoves.length + product.purchaseItems.length, 0) + syncedProducts.length;
      } else if (category === 'stock') {
        const products = await tx.product.findMany({ where: { businessId }, select: { id: true, stock: true } });
        const batches = await tx.productBatch.findMany({ where: { businessId } });
        payload = { products, batches }; rowCount = products.length + batches.length;
      } else if (category === 'promociones') {
        const rows = await tx.promo.findMany({ where: { businessId } });
        payload = { promotions: rows }; rowCount = rows.length;
      } else if (category === 'figuritas-pedidos') {
        const rows = await tx.stickerOrder.findMany({ where: { businessId }, include: { items: true } });
        payload = { stickerOrders: rows };
        rowCount = rows.reduce((count, row) => count + 1 + row.items.length, 0);
      } else if (category === 'vendedores') {
        const rows = await tx.vendedor.findMany({ where: { businessId }, include: { sessions: true, sales: { select: { id: true } } } });
        payload = { vendedores: rows };
        rowCount = rows.reduce((count, row) => count + 1 + row.sessions.length + row.sales.length, 0);
      } else if (category === 'usuarios') {
        const rows = await tx.user.findMany({
          where: { businessId, id: { not: currentUserId } },
          include: { auditLogs: true, passwordResetTokens: true, refreshTokens: true, sales: { select: { id: true } } },
        });
        payload = { users: rows };
        rowCount = rows.reduce((count, row) => count + 1 + row.auditLogs.length + row.passwordResetTokens.length + row.refreshTokens.length + row.sales.length, 0);
      } else {
        const business = await tx.business.findUnique({ where: { id: businessId }, select: { id: true, posConfig: true } });
        payload = { business }; rowCount = business ? 1 : 0;
      }

      const serializedPayload = JSON.parse(JSON.stringify(payload) || 'null');
      const backup = await tx.dataBackup.create({
        data: { businessId, category, payload: serializedPayload, rowCount, expiresAt },
        select: { id: true, expiresAt: true },
      });

      if (category === 'ventas') {
        await tx.sale.deleteMany({ where: { businessId } });
      } else if (category === 'movimientos') {
        await tx.stockMove.deleteMany({ where: { product: { businessId } } });
      } else if (category === 'compras') {
        await tx.purchase.deleteMany({ where: { businessId } });
      } else if (category === 'clientes') {
        await tx.sale.updateMany({ where: { businessId, customerId: { not: null } }, data: { customerId: null } });
        await tx.customer.deleteMany({ where: { businessId } });
      } else if (category === 'productos' || category === 'productos-importados') {
        const productWhere = category === 'productos'
          ? { businessId }
          : { businessId, OR: [{ sourceProvider: { not: null } }, { sourceConnectionId: { not: null } }] };
        const products = await tx.product.findMany({ where: productWhere, select: { id: true } });
        const productIds = products.map((product) => product.id);
        if (category === 'productos-importados') await tx.syncedProduct.deleteMany({ where: { businessId } });
        else await tx.syncedProduct.updateMany({ where: { businessId, linkedProductId: { in: productIds } }, data: { linkedProductId: null } });
        await tx.purchaseItem.deleteMany({ where: { productId: { in: productIds } } });
        await tx.product.deleteMany({ where: { id: { in: productIds }, businessId } });
      } else if (category === 'stock') {
        await tx.productBatch.deleteMany({ where: { businessId } });
        await tx.product.updateMany({ where: { businessId }, data: { stock: 0 } });
      } else if (category === 'promociones') {
        await tx.promo.deleteMany({ where: { businessId } });
      } else if (category === 'figuritas-pedidos') {
        await tx.stickerOrder.deleteMany({ where: { businessId } });
      } else if (category === 'vendedores') {
        await tx.sale.updateMany({ where: { businessId, sellerId: { not: null } }, data: { sellerId: null } });
        await tx.vendedor.deleteMany({ where: { businessId } });
      } else if (category === 'usuarios') {
        const users = await tx.user.findMany({ where: { businessId, id: { not: currentUserId } }, select: { id: true } });
        const userIds = users.map((user) => user.id);
        await tx.sale.updateMany({ where: { businessId, userId: { in: userIds } }, data: { userId: currentUserId } });
        await tx.pausedSale.updateMany({ where: { businessId, userId: { in: userIds } }, data: { userId: currentUserId } });
        await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { businessId, id: { in: userIds } } });
      } else {
        await tx.business.update({ where: { id: businessId }, data: { posConfig: {} } });
      }

      return { category, deleted: rowCount, backupId: backup.id, expiresAt: backup.expiresAt };
    }, { maxWait: 10000, timeout: 120000 });
  }

  backups(businessId: string) {
    return this.prisma.dataBackup.findMany({
      where: { businessId },
      select: { id: true, category: true, rowCount: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async purgeExpired() {
    const result = await this.prisma.dataBackup.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return { deleted: result.count };
  }
}
