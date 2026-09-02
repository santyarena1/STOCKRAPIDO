import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { assertPlanFeature, assertPlanFeatureRead } from '../billing/plan-guard';
import {
  ACTIVE_DELIVERY_STATUSES,
  isDeliveryProvider,
  type DeliveryOrderStatus,
  type DeliveryProviderId,
} from './delivery.constants';
import { DeliveryIntegrationsService } from './delivery-integrations.service';
import { DeliveryProviderRegistry } from './delivery-provider.registry';
import type { NormalizedDeliveryOrder } from './delivery.types';

@Injectable()
export class DeliveryOrdersService {
  constructor(
    private prisma: PrismaService,
    private sales: SalesService,
    private integrations: DeliveryIntegrationsService,
    private providers: DeliveryProviderRegistry,
  ) {}

  async hubStats(businessId: string) {
    await assertPlanFeatureRead(this.prisma, businessId, 'deliveryIntegrations');
    const [pending, active, today, integrations] = await Promise.all([
      this.prisma.deliveryOrder.count({
        where: { businessId, status: 'pending_accept' },
      }),
      this.prisma.deliveryOrder.count({
        where: { businessId, status: { in: ACTIVE_DELIVERY_STATUSES } },
      }),
      this.prisma.deliveryOrder.count({
        where: {
          businessId,
          createdAt: { gte: startOfToday() },
        },
      }),
      this.prisma.deliveryIntegration.findMany({
        where: { businessId },
        select: { provider: true, enabled: true, storeOpen: true, lastError: true },
      }),
    ]);
    return { pending, active, today, integrations };
  }

