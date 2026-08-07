import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ReportPeriod = 'today' | 'week' | 'month' | 'year';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /** Conserva los rangos históricos de los endpoints existentes. */
  private getLegacyDateRange(period: 'today' | 'week' | 'month') {
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

  private getDateRange(period: ReportPeriod, explicitFrom?: Date, explicitTo?: Date) {
    if (explicitFrom || explicitTo) {
      return {
        from: explicitFrom ?? new Date(0),
        to: explicitTo ?? new Date(),
      };
    }
    const now = new Date();
    const argentinaNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    let year = argentinaNow.getUTCFullYear();
    let month = argentinaNow.getUTCMonth();
    let day = argentinaNow.getUTCDate();
    if (period === 'today') {
      // El offset fijo -03:00 es válido para Argentina (sin DST).
    } else if (period === 'week') {
      const start = new Date(Date.UTC(year, month, day - 6));
      year = start.getUTCFullYear();
      month = start.getUTCMonth();
      day = start.getUTCDate();
    } else if (period === 'month') {
      day = 1;
    } else {
      month = 0;
      day = 1;
    }
    const from = new Date(Date.UTC(year, month, day, 3, 0, 0, 0));
    return { from, to: now };
  }

  private argentinaHour(date: Date) {
    return new Date(date.getTime() - 3 * 60 * 60 * 1000).getUTCHours();
  }

  private argentinaWeekday(date: Date) {
    return new Date(date.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
  }

  async salesSummary(businessId: string, period: 'today' | 'week' | 'month') {
    const { from, to } = this.getLegacyDateRange(period);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: from, lte: to } },
      include: { items: { include: { product: true } } },
    });
    const total = sales.reduce((s, v) => s + Number(v.totalFinal), 0);
    const count = sales.length;
    return { total, count, sales };
  }

  async topProducts(businessId: string, period: 'today' | 'week' | 'month', limit = 10) {
    const { from, to } = this.getLegacyDateRange(period);
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
    const { from, to } = this.getLegacyDateRange(period);
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
    const { from, to } = this.getLegacyDateRange(period);
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

  /** POS: productos con stock ≤ maxUnits (por defecto 3), solo con control de stock. */
  async criticalStockForPos(businessId: string, maxUnits = 3) {
    const threshold =
      Number.isFinite(maxUnits) && maxUnits >= 0 ? Math.min(Math.floor(maxUnits), 500) : 3;
    const items = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        stockControl: true,
        stock: { lte: threshold },
      },
      select: { id: true, name: true, stock: true },
      orderBy: [{ stock: 'asc' }, { name: 'asc' }],
      take: 100,
    });
    return { maxUnits: threshold, count: items.length, items };
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

  /** Valorización y estadísticas de inventario (productos activos). */
  async stockSummary(businessId: string, expiringDays = 30) {
    const products = await this.prisma.product.findMany({
      where: { businessId, isActive: true },
      select: {
        stock: true,
        cost: true,
        price: true,
        minStock: true,
        stockControl: true,
      },
    });

    let totalUnits = 0;
    let valueAtCostProduct = 0;
    let valueAtSale = 0;
    let productsWithStock = 0;
    let productsNoStock = 0;
    let lowStockCount = 0;
    let productsWithoutCostWithStock = 0;

    for (const p of products) {
      const st = p.stock;
      totalUnits += st;
      if (st > 0) productsWithStock += 1;
      else productsNoStock += 1;
      const costNum = p.cost != null ? Number(p.cost) : 0;
      if (st > 0 && p.cost == null) productsWithoutCostWithStock += 1;
      valueAtCostProduct += st * costNum;
      valueAtSale += st * Number(p.price);
      if (p.stockControl && st <= p.minStock) lowStockCount += 1;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const limit = new Date();
    limit.setDate(limit.getDate() + expiringDays);
    limit.setHours(23, 59, 59, 999);

    const [batchCostRows, expiringAgg, expiringBatches, expiringByProduct] = await Promise.all([
      this.prisma.productBatch.findMany({
        where: { businessId, qty: { gt: 0 } },
        select: { qty: true, unitCost: true },
      }),
      this.prisma.productBatch.aggregate({
        where: {
          businessId,
          expiresAt: { not: null, gte: now, lte: limit },
          qty: { gt: 0 },
        },
        _sum: { qty: true },
      }),
      this.prisma.productBatch.findMany({
        where: {
          businessId,
          expiresAt: { not: null, gte: now, lte: limit },
          qty: { gt: 0 },
        },
        select: {
          id: true,
          qty: true,
          expiresAt: true,
          unitCost: true,
          product: { select: { id: true, name: true } },
        },
        orderBy: [{ expiresAt: 'asc' }],
      }),
      this.expiringSoon(businessId, expiringDays),
    ]);

    const valueAtCostBatches = batchCostRows.reduce((s, b) => s + b.qty * Number(b.unitCost), 0);

    return {
      productCount: products.length,
      productsWithStock,
      productsNoStock,
      totalUnits,
      /** Costo según campo costo del producto × stock */
      valueAtCostProduct,
      /** Costo según lotes (compras); más preciso si usás lotes */
      valueAtCostBatches,
      valueAtSale,
      potentialMargin: valueAtSale - valueAtCostProduct,
      lowStockCount,
      expiringDaysWindow: expiringDays,
      expiringProductsCount: expiringByProduct.length,
      expiringUnitsInWindow: expiringAgg._sum.qty ?? 0,
      productsWithoutCostWithStock,
      expiringByProduct,
      expiringBatches: expiringBatches.map((b) => ({
        id: b.id,
        productId: b.product.id,
        productName: b.product.name,
        qty: b.qty,
        expiresAt: (b.expiresAt as Date).toISOString(),
        unitCost: Number(b.unitCost),
      })),
    };
  }

  /**
   * Estadísticas del historial de ventas con los mismos filtros que GET /sales (sin límite de filas).
   */
  async salesHistoryStats(businessId: string, from?: Date, to?: Date, customerId?: string, productId?: string) {
    const where: Record<string, unknown> = { businessId };
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = from;
      if (to) (where.createdAt as Record<string, Date>).lte = to;
    }
    if (customerId) where.customerId = customerId;
    const pid = productId?.trim();
    if (pid) where.items = { some: { productId: pid } };

    const sales = await this.prisma.sale.findMany({
      where,
      select: {
        total: true,
        totalFinal: true,
        discount: true,
        paymentMethod: true,
        items: { select: { qty: true, productId: true } },
      },
    });

    let sumSubtotal = 0;
    let sumDiscount = 0;
    let sumTotalFinal = 0;
    let unitsSold = 0;
    const byPayment: Record<string, { count: number; total: number }> = {};

    for (const s of sales) {
      sumSubtotal += Number(s.total);
      sumDiscount += Number(s.discount);
      sumTotalFinal += Number(s.totalFinal);
      if (pid) {
        for (const it of s.items) {
          if (it.productId === pid) unitsSold += it.qty;
        }
      } else {
        for (const it of s.items) unitsSold += it.qty;
      }
      const pm = s.paymentMethod?.trim() || '_sin_metodo';
      if (!byPayment[pm]) byPayment[pm] = { count: 0, total: 0 };
      byPayment[pm].count += 1;
      byPayment[pm].total += Number(s.totalFinal);
    }

    const saleCount = sales.length;
    const averageTicket = saleCount > 0 ? sumTotalFinal / saleCount : 0;

    return {
      saleCount,
      sumSubtotal,
      sumDiscount,
      sumTotalFinal,
      unitsSold,
      averageTicket,
      byPaymentMethod: byPayment,
    };
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
    const { from, to } = this.getLegacyDateRange(period);
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
    const { from, to } = this.getLegacyDateRange(period);
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

  async salesByHour(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, totalFinal: true },
    });
    const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, count: 0 }));
    for (const sale of sales) {
      const row = rows[this.argentinaHour(sale.createdAt)];
      row.total += Number(sale.totalFinal);
      row.count += 1;
    }
    return rows;
  }

  async salesByWeekday(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, totalFinal: true },
    });
    const rows = Array.from({ length: 7 }, (_, weekday) => ({ weekday, total: 0, count: 0 }));
    for (const sale of sales) {
      const row = rows[this.argentinaWeekday(sale.createdAt)];
      row.total += Number(sale.totalFinal);
      row.count += 1;
    }
    return rows;
  }

  async salesByPayment(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
      select: { paymentMethod: true, totalFinal: true },
    });
    const grouped = new Map<string, { paymentMethod: string; total: number; count: number }>();
    for (const sale of sales) {
      const paymentMethod = sale.paymentMethod?.trim() || 'sin_metodo';
      const row = grouped.get(paymentMethod) ?? { paymentMethod, total: 0, count: 0 };
      row.total += Number(sale.totalFinal);
      row.count += 1;
      grouped.set(paymentMethod, row);
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }

  async salesByUser(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
      select: { userId: true, totalFinal: true, user: { select: { name: true } } },
    });
    const grouped = new Map<string, { userId: string; userName: string; total: number; count: number }>();
    for (const sale of sales) {
      const row = grouped.get(sale.userId) ?? {
        userId: sale.userId,
        userName: sale.user.name,
        total: 0,
        count: 0,
      };
      row.total += Number(sale.totalFinal);
      row.count += 1;
      grouped.set(sale.userId, row);
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }

  async salesByCategory(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
      select: {
        total: true,
        totalFinal: true,
        items: { select: { qty: true, subtotal: true, product: { select: { category: true } } } },
      },
    });
    const grouped = new Map<string, { categoryId: string | null; categoryName: string; total: number; qty: number }>();
    for (const sale of sales) {
      const subtotal = Number(sale.total);
      const discountFactor = subtotal > 0 ? Number(sale.totalFinal) / subtotal : 1;
      for (const item of sale.items) {
        const category = item.product?.category;
        const key = category?.id ?? '__uncategorized__';
        const row = grouped.get(key) ?? {
          categoryId: category?.id ?? null,
          categoryName: category?.name ?? 'Sin categoría',
          total: 0,
          qty: 0,
        };
        row.total += Number(item.subtotal) * discountFactor;
        row.qty += item.qty;
        grouped.set(key, row);
      }
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }

  async salesByBrand(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
      select: {
        total: true,
        totalFinal: true,
        items: { select: { qty: true, subtotal: true, product: { select: { brand: true } } } },
      },
    });
    const grouped = new Map<string, { brand: string; total: number; qty: number }>();
    for (const sale of sales) {
      const subtotal = Number(sale.total);
      const discountFactor = subtotal > 0 ? Number(sale.totalFinal) / subtotal : 1;
      for (const item of sale.items) {
        const brand = item.product?.brand?.trim() || 'Sin marca';
        const row = grouped.get(brand) ?? { brand, total: 0, qty: 0 };
        row.total += Number(item.subtotal) * discountFactor;
        row.qty += item.qty;
        grouped.set(brand, row);
      }
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }

  async averageTicket(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const result = await this.prisma.sale.aggregate({
      where: { businessId, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
      _sum: { totalFinal: true },
      _count: { _all: true },
    });
    const total = Number(result._sum.totalFinal ?? 0);
    const count = result._count._all;
    return { avg: count ? total / count : 0, count, total };
  }

  async salesComparison(businessId: string) {
    const nowAr = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const year = nowAr.getUTCFullYear();
    const month = nowAr.getUTCMonth();
    const currentFrom = new Date(Date.UTC(year, month, 1, 3));
    const previousFrom = new Date(Date.UTC(year, month - 1, 1, 3));
    const previousTo = new Date(currentFrom.getTime() - 1);
    const [currentAgg, previousAgg] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { businessId, status: 'completed', createdAt: { gte: currentFrom, lte: new Date() } },
        _sum: { totalFinal: true },
        _count: { _all: true },
      }),
      this.prisma.sale.aggregate({
        where: { businessId, status: 'completed', createdAt: { gte: previousFrom, lte: previousTo } },
        _sum: { totalFinal: true },
        _count: { _all: true },
      }),
    ]);
    const current = { total: Number(currentAgg._sum.totalFinal ?? 0), count: currentAgg._count._all };
    const previous = { total: Number(previousAgg._sum.totalFinal ?? 0), count: previousAgg._count._all };
    const deltaPct = previous.total ? ((current.total - previous.total) / previous.total) * 100 : current.total ? 100 : 0;
    return { current, previous, deltaPct };
  }

  async deadStock(businessId: string, days = 30) {
    const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(Math.floor(days), 3650)) : 30;
    const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const products = await this.prisma.product.findMany({
      where: { businessId, isActive: true, stock: { gt: 0 } },
      select: {
        id: true,
        name: true,
        stock: true,
        saleItems: {
          where: { sale: { businessId, status: 'completed' } },
          orderBy: { sale: { createdAt: 'desc' } },
          take: 1,
          select: { sale: { select: { createdAt: true } } },
        },
      },
    });
    return products
      .flatMap((product) => {
        const lastSaleAt = product.saleItems[0]?.sale.createdAt ?? null;
        if (lastSaleAt && lastSaleAt >= cutoff) return [];
        return [{
          id: product.id,
          name: product.name,
          stock: product.stock,
          lastSaleAt,
          // Sin venta histórica no existe una fecha desde la cual calcular antigüedad.
          daysSinceSale: lastSaleAt ? Math.floor((Date.now() - lastSaleAt.getTime()) / 86400000) : null,
        }];
      })
      .sort((a, b) => (b.daysSinceSale ?? Number.MAX_SAFE_INTEGER) - (a.daysSinceSale ?? Number.MAX_SAFE_INTEGER));
  }

  async stockOuts(businessId: string) {
    return this.prisma.product.findMany({
      where: { businessId, isActive: true, stockControl: true, stock: { lte: 0 } },
      select: { id: true, name: true, minStock: true },
      orderBy: { name: 'asc' },
    });
  }

  async inventoryValuation(businessId: string) {
    const summary = await this.stockSummary(businessId);
    return {
      atCost: summary.valueAtCostProduct,
      atSale: summary.valueAtSale,
      potentialMargin: summary.potentialMargin,
      units: summary.totalUnits,
    };
  }

  async topCustomers(businessId: string, period: ReportPeriod = 'month', limit = 10, from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        status: 'completed',
        customerId: { not: null },
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { customerId: true, totalFinal: true, customer: { select: { name: true } } },
    });
    const grouped = new Map<string, { customerId: string; name: string; total: number; count: number }>();
    for (const sale of sales) {
      if (!sale.customerId || !sale.customer) continue;
      const row = grouped.get(sale.customerId) ?? { customerId: sale.customerId, name: sale.customer.name, total: 0, count: 0 };
      row.total += Number(sale.totalFinal);
      row.count += 1;
      grouped.set(sale.customerId, row);
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total).slice(0, Math.max(1, Math.min(limit, 200)));
  }

  async fiadoAging(businessId: string) {
    // Customer no guarda fecha de origen del saldo; por eso no se inventan buckets de antigüedad.
    const customers = await this.prisma.customer.findMany({
      where: { businessId, balance: { gt: 0 } },
      select: { id: true, name: true, balance: true },
      orderBy: { balance: 'desc' },
    });
    return customers.map((customer) => ({ customerId: customer.id, name: customer.name, balance: Number(customer.balance) }));
  }

  async purchasesBySupplier(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const purchases = await this.prisma.purchase.findMany({
      where: { businessId, createdAt: { gte: range.from, lte: range.to } },
      select: { supplierId: true, total: true, supplier: { select: { name: true } } },
    });
    const grouped = new Map<string, { supplierId: string | null; supplierName: string; total: number; count: number }>();
    for (const purchase of purchases) {
      const key = purchase.supplierId ?? '__without_supplier__';
      const row = grouped.get(key) ?? {
        supplierId: purchase.supplierId,
        supplierName: purchase.supplier?.name ?? 'Sin proveedor',
        total: 0,
        count: 0,
      };
      row.total += Number(purchase.total);
      row.count += 1;
      grouped.set(key, row);
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }

  async expensesByCategory(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const registers = await this.prisma.cashRegister.findMany({ where: { businessId }, select: { id: true } });
    if (!registers.length) return [];
    const movements = await this.prisma.cashMovement.findMany({
      where: {
        cashRegisterId: { in: registers.map((register) => register.id) },
        type: 'expense',
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { category: true, amount: true },
    });
    const grouped = new Map<string, { category: string; total: number; count: number }>();
    for (const movement of movements) {
      const category = movement.category?.trim() || 'Sin categoría';
      const row = grouped.get(category) ?? { category, total: 0, count: 0 };
      row.total += Number(movement.amount);
      row.count += 1;
      grouped.set(category, row);
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }

  async grossMargin(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
      select: {
        total: true,
        totalFinal: true,
        items: { select: { qty: true, subtotal: true, product: { select: { cost: true } } } },
      },
    });
    let revenue = 0;
    let cogs = 0;
    for (const sale of sales) {
      const subtotal = Number(sale.total);
      const discountFactor = subtotal > 0 ? Number(sale.totalFinal) / subtotal : 1;
      for (const item of sale.items) {
        revenue += Number(item.subtotal) * discountFactor;
        cogs += Number(item.product?.cost ?? 0) * item.qty;
      }
    }
    const grossMargin = revenue - cogs;
    return { revenue, cogs, grossMargin, marginPct: revenue ? (grossMargin / revenue) * 100 : 0 };
  }

  async fiscalSummary(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
      select: { totalFinal: true, fiscalDocument: { select: { kind: true } } },
    });
    const result = { facturaC: { count: 0, total: 0 }, internal: { count: 0, total: 0 } };
    for (const sale of sales) {
      const bucket = sale.fiscalDocument?.kind === 'FACTURA_C' ? result.facturaC : result.internal;
      bucket.count += 1;
      bucket.total += Number(sale.totalFinal);
    }
    return result;
  }

  async cashSessions(businessId: string, period: ReportPeriod = 'month', from?: Date, to?: Date) {
    const range = this.getDateRange(period, from, to);
    const sessions = await this.prisma.cashRegister.findMany({
      where: { businessId, openedAt: { gte: range.from, lte: range.to } },
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        openingCash: true,
        openingBank: true,
        closingCash: true,
        closingBank: true,
      },
      orderBy: { openedAt: 'desc' },
    });
    return sessions.map((session) => ({
      id: session.id,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      opening: Number(session.openingCash) + Number(session.openingBank),
      counted: session.closingCash == null && session.closingBank == null
        ? null
        : Number(session.closingCash ?? 0) + Number(session.closingBank ?? 0),
      // El modelo no persiste efectivo esperado ni diferencia de arqueo.
      expected: null,
      difference: null,
    }));
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
