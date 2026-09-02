import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPlan } from './plans';
import { generateReferralCode, normalizeReferralCode } from './referral.util';
import {
  argentinaYearMonth,
  computeSellerCommission,
  isSellerCommissionType,
  monthLabel,
  type SellerCommissionType,
} from './sellers.util';

type DbClient = PrismaService | Prisma.TransactionClient;

export type SellerUpsertInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  code?: string | null;
  active?: boolean;
  commissionType: SellerCommissionType;
  commissionValue: number;
};

@Injectable()
export class PlatformSellersService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.platformSeller.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { attributions: true, ledger: true } },
        ledger: { select: { amount: true } },
      },
    });
    return rows.map((s) => this.serializeSeller(s, sumAmounts(s.ledger)));
  }

  async get(id: string) {
    const seller = await this.prisma.platformSeller.findUnique({
      where: { id },
      include: {
        attributions: {
          orderBy: { createdAt: 'desc' },
          include: {
            business: { select: { id: true, name: true, planId: true, planStatus: true } },
          },
        },
        ledger: { orderBy: { createdAt: 'desc' }, take: 200 },
      },
    });
    if (!seller) throw new NotFoundException('Vendedor no encontrado');
    const allLedger = await this.prisma.platformSellerLedgerEntry.findMany({
      where: { sellerId: id },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { createdAt: 'asc' }],
    });
    const balance = sumAmounts(allLedger);
    const months: Array<{
      year: number;
      month: number;
      label: string;
      commissions: number;
      payments: number;
      adjustments: number;
      net: number;
      running: number;
    }> = [];
    let running = 0;
    const grouped = new Map<string, typeof allLedger>();
    for (const row of allLedger) {
      const key = `${row.periodYear}-${row.periodMonth}`;
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    }
    for (const [key, rows] of grouped) {
      const [year, month] = key.split('-').map(Number);
      const commissions = sumAmounts(rows.filter((r) => r.type === 'commission'));
      const payments = sumAmounts(rows.filter((r) => r.type === 'payment'));
      const adjustments = sumAmounts(rows.filter((r) => r.type === 'adjustment'));
      const net = commissions + payments + adjustments;
      running += net;
      months.push({
        year,
        month,
        label: monthLabel(year, month),
        commissions,
        payments,
        adjustments,
        net,
        running,
      });
    }
    months.reverse();
    return {
      ...this.serializeSeller(seller, balance),
      attributions: seller.attributions.map((a) => ({
        id: a.id,
        businessId: a.business.id,
        businessName: a.business.name,
        planName: getPlan(a.business.planId).name,
        planStatus: a.business.planStatus,
        code: a.code,
        createdAt: a.createdAt,
      })),
      months,
      ledger: seller.ledger.map((e) => this.serializeLedger(e)),
    };
  }

  async create(dto: SellerUpsertInput) {
    const commissionType = this.parseType(dto.commissionType);
    const commissionValue = this.parseValue(commissionType, dto.commissionValue);
    const code = await this.allocateCode(dto.code);
    const seller = await this.prisma.platformSeller.create({
      data: {
        name: dto.name.trim(),
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
        code,
        active: dto.active !== false,
        commissionType,
        commissionValue,
      },
    });
    return this.serializeSeller(seller, 0);
  }

  async update(id: string, dto: Partial<SellerUpsertInput>) {
    const current = await this.prisma.platformSeller.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vendedor no encontrado');
    const commissionType = dto.commissionType
      ? this.parseType(dto.commissionType)
      : isSellerCommissionType(current.commissionType)
        ? current.commissionType
        : 'percent';
    const commissionValue =
      dto.commissionValue !== undefined
        ? this.parseValue(commissionType, dto.commissionValue)
        : Number(current.commissionValue);
    let code = current.code;
    if (dto.code != null && dto.code.trim() && normalizeReferralCode(dto.code) !== current.code) {
      code = await this.allocateCode(dto.code, id);
    }
    const seller = await this.prisma.platformSeller.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        code,
        commissionType,
        commissionValue,
      },
    });
    const agg = await this.prisma.platformSellerLedgerEntry.aggregate({
      where: { sellerId: id },
      _sum: { amount: true },
    });
    return this.serializeSeller(seller, Number(agg._sum.amount || 0));
  }

  async lookup(rawCode: string) {
    const code = normalizeReferralCode(rawCode);
    if (!code) return null;
    return this.prisma.platformSeller.findFirst({
      where: { code },
      select: { id: true, name: true, code: true, active: true },
    });
  }

  /** Si el código es de vendedor, atribuye el local. Si no, false para que siga el referido entre locales. */
  async tryAttribute(businessId: string, rawCode: string, db: DbClient = this.prisma): Promise<boolean> {
    const code = normalizeReferralCode(rawCode);
    if (!code) throw new BadRequestException('Código de referido inválido.');
    const seller = await db.platformSeller.findFirst({ where: { code } });
    if (!seller) return false;
    if (!seller.active) throw new BadRequestException('Ese código de vendedor ya no está activo.');
    const already = await db.platformSellerAttribution.findUnique({
      where: { businessId },
      select: { id: true },
    });
    if (already) throw new BadRequestException('Este local ya está atribuido a un vendedor.');
    await db.platformSellerAttribution.create({
      data: { sellerId: seller.id, businessId, code },
    });
    return true;
  }

  async assignBusiness(sellerId: string, businessId: string) {
    const seller = await this.prisma.platformSeller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new NotFoundException('Vendedor no encontrado');
    if (!seller.active) throw new BadRequestException('El vendedor está inactivo.');
    const business = await this.prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true } });
    if (!business) throw new NotFoundException('Cuenta no encontrada');
    const existing = await this.prisma.platformSellerAttribution.findUnique({ where: { businessId } });
    if (existing) throw new BadRequestException('Ese local ya está atribuido a un vendedor.');
    await this.prisma.platformSellerAttribution.create({
      data: { sellerId, businessId, code: seller.code },
    });
    return this.get(sellerId);
  }

  async accrueForPaidInvoice(invoice: {
    id: string;
    businessId: string;
    planId: string;
    cycle: string;
    amount: Prisma.Decimal | { toString(): string } | number;
    paidAt: Date | null;
  }) {
    const attribution = await this.prisma.platformSellerAttribution.findUnique({
      where: { businessId: invoice.businessId },
      include: { seller: true, business: { select: { name: true } } },
    });
    if (!attribution || !attribution.seller.active) return;
    const existing = await this.prisma.platformSellerLedgerEntry.findUnique({
      where: { invoiceId: invoice.id },
      select: { id: true },
    });
    if (existing) return;

    const type = isSellerCommissionType(attribution.seller.commissionType)
      ? attribution.seller.commissionType
      : 'percent';
    if (type === 'fixed') {
      const prior = await this.prisma.platformSellerLedgerEntry.findFirst({
        where: {
          sellerId: attribution.sellerId,
          businessId: invoice.businessId,
          type: 'commission',
        },
        select: { id: true },
      });
      if (prior) return;
    }

    const sold = Number(invoice.amount);
    const amount = computeSellerCommission(type, Number(attribution.seller.commissionValue), sold);
    if (amount <= 0) return;
    const when = invoice.paidAt || new Date();
    const { year, month } = argentinaYearMonth(when);
    const planName = getPlan(invoice.planId).name;
    const cycle = invoice.cycle === 'yearly' ? 'anual' : 'mensual';
    const how =
      type === 'percent'
        ? `${Number(attribution.seller.commissionValue)}% de $${sold.toLocaleString('es-AR')}`
        : `fijo $${amount.toLocaleString('es-AR')} por programa vendido`;
    await this.prisma.platformSellerLedgerEntry.create({
      data: {
        sellerId: attribution.sellerId,
        businessId: invoice.businessId,
        invoiceId: invoice.id,
        type: 'commission',
        amount,
        description: `Comisión ${how} · ${attribution.business.name} · ${planName} ${cycle}`,
        periodYear: year,
        periodMonth: month,
      },
    });
  }

  async addLedger(
    sellerId: string,
    dto: { type: 'payment' | 'adjustment'; amount: number; description?: string; year?: number; month?: number },
    createdById?: string,
  ) {
    const seller = await this.prisma.platformSeller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new NotFoundException('Vendedor no encontrado');
    const raw = Number(dto.amount);
    if (!Number.isFinite(raw) || raw === 0) throw new BadRequestException('Ingresá un monto distinto de cero.');
    const now = new Date();
    const fallback = argentinaYearMonth(now);
    const year = dto.year || fallback.year;
    const month = dto.month || fallback.month;
    if (month < 1 || month > 12) throw new BadRequestException('Mes inválido.');
    const amount = dto.type === 'payment' ? -Math.abs(raw) : raw;
    const description =
      dto.description?.trim() ||
      (dto.type === 'payment' ? `Pago a ${seller.name}` : 'Ajuste de cuenta corriente');
    await this.prisma.platformSellerLedgerEntry.create({
      data: {
        sellerId,
        type: dto.type,
        amount,
        description,
        periodYear: year,
        periodMonth: month,
        createdById: createdById || null,
      },
    });
    return this.get(sellerId);
  }

  async totals() {
    const [count, active, ledger] = await Promise.all([
      this.prisma.platformSeller.count(),
      this.prisma.platformSeller.count({ where: { active: true } }),
      this.prisma.platformSellerLedgerEntry.aggregate({ _sum: { amount: true } }),
    ]);
    return {
      sellers: count,
      active,
      balance: Number(ledger._sum.amount || 0),
    };
  }

  private serializeSeller(
    s: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      notes: string | null;
      code: string;
      active: boolean;
      commissionType: string;
      commissionValue: Prisma.Decimal | { toString(): string } | number;
      createdAt: Date;
      _count?: { attributions: number; ledger?: number };
    },
    balance: number,
  ) {
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      notes: s.notes,
      code: s.code,
      active: s.active,
      commissionType: s.commissionType,
      commissionValue: Number(s.commissionValue),
      createdAt: s.createdAt,
      attributionsCount: s._count?.attributions ?? 0,
      balance,
    };
  }

  private serializeLedger(e: {
    id: string;
    type: string;
    amount: Prisma.Decimal | { toString(): string } | number;
    description: string | null;
    businessId: string | null;
    invoiceId: string | null;
    periodYear: number;
    periodMonth: number;
    createdAt: Date;
  }) {
    return {
      id: e.id,
      type: e.type,
      amount: Number(e.amount),
      description: e.description,
      businessId: e.businessId,
      invoiceId: e.invoiceId,
      periodYear: e.periodYear,
      periodMonth: e.periodMonth,
      periodLabel: monthLabel(e.periodYear, e.periodMonth),
      createdAt: e.createdAt,
    };
  }

  private parseType(value: unknown): SellerCommissionType {
    if (!isSellerCommissionType(value)) throw new BadRequestException('Elegí comisión por porcentaje o monto fijo.');
    return value;
  }

  private parseValue(type: SellerCommissionType, raw: number) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new BadRequestException('El valor de comisión no es válido.');
    if (type === 'percent' && value > 100) throw new BadRequestException('El porcentaje no puede superar 100.');
    return value;
  }

  private async allocateCode(raw?: string | null, exceptId?: string): Promise<string> {
    const wanted = raw?.trim() ? normalizeReferralCode(raw) : null;
    if (raw?.trim() && !wanted) throw new BadRequestException('El código tiene que tener entre 4 y 16 letras o números.');
    const tryCode = async (code: string) => {
      const [seller, business] = await Promise.all([
        this.prisma.platformSeller.findFirst({
          where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) },
          select: { id: true },
        }),
        this.prisma.business.findFirst({ where: { referralCode: code }, select: { id: true } }),
      ]);
      return !seller && !business;
    };
    if (wanted) {
      if (!(await tryCode(wanted))) throw new BadRequestException('Ese código ya está en uso.');
      return wanted;
    }
    for (let i = 0; i < 16; i++) {
      const code = generateReferralCode();
      if (await tryCode(code)) return code;
    }
    throw new BadRequestException('No se pudo generar un código. Reintentá.');
  }
}

function sumAmounts(rows: Array<{ amount: Prisma.Decimal | { toString(): string } | number }>): number {
  return rows.reduce((n, r) => n + Number(r.amount), 0);
}
