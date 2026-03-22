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

  /**
   * Ganancia bruta = ingreso neto por línea (subtotal prorrateado con descuento global de la venta) − costo × cantidad.
   * El costo sale del producto; ítems manuales sin producto cuentan costo 0.
   */
  async marginEstimate(businessId: string, period: 'today' | 'week' | 'month') {
    const { from, to } = this.getDateRange(period);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: from, lte: to } },
      include: { items: { include: { product: true } } },
    });
    let revenue = 0;
    let cost = 0;
    let margin = 0;
    for (const sale of sales) {
      const t = Number(sale.total);
      const tf = Number(sale.totalFinal);
      const factor = t > 0 ? tf / t : 1;
      for (const item of sale.items) {
        const unitCost = item.product?.cost != null ? Number(item.product.cost) : 0;
        const lineSub = Number(item.subtotal);
        const lineNet = lineSub * factor;
        const lineCost = unitCost * item.qty;
        revenue += lineNet;
        cost += lineCost;
        margin += lineNet - lineCost;
      }
    }
    return { revenue, cost, margin };
  }

  /** Ganancia = Ventas - Compras - Gastos (del período). */
  async netProfit(businessId: string, period: 'today' | 'week' | 'month') {
    const { from, to } = this.getDateRange(period);
    const [sales, purchases, registers] = await Promise.all([
      this.prisma.sale.findMany({
        where: { businessId, status: 'completed', createdAt: { gte: from, lte: to } },
        select: { totalFinal: true },
      }),
      this.prisma.purchase.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        select: { total: true },
      }),
      this.prisma.cashRegister.findMany({
        where: { businessId },
        select: { id: true },
      }),
    ]);
    const salesTotal = sales.reduce((s, v) => s + Number(v.totalFinal), 0);
    const purchasesTotal = purchases.reduce((s, v) => s + Number(v.total), 0);
    let expensesTotal = 0;
    if (registers.length > 0) {
      const movements = await this.prisma.cashMovement.findMany({
        where: {
          cashRegisterId: { in: registers.map((r) => r.id) },
          type: 'expense',
          createdAt: { gte: from, lte: to },
        },
        select: { amount: true },
      });
      expensesTotal = movements.reduce((s, m) => s + Number(m.amount), 0);
    }
    const ganancia = salesTotal - purchasesTotal - expensesTotal;
    return { sales: salesTotal, purchases: purchasesTotal, expenses: expensesTotal, ganancia };
  }

  async lowStock(businessId: string) {
    const list = await this.prisma.product.findMany({
      where: { businessId, isActive: true, stockControl: true },
      include: { category: true },
    });
    return list.filter((p) => p.stock <= p.minStock);
  }

  /** Por producto: solo cantidad de lotes que vencen en la fecha más cercana (mismo día). No usa product.stock. */
  async expiringSoon(businessId: string, days = 30): Promise<{ name: string; expiresAt: string; qtyExpiring: number }[]> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const limit = new Date();
    limit.setDate(limit.getDate() + days);
    limit.setHours(23, 59, 59, 999);
    const batches = await this.prisma.productBatch.findMany({
      where: {
        businessId,
        expiresAt: { not: null, gte: now, lte: limit },
        qty: { gt: 0 },
      },
      select: {
        productId: true,
        expiresAt: true,
        qty: true,
        product: { select: { name: true } },
      },
    });
    const byProduct = new Map<string, { name: string; nextKey: string; qty: number }>();
    for (const b of batches) {
      const key = new Date(b.expiresAt!).toISOString().slice(0, 10);
      const name = b.product.name;
      const existing = byProduct.get(b.productId);
      if (!existing) {
        byProduct.set(b.productId, { name, nextKey: key, qty: b.qty });
      } else if (key < existing.nextKey) {
        existing.nextKey = key;
        existing.qty = b.qty;
      } else if (key === existing.nextKey) {
        existing.qty += b.qty;
      }
    }
    return Array.from(byProduct.values())
      .map((x) => ({ name: x.name, expiresAt: x.nextKey, qtyExpiring: x.qty }))
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
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

  /** Ventas agregadas por día del mes actual (para gráfico). */
  async salesByDayOfMonth(businessId: string, year?: number, month?: number) {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth();
    const from = new Date(y, m, 1, 0, 0, 0, 0);
    const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: from, lte: to } },
      select: { totalFinal: true, createdAt: true },
    });
    const byDay = new Map<number, { total: number; count: number }>();
    for (let d = 1; d <= daysInMonth; d++) byDay.set(d, { total: 0, count: 0 });
    for (const s of sales) {
      const day = s.createdAt.getDate();
      const cur = byDay.get(day)!;
      cur.total += Number(s.totalFinal);
      cur.count += 1;
      byDay.set(day, cur);
    }
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const v = byDay.get(day) ?? { total: 0, count: 0 };
      return { day, ...v };
    });
  }

  /** Top productos por ganancia bruta (ingreso neto de línea − costo × cantidad; mismo criterio que /reports/margin). */
  async topProductsByProfit(businessId: string, period: 'today' | 'week' | 'month', limit = 10) {
    const { from, to } = this.getDateRange(period);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: from, lte: to } },
      include: { items: { include: { product: true } } },
    });
    const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    for (const sale of sales) {
      const t = Number(sale.total);
      const tf = Number(sale.totalFinal);
      const factor = t > 0 ? tf / t : 1;
      for (const item of sale.items) {
        const name = item.product?.name ?? item.productName ?? 'Manual';
        const id = item.productId ?? `manual-${name}`;
        const unitCost = item.product?.cost != null ? Number(item.product.cost) : 0;
        const lineSub = Number(item.subtotal);
        const lineNet = lineSub * factor;
        const profit = lineNet - unitCost * item.qty;
        const prev = map.get(id) ?? { name, qty: 0, revenue: 0, profit: 0 };
        prev.qty += item.qty;
        prev.revenue += lineNet;
        prev.profit += profit;
        map.set(id, prev);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.profit - a.profit)
      .slice(0, limit)
      .map(({ name, qty, revenue, profit }) => ({ name, qty, total: revenue, profit }));
  }

  /** Productos menos vendidos en el período (los que tienen ventas pero menor cantidad). */
  async leastSoldProducts(businessId: string, period: 'today' | 'week' | 'month', limit = 10) {
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
      .sort((a, b) => a.qty - b.qty)
      .slice(0, limit);
  }

  /** Top productos por cantidad que vence en la fecha más cercana (misma lógica que expiringSoon). */
  async topProductsExpiringSoon(businessId: string, days = 30, limit = 10) {
    const list = await this.expiringSoon(businessId, days);
    return list
      .sort((a, b) => b.qtyExpiring - a.qtyExpiring)
      .slice(0, limit)
      .map(({ name, expiresAt, qtyExpiring }) => ({
        name,
        qty: qtyExpiring,
        nextExpiry: expiresAt,
      }));
  }

  /** Compras agregadas por día del mes (para gráfico). */
  async purchasesByDayOfMonth(businessId: string, year?: number, month?: number) {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth();
    const from = new Date(y, m, 1, 0, 0, 0, 0);
    const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const purchases = await this.prisma.purchase.findMany({
      where: { businessId, createdAt: { gte: from, lte: to } },
      select: { total: true, createdAt: true },
    });
    const byDay = new Map<number, { total: number; count: number }>();
    for (let d = 1; d <= daysInMonth; d++) byDay.set(d, { total: 0, count: 0 });
    for (const p of purchases) {
      const day = p.createdAt.getDate();
      const cur = byDay.get(day)!;
      cur.total += Number(p.total);
      cur.count += 1;
      byDay.set(day, cur);
    }
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const v = byDay.get(day) ?? { total: 0, count: 0 };
      return { day, ...v };
    });
  }

  /** Gastos de caja (movimientos tipo expense) por día del mes. */
  async expensesByDayOfMonth(businessId: string, year?: number, month?: number) {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth();
    const from = new Date(y, m, 1, 0, 0, 0, 0);
    const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const registers = await this.prisma.cashRegister.findMany({
      where: { businessId },
      select: { id: true },
    });
    const regIds = registers.map((r) => r.id);
    if (regIds.length === 0) {
      return Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, total: 0, count: 0 }));
    }
    const movements = await this.prisma.cashMovement.findMany({
      where: {
        cashRegisterId: { in: regIds },
        type: 'expense',
        createdAt: { gte: from, lte: to },
      },
      select: { amount: true, createdAt: true },
    });
    const byDay = new Map<number, { total: number; count: number }>();
    for (let d = 1; d <= daysInMonth; d++) byDay.set(d, { total: 0, count: 0 });
    for (const mov of movements) {
      const day = mov.createdAt.getDate();
      const cur = byDay.get(day)!;
      cur.total += Number(mov.amount);
      cur.count += 1;
      byDay.set(day, cur);
    }
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const v = byDay.get(day) ?? { total: 0, count: 0 };
      return { day, ...v };
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
