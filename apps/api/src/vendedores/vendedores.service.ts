import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type VendedorStatsPeriod = 'today' | 'week' | 'month' | 'year';

@Injectable()
export class VendedoresService {
  constructor(private prisma: PrismaService) {}

  list(businessId: string) {
    return this.prisma.vendedor.findMany({
      where: { businessId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  create(businessId: string, rawName?: string) {
    const name = rawName?.trim();
    if (!name) throw new BadRequestException('El nombre del vendedor es obligatorio.');
    return this.prisma.vendedor.create({ data: { businessId, name } });
  }

  async update(businessId: string, id: string, data: { name?: string; active?: boolean }) {
    const vendedor = await this.findOwned(businessId, id);
    const name = data.name === undefined ? undefined : data.name.trim();
    if (data.name !== undefined && !name) throw new BadRequestException('El nombre del vendedor es obligatorio.');
    if (data.active === false) {
      await this.prisma.vendedorSession.updateMany({
        where: { businessId, vendedorId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
    }
    return this.prisma.vendedor.update({
      where: { id: vendedor.id },
      data: { ...(name !== undefined && { name }), ...(data.active !== undefined && { active: data.active }) },
    });
  }

  async remove(businessId: string, id: string) {
    const vendedor = await this.findOwned(businessId, id);
    const sales = await this.prisma.sale.count({ where: { businessId, sellerId: id } });
    if (sales > 0) return this.update(businessId, id, { active: false });
    try {
      return await this.prisma.vendedor.delete({ where: { id: vendedor.id } });
    } catch {
      return this.update(businessId, id, { active: false });
    }
  }

  async setActive(businessId: string, vendedorId?: string) {
    if (!vendedorId) throw new BadRequestException('Elegí un vendedor.');
    const vendedor = await this.prisma.vendedor.findFirst({ where: { id: vendedorId, businessId, active: true } });
    if (!vendedor) throw new BadRequestException('Vendedor inexistente o inactivo.');
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.vendedorSession.updateMany({ where: { businessId, endedAt: null }, data: { endedAt: now } });
      await tx.vendedorSession.create({ data: { businessId, vendedorId, startedAt: now } });
    });
    return vendedor;
  }

  async active(businessId: string) {
    const session = await this.prisma.vendedorSession.findFirst({
      where: { businessId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: { vendedor: true },
    });
    return session?.vendedor ?? null;
  }

  async stats(businessId: string, period: VendedorStatsPeriod = 'month', from?: Date, to?: Date) {
    const range = this.dateRange(period, from, to);
    const [vendedores, sales, sessions] = await Promise.all([
      this.prisma.vendedor.findMany({ where: { businessId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      this.prisma.sale.findMany({
        where: { businessId, sellerId: { not: null }, status: 'completed', createdAt: { gte: range.from, lte: range.to } },
        select: { sellerId: true, totalFinal: true, items: { select: { qty: true } } },
      }),
      this.prisma.vendedorSession.findMany({
        where: {
          businessId,
          startedAt: { lte: range.to },
          OR: [{ endedAt: null }, { endedAt: { gte: range.from } }],
        },
        select: { vendedorId: true, startedAt: true, endedAt: true },
      }),
    ]);
    const now = new Date();
    return vendedores.map((vendedor) => {
      const ownSales = sales.filter((sale) => sale.sellerId === vendedor.id);
      const workedMs = sessions.filter((session) => session.vendedorId === vendedor.id).reduce((sum, session) => {
        const start = Math.max(session.startedAt.getTime(), range.from.getTime());
        const end = Math.min((session.endedAt ?? now).getTime(), range.to.getTime());
        return sum + Math.max(0, end - start);
      }, 0);
      return {
        id: vendedor.id,
        name: vendedor.name,
        salesCount: ownSales.length,
        salesTotal: ownSales.reduce((sum, sale) => sum + Number(sale.totalFinal), 0),
        unitsSold: ownSales.reduce((sum, sale) => sum + sale.items.reduce((qty, item) => qty + item.qty, 0), 0),
        hoursWorked: Math.round((workedMs / 3600000) * 100) / 100,
      };
    });
  }

  private async findOwned(businessId: string, id: string) {
    const vendedor = await this.prisma.vendedor.findFirst({ where: { id, businessId } });
    if (!vendedor) throw new NotFoundException('Vendedor no encontrado.');
    return vendedor;
  }

  private dateRange(period: VendedorStatsPeriod, from?: Date, to?: Date) {
    if (from || to) return { from: from ?? new Date(0), to: to ?? new Date() };
    const now = new Date();
    const ar = new Date(now.getTime() - 3 * 3600000);
    let year = ar.getUTCFullYear(); let month = ar.getUTCMonth(); let day = ar.getUTCDate();
    if (period === 'week') { const start = new Date(Date.UTC(year, month, day - 6)); year = start.getUTCFullYear(); month = start.getUTCMonth(); day = start.getUTCDate(); }
    else if (period === 'month') day = 1;
    else if (period === 'year') { month = 0; day = 1; }
    return { from: new Date(Date.UTC(year, month, day, 3)), to: now };
  }
}