  async list(
    businessId: string,
    opts: {
      provider?: string;
      status?: string;
      q?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    await assertPlanFeatureRead(this.prisma, businessId, 'deliveryIntegrations');
    const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where: Record<string, unknown> = { businessId };
    if (opts.provider && isDeliveryProvider(opts.provider)) where.provider = opts.provider;
    if (opts.status) where.status = opts.status;
    if (opts.q?.trim()) {
      const term = opts.q.trim();
      where.OR = [
        { externalOrderId: { contains: term } },
        { customerName: { contains: term, mode: 'insensitive' } },
        { customerPhone: { contains: term } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.deliveryOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          items: { include: { product: { select: { id: true, name: true, barcode: true } } } },
          integration: { select: { id: true, name: true, provider: true, storeOpen: true } },
          sale: { select: { id: true, totalFinal: true } },
        },
      }),
      this.prisma.deliveryOrder.count({ where }),
    ]);
    return { items, total };
  }

  async get(businessId: string, orderId: string) {
    await assertPlanFeatureRead(this.prisma, businessId, 'deliveryIntegrations');
    const order = await this.prisma.deliveryOrder.findFirst({
      where: { id: orderId, businessId },
      include: {
        items: { include: { product: true } },
        events: { orderBy: { createdAt: 'asc' } },
        integration: true,
        sale: { include: { items: true } },
      },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  async ingestWebhook(provider: DeliveryProviderId, token: string, body: unknown, headers: Record<string, string | string[] | undefined>) {
    const integration = await this.integrations.findByWebhookToken(provider, token);
    if (!integration) throw new NotFoundException('Integración no encontrada');

    const adapter = this.providers.get(provider);
    const ctx = this.integrations.toContext(integration);
    if (!adapter.verifyWebhook(ctx, body, headers)) {
      throw new BadRequestException('Webhook no autorizado');
    }

    const statusEvent = adapter.parseStatusEvent(body);
    if (statusEvent) {
      const existing = await this.prisma.deliveryOrder.findFirst({
        where: {
          businessId: integration.businessId,
          provider,
          externalOrderId: statusEvent.externalOrderId,
        },
      });
      if (existing) {
        const mapped = mapExternalStatus(statusEvent.status);
        if (mapped) {
          await this.updateStatusInternal(existing.id, integration.businessId, mapped, {
            reason: statusEvent.reason,
            system: true,
          });
        }
      }
      return { ok: true, type: 'status' };
    }

    const normalized = adapter.parseIncomingOrder(body);
    if (!normalized) return { ok: true, type: 'ignored' };

    const order = await this.createFromNormalized(integration.businessId, integration.id, provider, normalized);
    if (integration.autoAccept) {
      const owner = await this.pickSystemUser(integration.businessId);
      await this.accept(integration.businessId, order.id, owner.id, integration.prepMinutesDefault);
    }
    return { ok: true, type: 'order', orderId: order.id };
  }

  async simulate(
    businessId: string,
    provider: DeliveryProviderId,
    body: Partial<NormalizedDeliveryOrder> & { externalOrderId?: string },
  ) {
    await assertPlanFeature(this.prisma, businessId, 'deliveryIntegrations');
    const integration = await this.integrations.requireIntegration(businessId, provider);
    const normalized: NormalizedDeliveryOrder = {
      externalOrderId: body.externalOrderId || `SIM-${Date.now()}`,
      customerName: body.customerName ?? 'Cliente simulado',
      customerPhone: body.customerPhone ?? '+54 11 5555-0000',
      deliveryAddress: body.deliveryAddress ?? 'Av. Corrientes 1234, CABA',
      deliveryNotes: body.deliveryNotes ?? 'Pedido de prueba desde StockRápido',
      paymentMethod: body.paymentMethod ?? provider,
      subtotal: body.subtotal ?? 4500,
      deliveryFee: body.deliveryFee ?? 500,
      discount: body.discount ?? 0,
      total: body.total ?? 5000,
      currency: body.currency ?? 'ARS',
      placedAt: new Date(),
      items:
        body.items ??
        [
          {
            externalSku: '7790895000994',
            name: 'Coca-Cola 500ml',
            qty: 2,
            unitPrice: 1600,
            subtotal: 3200,
          },
          {
            externalSku: '7622300459433',
            name: 'Oreo 118g',
            qty: 1,
            unitPrice: 1300,
            subtotal: 1300,
          },
        ],
      raw: { simulated: true, provider },
    };
    const order = await this.createFromNormalized(businessId, integration.id, provider, normalized);
    if (integration.autoAccept) {
      const owner = await this.pickSystemUser(businessId);
      await this.accept(businessId, order.id, owner.id, integration.prepMinutesDefault);
    }
    return order;
  }

  async accept(businessId: string, orderId: string, userId: string, prepMinutes?: number) {
    const order = await this.requireOrder(businessId, orderId);
    if (order.status !== 'pending_accept') {
      throw new BadRequestException('El pedido no está pendiente de aceptación');
    }
    const ctx = await this.ctxForOrder(order);
    await this.providers.get(order.provider as DeliveryProviderId).acceptOrder(ctx, order.externalOrderId, prepMinutes);
    return this.updateStatusInternal(orderId, businessId, 'accepted', {
      userId,
      prepMinutes,
      message: prepMinutes ? `Aceptado · ${prepMinutes} min` : 'Pedido aceptado',
    });
  }

  async reject(businessId: string, orderId: string, userId: string, reason?: string) {
    const order = await this.requireOrder(businessId, orderId);
    const ctx = await this.ctxForOrder(order);
    await this.providers.get(order.provider as DeliveryProviderId).rejectOrder(ctx, order.externalOrderId, reason);
    return this.updateStatusInternal(orderId, businessId, 'rejected', { userId, reason, message: reason ?? 'Rechazado' });
  }

  async preparing(businessId: string, orderId: string, userId: string) {
    const order = await this.requireOrder(businessId, orderId);
    const ctx = await this.ctxForOrder(order);
    await this.providers.get(order.provider as DeliveryProviderId).markPreparing(ctx, order.externalOrderId);
    return this.updateStatusInternal(orderId, businessId, 'preparing', { userId, message: 'En preparación' });
  }

  async ready(businessId: string, orderId: string, userId: string) {
    const order = await this.requireOrder(businessId, orderId);
    const ctx = await this.ctxForOrder(order);
    await this.providers.get(order.provider as DeliveryProviderId).markReady(ctx, order.externalOrderId);
    const updated = await this.updateStatusInternal(orderId, businessId, 'ready_for_pickup', {
      userId,
      message: 'Listo para retiro',
      setReadyAt: true,
    });
    const integration = await this.prisma.deliveryIntegration.findUnique({ where: { id: order.integrationId } });
    if (integration?.autoConfirmSale && !order.saleId) {
      await this.convertToSale(businessId, orderId, userId);
    }
    return updated;
  }

  async dispatch(businessId: string, orderId: string, userId: string) {
    const order = await this.requireOrder(businessId, orderId);
    const ctx = await this.ctxForOrder(order);
    await this.providers.get(order.provider as DeliveryProviderId).markDispatched(ctx, order.externalOrderId);
    return this.updateStatusInternal(orderId, businessId, 'dispatched', {
      userId,
      message: 'Despachado',
      setDispatchedAt: true,
    });
  }

  async deliver(businessId: string, orderId: string, userId: string) {
    return this.updateStatusInternal(orderId, businessId, 'delivered', {
      userId,
      message: 'Entregado',
      setDeliveredAt: true,
    });
  }

  async cancel(businessId: string, orderId: string, userId: string, reason?: string) {
    const order = await this.requireOrder(businessId, orderId);
    const ctx = await this.ctxForOrder(order);
    await this.providers.get(order.provider as DeliveryProviderId).cancelOrder(ctx, order.externalOrderId, reason);
    return this.updateStatusInternal(orderId, businessId, 'cancelled', {
      userId,
      reason,
      message: reason ?? 'Cancelado',
      setCancelledAt: true,
    });
  }

  async convertToSale(businessId: string, orderId: string, userId: string) {
    await assertPlanFeature(this.prisma, businessId, 'deliveryIntegrations');
    const order = await this.requireOrder(businessId, orderId);
    if (order.saleId) {
      const sale = await this.prisma.sale.findUnique({ where: { id: order.saleId } });
      return { sale, already: true };
    }

    const cashRegisterId = await this.ensureDeliveryCashRegister(businessId, userId);
    const saleItems = order.items.map((item) => {
      if (item.productId) {
        return {
          productId: item.productId,
          qty: item.qty,
          unitPrice: Number(item.unitPrice),
        };
      }
      return {
        name: item.name,
        qty: item.qty,
        unitPrice: Number(item.unitPrice),
      };
    });

    const paymentMethod = order.provider === 'rappi' ? 'rappi' : 'pedidosya';
    const result = await this.sales.create(businessId, userId, saleItems, {
      cashRegisterId,
      paymentMethod,
      discount: Number(order.discount),
      fiscalMode: 'internal',
      orderSource: order.provider,
      externalOrderId: order.externalOrderId,
    });

    await this.prisma.deliveryOrder.update({
      where: { id: orderId },
      data: { saleId: result.id },
    });
    await this.logEvent(orderId, 'sale_created', 'Venta registrada en inventario', { saleId: result.id }, userId);
    return { sale: result, already: false };
  }

  private async createFromNormalized(
    businessId: string,
    integrationId: string,
    provider: DeliveryProviderId,
    normalized: NormalizedDeliveryOrder,
  ) {
    const existing = await this.prisma.deliveryOrder.findUnique({
      where: {
        businessId_provider_externalOrderId: {
          businessId,
          provider,
          externalOrderId: normalized.externalOrderId,
        },
      },
    });
    if (existing) return existing;

    const mappings = await this.prisma.deliveryProductMapping.findMany({
      where: { integrationId, active: true },
    });
    const mapBySku = new Map(mappings.map((m) => [m.externalSku, m.productId]));

    const resolvedItems: Array<NormalizedDeliveryOrder['items'][number] & { productId: string | null; mapped: boolean }> = [];
    const issues: { sku?: string; name: string; reason: string }[] = [];

    for (const item of normalized.items) {
      let productId: string | null = null;
      if (item.externalSku && mapBySku.get(item.externalSku)) {
        productId = mapBySku.get(item.externalSku)!;
      } else if (item.externalSku) {
        const byCode = await this.prisma.product.findFirst({
          where: {
            businessId,
            OR: [
              { barcode: item.externalSku },
              { allCodes: { contains: item.externalSku } },
              { supplierSku: item.externalSku },
              { externalId: item.externalSku },
            ],
          },
          select: { id: true },
        });
        productId = byCode?.id ?? null;
      }
      if (!productId) {
        issues.push({
          sku: item.externalSku,
          name: item.name,
          reason: 'Sin producto local vinculado',
        });
      }
      resolvedItems.push({ ...item, productId, mapped: Boolean(productId) });
    }

    const order = await this.prisma.deliveryOrder.create({
      data: {
        businessId,
        integrationId,
        provider,
        externalOrderId: normalized.externalOrderId,
        status: 'pending_accept',
        customerName: normalized.customerName,
        customerPhone: normalized.customerPhone,
        deliveryAddress: normalized.deliveryAddress,
        deliveryNotes: normalized.deliveryNotes,
        paymentMethod: normalized.paymentMethod,
        subtotal: new Decimal(normalized.subtotal),
        deliveryFee: new Decimal(normalized.deliveryFee),
        discount: new Decimal(normalized.discount),
        total: new Decimal(normalized.total),
        currency: normalized.currency ?? 'ARS',
        scheduledFor: normalized.scheduledFor,
        placedAt: normalized.placedAt ?? new Date(),
        raw: normalized.raw as object,
        mappingIssues: issues.length ? (issues as object) : undefined,
        items: {
          create: resolvedItems.map((item) => ({
            externalItemId: item.externalItemId,
            externalSku: item.externalSku,
            name: item.name,
            qty: item.qty,
            unitPrice: new Decimal(item.unitPrice),
            subtotal: new Decimal(item.subtotal),
            notes: item.notes,
            productId: item.productId,
            mapped: item.mapped,
          })),
        },
      },
      include: { items: true },
    });

    await this.logEvent(order.id, 'received', 'Pedido recibido desde la plataforma');
    return order;
  }

  private async updateStatusInternal(
    orderId: string,
    businessId: string,
    status: DeliveryOrderStatus,
    opts?: {
      userId?: string;
      reason?: string;
      message?: string;
      prepMinutes?: number;
      system?: boolean;
      setReadyAt?: boolean;
      setDispatchedAt?: boolean;
      setDeliveredAt?: boolean;
      setCancelledAt?: boolean;
    },
  ) {
    const data: Record<string, unknown> = { status };
    if (status === 'accepted') data.acceptedAt = new Date();
    if (opts?.setReadyAt) data.readyAt = new Date();
    if (opts?.setDispatchedAt) data.dispatchedAt = new Date();
    if (opts?.setDeliveredAt) data.deliveredAt = new Date();
    if (opts?.setCancelledAt) {
      data.cancelledAt = new Date();
      data.cancelReason = opts.reason ?? null;
    }

    const order = await this.prisma.deliveryOrder.update({
      where: { id: orderId },
      data,
      include: {
        items: { include: { product: { select: { id: true, name: true } } } },
        integration: { select: { provider: true, name: true } },
        sale: { select: { id: true } },
      },
    });
    await this.logEvent(orderId, `status_${status}`, opts?.message ?? status, { reason: opts?.reason }, opts?.userId);
    return order;
  }

  private async requireOrder(businessId: string, orderId: string) {
    await assertPlanFeature(this.prisma, businessId, 'deliveryIntegrations');
    const order = await this.prisma.deliveryOrder.findFirst({
      where: { id: orderId, businessId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  private async ctxForOrder(order: { integrationId: string; businessId: string; provider: string }) {
    const integration = await this.prisma.deliveryIntegration.findUnique({ where: { id: order.integrationId } });
    if (!integration) throw new NotFoundException('Integración no encontrada');
    return this.integrations.toContext(integration);
  }

  private async ensureDeliveryCashRegister(businessId: string, userId: string) {
    const label = 'Delivery Apps';
    const open = await this.prisma.cashRegister.findFirst({
      where: { businessId, closedAt: null, notes: label },
      orderBy: { openedAt: 'desc' },
    });
    if (open) return open.id;
    const created = await this.prisma.cashRegister.create({
      data: {
        businessId,
        userId,
        openingCash: new Decimal(0),
        openingBank: new Decimal(0),
        notes: label,
      },
    });
    return created.id;
  }

  private async pickSystemUser(businessId: string) {
    const user = await this.prisma.user.findFirst({
      where: { businessId, role: { in: ['OWNER', 'ADMIN'] }, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) throw new BadRequestException('No hay usuario administrador para operaciones automáticas');
    return user;
  }

  private async logEvent(orderId: string, type: string, message?: string, payload?: unknown, userId?: string) {
    await this.prisma.deliveryOrderEvent.create({
      data: { orderId, type, message, payload: payload as object | undefined, userId },
    });
  }
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function mapExternalStatus(status: string): DeliveryOrderStatus | null {
  const s = status.toLowerCase();
  if (s.includes('accept')) return 'accepted';
  if (s.includes('prepar')) return 'preparing';
  if (s.includes('ready') || s.includes('pickup')) return 'ready_for_pickup';
  if (s.includes('dispatch') || s.includes('ship')) return 'dispatched';
  if (s.includes('deliver') || s.includes('complete')) return 'delivered';
  if (s.includes('cancel') || s.includes('reject')) return 'cancelled';
  return null;
}
