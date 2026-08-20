import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';

export type CommissionBase = 'cost' | 'sale';

function normalizeCommissionBase(value: unknown): CommissionBase {
  return value === 'sale' ? 'sale' : 'cost';
}

@Injectable()
export class ConsignmentService {
  constructor(private prisma: PrismaService) {}

  private toNum(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  /** Monto adeudado por unidad: base + % de la base (costo o venta). */
  computeUnitAmount(unitBase: number, commissionPercent: number) {
    const base = Math.max(0, unitBase);
    const pct = Math.max(0, commissionPercent);
    return base + (base * pct) / 100;
  }

  async listParties(businessId: string) {
    const parties = await this.prisma.consignmentParty.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true } },
        products: { where: { consigned: true }, select: { id: true } },
      },
    });
    const balances = await Promise.all(parties.map((p) => this.balanceFor(businessId, p.id)));
    return parties.map((party, i) => ({
      id: party.id,
      name: party.name,
      notes: party.notes,
      defaultCommissionPercent: this.toNum(party.defaultCommissionPercent),
      commissionBase: normalizeCommissionBase(party.commissionBase),
      active: party.active,
      productCount: party._count.products,
      balance: balances[i],
      createdAt: party.createdAt,
    }));
  }

  async createParty(
    businessId: string,
    data: {
      name: string;
      notes?: string;
      defaultCommissionPercent?: number;
      commissionBase?: CommissionBase;
    },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    const pct = data.defaultCommissionPercent ?? 0;
    if (!Number.isFinite(pct) || pct < 0) throw new BadRequestException('% inválido.');
    const commissionBase = normalizeCommissionBase(data.commissionBase);
    return this.prisma.consignmentParty.create({
      data: {
        businessId,
        name,
        notes: data.notes?.trim() || null,
        defaultCommissionPercent: new Decimal(pct),
        commissionBase,
      },
    });
  }

  async updateParty(
    id: string,
    businessId: string,
    data: Partial<{
      name: string;
      notes: string | null;
      defaultCommissionPercent: number;
      commissionBase: CommissionBase;
      active: boolean;
    }>,
  ) {
    const existing = await this.prisma.consignmentParty.findFirst({ where: { id, businessId } });
    if (!existing) throw new NotFoundException('Entidad no encontrada');
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('El nombre es obligatorio.');
      patch.name = name;
    }
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
    if (data.defaultCommissionPercent !== undefined) {
      if (!Number.isFinite(data.defaultCommissionPercent) || data.defaultCommissionPercent < 0) {
        throw new BadRequestException('% inválido.');
      }
      patch.defaultCommissionPercent = new Decimal(data.defaultCommissionPercent);
    }
    if (data.commissionBase !== undefined) {
      patch.commissionBase = normalizeCommissionBase(data.commissionBase);
    }
    if (data.active !== undefined) patch.active = Boolean(data.active);
    return this.prisma.consignmentParty.update({ where: { id }, data: patch });
  }

  async getParty(id: string, businessId: string) {
    const party = await this.prisma.consignmentParty.findFirst({
      where: { id, businessId },
      include: {
        products: {
          where: { consigned: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            barcode: true,
            cost: true,
            price: true,
            stock: true,
            imageUrl: true,
            consignmentCommissionPercent: true,
          },
        },
      },
    });
    if (!party) throw new NotFoundException('Entidad no encontrada');
    const balance = await this.balanceFor(businessId, id);
    const commissionBase = normalizeCommissionBase(party.commissionBase);
    const [ledger, payments] = await Promise.all([
      this.prisma.consignmentLedgerEntry.findMany({
        where: { businessId, partyId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { product: { select: { id: true, name: true } } },
      }),
      this.prisma.consignmentPayment.findMany({
        where: { businessId, partyId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      id: party.id,
      name: party.name,
      notes: party.notes,
      defaultCommissionPercent: this.toNum(party.defaultCommissionPercent),
      commissionBase,
      active: party.active,
      balance,
      products: party.products.map((p) => ({
        ...p,
        cost: p.cost == null ? null : this.toNum(p.cost),
        price: this.toNum(p.price),
        consignmentCommissionPercent:
          p.consignmentCommissionPercent == null ? null : this.toNum(p.consignmentCommissionPercent),
        effectiveCommissionPercent:
          p.consignmentCommissionPercent == null
            ? this.toNum(party.defaultCommissionPercent)
            : this.toNum(p.consignmentCommissionPercent),
      })),
      ledger: ledger.map((e) => ({
        id: e.id,
        productId: e.productId,
        productName: e.product?.name ?? null,
        saleId: e.saleId,
        qty: e.qty,
        unitCost: this.toNum(e.unitCost),
        commissionPercent: this.toNum(e.commissionPercent),
        amount: this.toNum(e.amount),
        note: e.note,
        voided: e.voided,
        createdAt: e.createdAt,
        commissionBase,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: this.toNum(p.amount),
        note: p.note,
        createdAt: p.createdAt,
      })),
    };
  }

  async balanceFor(businessId: string, partyId: string) {
    const [debt, paid] = await Promise.all([
      this.prisma.consignmentLedgerEntry.aggregate({
        where: { businessId, partyId, voided: false },
        _sum: { amount: true },
      }),
      this.prisma.consignmentPayment.aggregate({
        where: { businessId, partyId },
        _sum: { amount: true },
      }),
    ]);
    return this.toNum(debt._sum.amount) - this.toNum(paid._sum.amount);
  }

  async addPayment(partyId: string, businessId: string, amount: number, note?: string) {
    const party = await this.prisma.consignmentParty.findFirst({ where: { id: partyId, businessId } });
    if (!party) throw new NotFoundException('Entidad no encontrada');
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Monto inválido.');
    return this.prisma.consignmentPayment.create({
      data: {
        businessId,
        partyId,
        amount: new Decimal(amount),
        note: note?.trim() || null,
      },
    });
  }

  async assignProduct(
    businessId: string,
    productId: string,
    data: { consigned: boolean; consignmentPartyId?: string | null; consignmentCommissionPercent?: number | null },
  ) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (!data.consigned) {
      return this.prisma.product.update({
        where: { id: productId },
        data: {
          consigned: false,
          consignmentPartyId: null,
          consignmentCommissionPercent: null,
        },
        include: { category: true, consignmentParty: true },
      });
    }

    let partyId = data.consignmentPartyId?.trim() || null;
    if (!partyId) {
      const parties = await this.prisma.consignmentParty.findMany({
        where: { businessId, active: true },
        orderBy: { name: 'asc' },
        take: 2,
      });
      if (parties.length === 1) partyId = parties[0].id;
      else if (parties.length === 0) {
        throw new BadRequestException('Primero creá una entidad en Comisionados.');
      } else {
        throw new BadRequestException('Elegí a quién asociar el producto comisionado.');
      }
    } else {
      const party = await this.prisma.consignmentParty.findFirst({
        where: { id: partyId, businessId, active: true },
      });
      if (!party) throw new BadRequestException('Entidad inválida.');
    }

    const pct =
      data.consignmentCommissionPercent === undefined
        ? undefined
        : data.consignmentCommissionPercent === null
          ? null
          : new Decimal(data.consignmentCommissionPercent);

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        consigned: true,
        consignmentPartyId: partyId,
        ...(pct !== undefined ? { consignmentCommissionPercent: pct } : {}),
      },
      include: { category: true, consignmentParty: true },
    });
  }

  async recordSaleDebts(
    businessId: string,
    saleId: string,
    items: Array<{ id: string; productId: string | null; qty: number }>,
  ) {
    const productIds = items.map((i) => i.productId).filter((id): id is string => Boolean(id));
    if (!productIds.length) return;
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: productIds }, consigned: true, consignmentPartyId: { not: null } },
      include: { consignmentParty: true },
    });
    if (!products.length) return;
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const item of items) {
      if (!item.productId || item.qty <= 0) continue;
      const product = byId.get(item.productId);
      if (!product?.consignmentPartyId || !product.consignmentParty) continue;
      const commissionBase = normalizeCommissionBase(product.consignmentParty.commissionBase);
      const unitBase =
        commissionBase === 'sale' ? this.toNum(product.price) : this.toNum(product.cost);
      const commissionPercent =
        product.consignmentCommissionPercent != null
          ? this.toNum(product.consignmentCommissionPercent)
          : this.toNum(product.consignmentParty.defaultCommissionPercent);
      const unitAmount = this.computeUnitAmount(unitBase, commissionPercent);
      const amount = unitAmount * item.qty;
      await this.prisma.consignmentLedgerEntry.create({
        data: {
          businessId,
          partyId: product.consignmentPartyId,
          productId: product.id,
          saleId,
          saleItemId: item.id,
          qty: item.qty,
          // Guarda la base usada (costo o venta) para que la cuenta corriente sea auditable.
          unitCost: new Decimal(unitBase),
          commissionPercent: new Decimal(commissionPercent),
          amount: new Decimal(amount),
          note: `Venta ${saleId.slice(0, 8)} · ${product.name} (${commissionBase === 'sale' ? 'venta' : 'costo'})`,
        },
      });
    }
  }

  async voidSaleDebts(businessId: string, saleId: string) {
    await this.prisma.consignmentLedgerEntry.updateMany({
      where: { businessId, saleId, voided: false },
      data: { voided: true },
    });
  }
}
