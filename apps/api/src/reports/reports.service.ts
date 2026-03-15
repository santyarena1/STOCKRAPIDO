import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private getDateRange(period: 'today' | 'week' | 'month') {
    const now = new Date();
    const from = new Date(now);
    if (period === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      from.setDate(from.getDate() - 7);
      from.setHours(0, 0, 0, 0);
    } else {
      from.setMonth(from.getMonth() - 1);
      from.setHours(0, 0, 0, 0);
    }
    return { from, to: now };
  }

  async salesSummary(businessId: string, period: 'today' | 'week' | 'month') {
    const { from, to } = this.getDateRange(period);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: from, lte: to } },
      include: { items: { include: { product: true } } },
    });
    const total = sales.reduce((s, v) => s + Number(v.totalFinal), 0);
    const count = sales.length;
    return { total, count, sales };
  }

  async topProducts(businessId: string, period: 'today' | 'week' | 'month', limit = 10) {
    const { from, to } = this.getDateRange(period);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: from, lte: to } },
      include: { items: { include: { product: true } } },
    });
    const map = new Map<string, { name: string; qty: number; total: number }>();
    for (const sale of sales) {
      for (const item of sale.items) {
        const name = item.product?.name ?? item.productName ?? 'Manual';
        const id = item.productId ?? `manual-${name}`;
        const prev = map.get(id) ?? { name, qty: 0, total: 0 };
        prev.qty += item.qty;
        prev.total += Number(item.subtotal);
        map.set(id, prev);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  }

  async marginEstimate(businessId: string, period: 'today' | 'week' | 'month') {
    const { from, to } = this.getDateRange(period);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: from, lte: to } },
      include: { items: { include: { product: true } } },
    });
    let revenue = 0;
    let cost = 0;
    for (const sale of sales) {
      for (const item of sale.items) {
        revenue += Number(item.subtotal);
        if (item.product?.cost) cost += Number(item.product.cost) * item.qty;
      }
    }
    return { revenue, cost, margin: revenue - cost };
  }

  async lowStock(businessId: string) {
    const list = await this.prisma.product.findMany({
      where: { businessId, isActive: true, stockControl: true },
      include: { category: true },
    });
    return list.filter((p) => p.stock <= p.minStock);
  }

  async expiringSoon(businessId: string, days = 30) {
    const now = new Date();
    const limit = new Date();
    limit.setDate(limit.getDate() + days);
    const byProductExpiry = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        expiresAt: { not: null, gte: now, lte: limit },
      },
      include: { category: true },
    });
    const batchesInRange = await this.prisma.productBatch.findMany({
      where: {
        businessId,
        expiresAt: { not: null, gte: now, lte: limit },
        qty: { gt: 0 },
      },
      include: { product: { include: { category: true } } },
    });
    const productIdsFromBatches = [...new Set(batchesInRange.map((b) => b.productId))];
    const byBatchAlreadyFound = new Set(byProductExpiry.map((p) => p.id));
    const missingIds = productIdsFromBatches.filter((id) => !byBatchAlreadyFound.has(id));
    if (missingIds.length === 0) return byProductExpiry;
    const byBatchProducts = await this.prisma.product.findMany({
      where: { id: { in: missingIds }, businessId, isActive: true },
      include: { category: true },
    });
    return [...byProductExpiry, ...byBatchProducts];
  }

  async cajaByDay(businessId: string, from: Date, to: Date) {
    return this.prisma.cashRegister.findMany({
      where: {
        businessId,
        closedAt: { not: null },
        openedAt: { gte: from, lte: to },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async salesCsv(businessId: string, from: Date, to: Date) {
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: from, lte: to } },
      include: { items: true, user: { select: { name: true } } },
    });
    const rows: string[] = ['Fecha,ID,Vendedor,Total,Descuento,Final'];
    for (const s of sales) {
      rows.push(
        `${s.createdAt.toISOString()},${s.id},${(s.user as { name: string }).name},${s.total},${s.discount},${s.totalFinal}`,
      );
    }
    return rows.join('\n');
  }
}
