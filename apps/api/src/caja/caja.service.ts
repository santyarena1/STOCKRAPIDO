import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CajaService {
  constructor(private prisma: PrismaService) {}

  async getOpen(businessId: string, userId: string) {
    return this.prisma.cashRegister.findFirst({
      where: { businessId, closedAt: null },
      include: { movements: true },
      orderBy: { openedAt: 'desc' },
    });
  }

  async open(businessId: string, userId: string, openingCash: number, notes?: string) {
    const existing = await this.getOpen(businessId, userId);
    if (existing) throw new BadRequestException('Ya hay una caja abierta');
    return this.prisma.cashRegister.create({
      data: {
        businessId,
        userId,
        openingCash: new Decimal(openingCash),
        notes,
      },
    });
  }

  async addMovement(
    businessId: string,
    cashRegisterId: string,
    type: 'income' | 'expense',
    amount: number,
    category?: string,
    note?: string,
    reference?: string,
  ) {
    const reg = await this.prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, businessId, closedAt: null },
    });
    if (!reg) throw new BadRequestException('Caja no encontrada o cerrada');
    return this.prisma.cashMovement.create({
      data: {
        cashRegisterId,
        type,
        amount: new Decimal(amount),
        category,
        note,
        reference,
      },
    });
  }

  async close(
    businessId: string,
    cashRegisterId: string,
    counts: { method: string; expected: number; actual: number }[],
  ) {
    const reg = await this.prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, businessId, closedAt: null },
      include: { movements: true, sales: true },
    });
    if (!reg) throw new BadRequestException('Caja no encontrada o ya cerrada');

    const salesTotal = reg.sales.reduce((s, v) => s + Number(v.totalFinal), 0);
    const incomeMov = reg.movements.filter((m) => m.type === 'income').reduce((s, m) => s + Number(m.amount), 0);
    const expenseMov = reg.movements.filter((m) => m.type === 'expense').reduce((s, m) => s + Number(m.amount), 0);
    const expectedCash = Number(reg.openingCash) + salesTotal + incomeMov - expenseMov;

    const actualTotal = counts.reduce((s, c) => s + c.actual, 0);
    const closingCash = new Decimal(actualTotal);

    await this.prisma.cashRegister.update({
      where: { id: cashRegisterId },
      data: { closedAt: new Date(), closingCash },
    });
    return {
      cashRegister: await this.prisma.cashRegister.findUnique({ where: { id: cashRegisterId } }),
      summary: {
        openingCash: Number(reg.openingCash),
        salesTotal,
        incomeMov,
        expenseMov,
        expectedCash,
        actualTotal,
        difference: actualTotal - expectedCash,
        counts,
      },
    };
  }

  async list(businessId: string, from?: Date, to?: Date, limit = 30) {
    const where: Record<string, unknown> = { businessId };
    if (from || to) {
      where.openedAt = {};
      if (from) (where.openedAt as Record<string, Date>).gte = from;
      if (to) (where.openedAt as Record<string, Date>).lte = to;
    }
    return this.prisma.cashRegister.findMany({
      where,
      take: limit,
      orderBy: { openedAt: 'desc' },
      include: { movements: true },
    });
  }
}
