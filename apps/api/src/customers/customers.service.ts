import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { assertPlanFeature } from '../billing/plan-guard';
import { randomBytes } from 'node:crypto';
import { FiscalService } from '../fiscal/fiscal.service';

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private fiscal: FiscalService,
  ) {}

  async list(businessId: string, withBalance?: boolean) {
    const where: Record<string, unknown> = { businessId };
    if (withBalance) (where as { balance: { gt: number } }).balance = { gt: 0 };
    return this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async create(businessId: string, data: { name: string; phone?: string; notes?: string }) {
    await assertPlanFeature(this.prisma, businessId, 'customers');
    return this.prisma.customer.create({
      data: { businessId, ...data },
    });
  }

  async update(id: string, businessId: string, data: Partial<{ name: string; phone: string; notes: string }>) {
    return this.prisma.customer.update({
      where: { id, businessId },
      data,
    });
  }

  async addPayment(customerId: string, businessId: string, amount: number, note?: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) return null;
    const amt = new Decimal(amount);
    await this.prisma.customerPayment.create({
      data: { customerId, amount: amt, note },
    });
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { balance: { decrement: amt } },
      include: { payments: { take: 10, orderBy: { createdAt: 'desc' } } },
    });
  }

  async getPayments(customerId: string, businessId: string, limit = 50) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) return [];
    return this.prisma.customerPayment.findMany({
      where: { customerId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMorosos(businessId: string) {
    return this.prisma.customer.findMany({
      where: { businessId, balance: { gt: 0 } },
      orderBy: { balance: 'desc' },
    });
  }

  async getTotalFiado(businessId: string) {
    const result = await this.prisma.customer.aggregate({
      where: { businessId },
      _sum: { balance: true },
    });
    return result._sum.balance ?? 0;
  }

  private newShareToken() {
    return randomBytes(24).toString('base64url');
  }

  /** Crea o regenera el token permanente del link público (solo lectura). */
  async ensureShareToken(customerId: string, businessId: string, regenerate = false) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    if (customer.shareToken && !regenerate) {
      return { shareToken: customer.shareToken, customerId: customer.id, name: customer.name };
    }
    const shareToken = this.newShareToken();
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { shareToken },
      select: { id: true, name: true, shareToken: true },
    });
    return { shareToken: updated.shareToken!, customerId: updated.id, name: updated.name };
  }

  async revokeShareToken(customerId: string, businessId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { shareToken: null },
    });
    return { ok: true };
  }

  /** Estado de cuenta pública (solo lectura) por token permanente. */
  async getPublicAccountByToken(token: string) {
    const clean = token?.trim();
    if (!clean || clean.length < 16) throw new NotFoundException('Link no válido');
    const customer = await this.prisma.customer.findFirst({
      where: { shareToken: clean },
    });
    if (!customer) throw new NotFoundException('Cuenta no disponible');

    const business = await this.prisma.business.findUnique({
      where: { id: customer.businessId },
      select: { name: true, address: true, posConfig: true },
    });
    if (!business) throw new NotFoundException('Cuenta no disponible');

    const posConfig =
      business.posConfig && typeof business.posConfig === 'object'
        ? (business.posConfig as Record<string, unknown>)
        : {};
    const branding =
      posConfig.branding && typeof posConfig.branding === 'object'
        ? (posConfig.branding as Record<string, unknown>)
        : {};

    const sales = await this.prisma.sale.findMany({
      where: {
        businessId: customer.businessId,
        customerId: customer.id,
        paymentMethod: 'fiado',
        status: { not: 'voided' },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        items: {
          select: {
            id: true,
            qty: true,
            unitPrice: true,
            subtotal: true,
            productName: true,
            product: { select: { name: true } },
          },
        },
        fiscalDocument: {
          select: { kind: true, status: true, receiptNumber: true, pointOfSale: true },
        },
      },
    });

    const payments = await this.prisma.customerPayment.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    type Mov = {
      id: string;
      kind: 'cargo' | 'pago';
      date: string;
      amount: number;
      note?: string | null;
      saleId?: string;
      items?: Array<{ name: string; qty: number; unitPrice: number; subtotal: number }>;
      invoiceLabel?: string | null;
      docKind?: string | null;
      balanceAfter: number;
    };

    const raw: Omit<Mov, 'balanceAfter'>[] = [
      ...sales.map((s) => ({
        id: `sale-${s.id}`,
        kind: 'cargo' as const,
        date: s.createdAt.toISOString(),
        amount: Number(s.totalFinal),
        saleId: s.id,
        note: Number(s.discount) > 0 ? `Descuento $${Number(s.discount).toFixed(0)}` : null,
        items: s.items.map((it) => ({
          name: it.product?.name || it.productName || 'Producto',
          qty: it.qty,
          unitPrice: Number(it.unitPrice),
          subtotal: Number(it.subtotal),
        })),
        invoiceLabel:
          s.fiscalDocument?.kind === 'FACTURA_C' && s.fiscalDocument.status === 'AUTHORIZED'
            ? `Factura C ${s.fiscalDocument.pointOfSale ?? ''}-${s.fiscalDocument.receiptNumber ?? ''}`
            : s.fiscalDocument?.kind === 'INTERNAL'
              ? 'Comprobante interno'
              : 'Comprobante',
        docKind:
          s.fiscalDocument?.kind === 'FACTURA_C' && s.fiscalDocument.status === 'AUTHORIZED'
            ? 'FACTURA_C'
            : 'INTERNAL',
      })),
      ...payments.map((p) => ({
        id: `pay-${p.id}`,
        kind: 'pago' as const,
        date: p.createdAt.toISOString(),
        amount: Number(p.amount),
        note: p.note,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let run = 0;
    const movements: Mov[] = raw.map((m) => {
      run += m.kind === 'cargo' ? m.amount : -m.amount;
      return { ...m, balanceAfter: run };
    });

    // Logo del sidebar (branding.logoUrl), no el del ticket.
    const displayName =
      (typeof branding.appTitle === 'string' && branding.appTitle.trim()) || business.name;
    const logoUrl =
      (typeof branding.logoUrl === 'string' && branding.logoUrl.trim()) || null;
    const accent =
      (typeof branding.accentColor === 'string' && branding.accentColor.trim()) || '#DC2626';

    return {
      business: {
        name: displayName,
        legalName: business.name,
        address: business.address,
        logoUrl,
        accentColor: accent,
      },
      customer: {
        name: customer.name,
        balance: Number(customer.balance),
      },
      movements: movements.reverse(),
      generatedAt: new Date().toISOString(),
      readOnly: true as const,
    };
  }

  /** Comprobante (interno o factura) de una venta de la cuenta, vía link público. */
  async getPublicReceipt(token: string, saleId: string) {
    const clean = token?.trim();
    const sid = saleId?.trim();
    if (!clean || clean.length < 16 || !sid) throw new NotFoundException('No encontrado');

    const customer = await this.prisma.customer.findFirst({ where: { shareToken: clean } });
    if (!customer) throw new NotFoundException('Cuenta no disponible');

    const sale = await this.prisma.sale.findFirst({
      where: {
        id: sid,
        businessId: customer.businessId,
        customerId: customer.id,
        paymentMethod: 'fiado',
        status: { not: 'voided' },
      },
      select: { id: true },
    });
    if (!sale) throw new NotFoundException('Comprobante no disponible');

    const receipt = await this.fiscal.receipt(customer.businessId, sale.id, true);

    const business = await this.prisma.business.findUnique({
      where: { id: customer.businessId },
      select: { posConfig: true },
    });
    const posConfig =
      business?.posConfig && typeof business.posConfig === 'object'
        ? (business.posConfig as Record<string, unknown>)
        : {};
    const branding =
      posConfig.branding && typeof posConfig.branding === 'object'
        ? (posConfig.branding as Record<string, unknown>)
        : {};
    const sidebarLogo =
      (typeof branding.logoUrl === 'string' && branding.logoUrl.trim()) || null;
    const appTitle =
      (typeof branding.appTitle === 'string' && branding.appTitle.trim()) || null;

    return {
      ...receipt,
      ticket: {
        ...(receipt.ticket || {}),
        // Preferir logo del sidebar; nombre de app del sistema.
        logoUrl: sidebarLogo,
        fantasyName: appTitle || receipt.ticket?.fantasyName || receipt.business?.name,
      },
    };
  }
}