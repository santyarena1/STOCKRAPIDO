import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { movementChannel, MovChannel, saleChannel } from './caja-channels.util';

type RegisterWithRelations = {
  openingCash: Decimal;
  openingBank: Decimal;
  movements: { type: string; amount: Decimal; category: string | null }[];
  sales: { totalFinal: Decimal; paymentMethod: string | null }[];
};

@Injectable()
export class CajaService {
  constructor(private prisma: PrismaService) {}

  computeExpected(reg: RegisterWithRelations) {
    let salesEfectivo = 0;
    let salesBanco = 0;
    for (const s of reg.sales) {
      const ch = saleChannel(s.paymentMethod);
      const t = Number(s.totalFinal);
      if (ch === 'efectivo') salesEfectivo += t;
      else if (ch === 'banco') salesBanco += t;
    }
    let movEfectivoIncome = 0;
    let movEfectivoExpense = 0;
    let movBancoIncome = 0;
    let movBancoExpense = 0;
    for (const m of reg.movements) {
      const ch = movementChannel(m.category);
      const amt = Number(m.amount);
      if (m.type === 'income') {
        if (ch === 'efectivo') movEfectivoIncome += amt;
        else movBancoIncome += amt;
      } else {
        if (ch === 'efectivo') movEfectivoExpense += amt;
        else movBancoExpense += amt;
      }
    }
    const openingEfectivo = Number(reg.openingCash);
    const openingBanco = Number(reg.openingBank ?? 0);
    const expectedEfectivo =
      openingEfectivo + salesEfectivo + movEfectivoIncome - movEfectivoExpense;
    const expectedBanco = openingBanco + salesBanco + movBancoIncome - movBancoExpense;
    return {
      openingEfectivo,
      openingBanco,
      salesEfectivo,
      salesBanco,
      movEfectivoIncome,
      movEfectivoExpense,
      movBancoIncome,
      movBancoExpense,
      expectedEfectivo,
      expectedBanco,
    };
  }

  async getOpen(businessId: string, userId: string) {
    const reg = await this.prisma.cashRegister.findFirst({
      where: { businessId, closedAt: null },
      include: { movements: true, sales: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!reg) return null;
    const preview = this.computeExpected(reg);
    return { ...reg, preview };
  }

  async open(
    businessId: string,
    userId: string,
    openingCash: number,
    notes?: string,
    openingBank?: number,
  ) {
    const existing = await this.prisma.cashRegister.findFirst({
      where: { businessId, closedAt: null },
    });
    if (existing) throw new BadRequestException('Ya hay una caja abierta');
    const bank = openingBank != null && !Number.isNaN(openingBank) ? openingBank : 0;
    return this.prisma.cashRegister.create({
      data: {
        businessId,
        userId,
        openingCash: new Decimal(openingCash),
        openingBank: new Decimal(bank),
        notes,
      },
    });
  }

  async addMovement(
    businessId: string,
    cashRegisterId: string,
    type: 'income' | 'expense',
    amount: number,
    channel: MovChannel,
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
        category: channel,
        note,
        reference,
      },
    });
  }

  async close(
    businessId: string,
    cashRegisterId: string,
    counts: { channel: MovChannel; actual: number }[],
  ) {
    const reg = await this.prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, businessId, closedAt: null },
      include: { movements: true, sales: true },
    });
    if (!reg) throw new BadRequestException('Caja no encontrada o ya cerrada');

    const actualEfectivo = counts.find((c) => c.channel === 'efectivo')?.actual;
    const actualBanco = counts.find((c) => c.channel === 'banco')?.actual;
    if (actualEfectivo === undefined || actualBanco === undefined) {
      throw new BadRequestException('Debés informar el monto contado de efectivo y de banco/electrónicos.');
    }

    const preview = this.computeExpected(reg);
    const diffEfectivo = actualEfectivo - preview.expectedEfectivo;
    const diffBanco = actualBanco - preview.expectedBanco;

    await this.prisma.cashRegister.update({
      where: { id: cashRegisterId },
      data: {
        closedAt: new Date(),
        closingCash: new Decimal(actualEfectivo),
        closingBank: new Decimal(actualBanco),
      },
    });
    return {
      cashRegister: await this.prisma.cashRegister.findUnique({ where: { id: cashRegisterId } }),
      summary: {
        ...preview,
        actualEfectivo,
        actualBanco,
        differenceEfectivo: diffEfectivo,
        differenceBanco: diffBanco,
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
