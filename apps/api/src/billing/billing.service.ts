import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCycle, getPlan, PLAN_CATALOG, PlanId, planPrice, TRIAL_DAYS } from './plans';
import { resolvePlanAccess } from './plan-guard';

type AuthUser = { id: string; role: string; businessId: string };

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  listPlans() {
    return {
      trialDays: TRIAL_DAYS,
      currency: 'ARS',
      ivaNote: 'Precios + IVA',
      plans: PLAN_CATALOG,
      transfer: this.transferDetails(),
    };
  }

  async getMe(businessId: string) {
    const access = await resolvePlanAccess(this.prisma, businessId);
    const [users, products, syncProviders, invoices] = await Promise.all([
      this.prisma.user.count({ where: { businessId, isActive: true } }),
      this.prisma.product.count({ where: { businessId } }),
      this.prisma.syncConnection.count({ where: { businessId } }),
      this.prisma.invoice.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 24,
      }),
    ]);
    const pending = invoices.find((inv) => inv.status === 'pending') ?? null;
    return {
      plan: access.plan,
      planId: access.planId,
      status: access.status,
      billingCycle: access.billingCycle,
      trialEndsAt: access.trialEndsAt,
      planRenewsAt: access.planRenewsAt,
      trialActive: access.trialActive,
      trialDays: TRIAL_DAYS,
      usage: {
        users,
        products,
        syncProviders,
      },
      limits: access.plan.limits,
      invoices: invoices.map((inv) => this.serializeInvoice(inv)),
      pendingInvoice: pending ? this.serializeInvoice(pending) : null,
      transfer: this.transferDetails(),
      mercadopagoEnabled: Boolean(this.config.get<string>('MP_ACCESS_TOKEN')?.trim()),
    };
  }

  async subscribe(user: AuthUser, dto: { planId: PlanId; cycle: BillingCycle; method?: 'mercadopago' | 'transfer' }) {
    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Solo el dueño o un admin puede cambiar el plan.');
    }
    const plan = getPlan(dto.planId);
    const method = dto.method || (this.config.get<string>('MP_ACCESS_TOKEN')?.trim() ? 'mercadopago' : 'transfer');
    const now = new Date();
    const periodEnd = this.periodEnd(now, dto.cycle);
    const amount = planPrice(plan, dto.cycle);

    await this.prisma.invoice.updateMany({
      where: { businessId: user.businessId, status: 'pending' },
      data: { status: 'void', notes: 'Reemplazada por una nueva contratación' },
    });

    const invoice = await this.prisma.invoice.create({
      data: {
        businessId: user.businessId,
        planId: plan.id,
        cycle: dto.cycle,
        amount: new Decimal(amount),
        currency: 'ARS',
        status: 'pending',
        periodStart: now,
        periodEnd,
        method,
      },
    });

    let checkoutUrl: string | null = null;
    if (method === 'mercadopago') {
      checkoutUrl = await this.createMercadoPagoPreference(invoice.id, plan.name, amount, dto.cycle);
    }

    await this.prisma.business.update({
      where: { id: user.businessId },
      data: {
        planId: plan.id,
        billingCycle: dto.cycle,
        planStatus: 'pending_payment',
        planRenewsAt: periodEnd,
      },
    });

    return {
      invoice: this.serializeInvoice(invoice),
      checkoutUrl,
      transfer: this.transferDetails(),
      message:
        method === 'transfer' || !checkoutUrl
          ? 'Plan reservado. Transferí el importe y avisanos; lo activamos ni bien impacta.'
          : 'Te llevamos a Mercado Pago para pagar.',
    };
  }

  async handleMercadoPagoWebhook(query: Record<string, string | undefined>, body: Record<string, unknown>) {
    const type = String(body?.type || query.type || body?.topic || query.topic || '');
    const data = (body?.data && typeof body.data === 'object' ? body.data : {}) as { id?: string | number };
    const paymentId = String(data.id || query['data.id'] || query.id || '');
    if (!paymentId || (type && !/payment/i.test(type))) {
      return { ok: true, ignored: true };
    }
    const token = this.config.get<string>('MP_ACCESS_TOKEN')?.trim();
    if (!token) return { ok: true, skipped: 'no_token' };

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      this.logger.warn(`MP payment fetch failed ${res.status}`);
      return { ok: false };
    }
    const payment = (await res.json()) as {
      status?: string;
      external_reference?: string;
      id?: number;
    };
    const invoiceId = payment.external_reference;
    if (!invoiceId) return { ok: true, ignored: true };
    if (payment.status !== 'approved') {
      if (payment.status === 'rejected' || payment.status === 'cancelled') {
        await this.prisma.invoice.updateMany({
          where: { id: invoiceId, status: 'pending' },
          data: { status: 'failed', mpPaymentId: String(payment.id ?? paymentId) },
        });
      }
      return { ok: true, status: payment.status };
    }
    await this.markInvoicePaid(invoiceId, String(payment.id ?? paymentId), 'mercadopago');
    return { ok: true, paid: invoiceId };
  }

  async markInvoicePaid(invoiceId: string, mpPaymentId?: string, method?: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Comprobante no encontrado');
    if (invoice.status === 'paid') return this.serializeInvoice(invoice);

    const paid = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'paid',
        paidAt: new Date(),
        mpPaymentId: mpPaymentId || invoice.mpPaymentId,
        method: method || invoice.method,
      },
    });
    await this.prisma.business.update({
      where: { id: invoice.businessId },
      data: {
        planId: invoice.planId,
        billingCycle: invoice.cycle,
        planStatus: 'active',
        planRenewsAt: invoice.periodEnd,
        trialEndsAt: null,
      },
    });
    return this.serializeInvoice(paid);
  }

  private periodEnd(from: Date, cycle: BillingCycle) {
    const end = new Date(from);
    if (cycle === 'yearly') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    return end;
  }

  private transferDetails() {
    const alias = this.config.get<string>('BILLING_MP_ALIAS')?.trim() || '';
    const cbu = this.config.get<string>('BILLING_CBU')?.trim() || '';
    const cuit = this.config.get<string>('BILLING_CUIT')?.trim() || '';
    const whatsapp = this.config.get<string>('BILLING_WHATSAPP')?.trim() || '';
    const holder = this.config.get<string>('BILLING_HOLDER')?.trim() || 'StockRápido';
    return { alias, cbu, cuit, whatsapp, holder };
  }

  private serializeInvoice(inv: {
    id: string;
    planId: string;
    cycle: string;
    amount: Decimal | { toString(): string } | number;
    currency: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    paidAt: Date | null;
    method: string | null;
    notes: string | null;
    mpPreferenceId?: string | null;
    mpPaymentId?: string | null;
    createdAt: Date;
  }) {
    return {
      id: inv.id,
      planId: inv.planId,
      planName: getPlan(inv.planId).name,
      cycle: inv.cycle,
      amount: Number(inv.amount),
      currency: inv.currency,
      status: inv.status,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      paidAt: inv.paidAt,
      method: inv.method,
      notes: inv.notes,
      createdAt: inv.createdAt,
    };
  }

  private async createMercadoPagoPreference(
    invoiceId: string,
    planName: string,
    amount: number,
    cycle: BillingCycle,
  ): Promise<string | null> {
    const token = this.config.get<string>('MP_ACCESS_TOKEN')?.trim();
    if (!token) return null;
    const web = (this.config.get<string>('WEB_URL') || 'http://localhost:3000').replace(/\/$/, '');
    const api = (this.config.get<string>('PUBLIC_API_URL') || this.config.get<string>('API_URL') || '').replace(/\/$/, '');
    const body: Record<string, unknown> = {
      items: [
        {
          title: `StockRápido ${planName} (${cycle === 'yearly' ? 'anual' : 'mensual'})`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: amount,
        },
      ],
      external_reference: invoiceId,
      back_urls: {
        success: `${web}/billing?mp=success`,
        failure: `${web}/billing?mp=failure`,
        pending: `${web}/billing?mp=pending`,
      },
      auto_return: 'approved',
    };
    if (api) body.notification_url = `${api}/billing/mp/webhook`;
    try {
      const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { init_point?: string; sandbox_init_point?: string; id?: string; message?: string };
      if (!res.ok) {
        this.logger.warn(`MP preference error: ${data.message || res.status}`);
        return null;
      }
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { mpPreferenceId: data.id || null },
      });
      return data.init_point || data.sandbox_init_point || null;
    } catch (err) {
      this.logger.warn(`MP preference failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
