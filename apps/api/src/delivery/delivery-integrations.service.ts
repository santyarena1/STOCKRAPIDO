import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertPlanFeatureRead, assertPlanFeature } from '../billing/plan-guard';
import { decryptSecret, encryptSecret } from '../fiscal/fiscal-crypto';
import {
  DELIVERY_PROVIDERS,
  isDeliveryProvider,
  PROVIDER_LABELS,
  type DeliveryProviderId,
} from './delivery.constants';
import { DeliveryProviderRegistry } from './delivery-provider.registry';

@Injectable()
export class DeliveryIntegrationsService {
  constructor(
    private prisma: PrismaService,
    private providers: DeliveryProviderRegistry,
  ) {}

  async list(businessId: string) {
    await assertPlanFeatureRead(this.prisma, businessId, 'deliveryIntegrations');
    const existing = await this.prisma.deliveryIntegration.findMany({ where: { businessId } });
    const byProvider = new Map(existing.map((row) => [row.provider, row]));
    return DELIVERY_PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);
      return row ? this.serialize(row) : this.emptyIntegration(businessId, provider);
    });
  }

  async get(businessId: string, provider: string) {
    await assertPlanFeatureRead(this.prisma, businessId, 'deliveryIntegrations');
    if (!isDeliveryProvider(provider)) throw new NotFoundException('Proveedor no soportado');
    const row = await this.prisma.deliveryIntegration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    return row ? this.serialize(row) : this.emptyIntegration(businessId, provider);
  }

  async upsert(
    businessId: string,
    provider: string,
    body: {
      name?: string;
      enabled?: boolean;
      storeExternalId?: string;
      chainExternalId?: string;
      countryCode?: string;
      config?: Record<string, unknown>;
      credentials?: Record<string, unknown>;
      storeOpen?: boolean;
      autoAccept?: boolean;
      autoConfirmSale?: boolean;
      prepMinutesDefault?: number;
    },
  ) {
    await assertPlanFeature(this.prisma, businessId, 'deliveryIntegrations');
    if (!isDeliveryProvider(provider)) throw new BadRequestException('Proveedor no soportado');

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim() || PROVIDER_LABELS[provider];
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.storeExternalId !== undefined) data.storeExternalId = body.storeExternalId?.trim() || null;
    if (body.chainExternalId !== undefined) data.chainExternalId = body.chainExternalId?.trim() || null;
    if (body.countryCode !== undefined) data.countryCode = body.countryCode?.trim() || 'AR';
    if (body.config !== undefined) data.config = body.config;
    if (body.storeOpen !== undefined) data.storeOpen = body.storeOpen;
    if (body.autoAccept !== undefined) data.autoAccept = body.autoAccept;
    if (body.autoConfirmSale !== undefined) data.autoConfirmSale = body.autoConfirmSale;
    if (body.prepMinutesDefault !== undefined) data.prepMinutesDefault = body.prepMinutesDefault;
    if (body.credentials !== undefined) {
      data.credentialsEncrypted =
        body.credentials && Object.keys(body.credentials).length
          ? encryptSecret(JSON.stringify(body.credentials))
          : null;
    }

    const row = await this.prisma.deliveryIntegration.upsert({
      where: { businessId_provider: { businessId, provider } },
      create: {
        businessId,
        provider,
        name: (data.name as string) || PROVIDER_LABELS[provider],
        enabled: Boolean(data.enabled),
        storeExternalId: (data.storeExternalId as string | null) ?? null,
        chainExternalId: (data.chainExternalId as string | null) ?? null,
        countryCode: (data.countryCode as string) || 'AR',
        config: (data.config as object) ?? {},
        credentialsEncrypted: (data.credentialsEncrypted as string | null) ?? null,
        storeOpen: data.storeOpen !== undefined ? Boolean(data.storeOpen) : true,
        autoAccept: Boolean(data.autoAccept),
        autoConfirmSale: data.autoConfirmSale !== undefined ? Boolean(data.autoConfirmSale) : true,
        prepMinutesDefault: Number(data.prepMinutesDefault) || 15,
      },
      update: data,
    });

    await this.logEvent(row.id, 'config_updated', 'Configuración actualizada');
    return this.serialize(row);
  }

  async regenerateWebhookSecret(businessId: string, provider: string) {
    await assertPlanFeature(this.prisma, businessId, 'deliveryIntegrations');
    if (!isDeliveryProvider(provider)) throw new BadRequestException('Proveedor no soportado');
    const row = await this.prisma.deliveryIntegration.upsert({
      where: { businessId_provider: { businessId, provider } },
      create: { businessId, provider, name: PROVIDER_LABELS[provider] },
      update: { webhookSecret: cryptoRandom() },
    });
    return { ...this.serialize(row), webhookSecret: row.webhookSecret };
  }

  async setStoreOpen(businessId: string, provider: DeliveryProviderId, open: boolean) {
    const row = await this.requireIntegration(businessId, provider);
    const ctx = this.toContext(row);
    await this.providers.get(provider).setStoreOpen(ctx, open);
    const updated = await this.prisma.deliveryIntegration.update({
      where: { id: row.id },
      data: { storeOpen: open, lastSyncAt: new Date() },
    });
    await this.logEvent(row.id, open ? 'store_opened' : 'store_closed', open ? 'Tienda abierta' : 'Tienda cerrada');
    return this.serialize(updated);
  }

  async listMappings(businessId: string, provider: DeliveryProviderId) {
    const row = await this.requireIntegration(businessId, provider);
    return this.prisma.deliveryProductMapping.findMany({
      where: { integrationId: row.id },
      orderBy: { externalSku: 'asc' },
      include: { product: { select: { id: true, name: true, barcode: true, brand: true } } },
    });
  }

  async upsertMapping(
    businessId: string,
    provider: DeliveryProviderId,
    body: { externalSku: string; externalName?: string; productId?: string | null; active?: boolean },
  ) {
    const row = await this.requireIntegration(businessId, provider);
    const externalSku = body.externalSku?.trim();
    if (!externalSku) throw new BadRequestException('SKU externo requerido');
    return this.prisma.deliveryProductMapping.upsert({
      where: { integrationId_externalSku: { integrationId: row.id, externalSku } },
      create: {
        integrationId: row.id,
        externalSku,
        externalName: body.externalName?.trim() || null,
        productId: body.productId || null,
        active: body.active !== false,
      },
      update: {
        externalName: body.externalName?.trim() || null,
        productId: body.productId || null,
        active: body.active !== false,
      },
      include: { product: { select: { id: true, name: true, barcode: true, brand: true } } },
    });
  }

  async listMenu(businessId: string, provider: DeliveryProviderId) {
    const row = await this.requireIntegration(businessId, provider);
    return this.prisma.deliveryMenuItem.findMany({
      where: { integrationId: row.id },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { product: { select: { id: true, name: true, barcode: true, price: true, imageUrl: true } } },
    });
  }

  async syncMenuFromProducts(businessId: string, provider: DeliveryProviderId) {
    const row = await this.requireIntegration(businessId, provider);
    const products = await this.prisma.product.findMany({
      where: { businessId, isActive: true },
      include: { category: { select: { name: true } } },
      take: 500,
      orderBy: { name: 'asc' },
    });

    for (const product of products) {
      const sku = product.barcode || product.supplierSku || product.externalId || product.id;
      const existing = await this.prisma.deliveryMenuItem.findFirst({
        where: { integrationId: row.id, externalSku: sku },
      });
      const payload = {
        integrationId: row.id,
        externalSku: sku,
        name: product.name,
        category: product.category?.name ?? null,
        price: product.price,
        available: product.stock > 0 || !product.stockControl,
        imageUrl: product.imageUrl,
        productId: product.id,
        lastSyncedAt: new Date(),
      };
      if (existing) {
        await this.prisma.deliveryMenuItem.update({ where: { id: existing.id }, data: payload });
      } else {
        await this.prisma.deliveryMenuItem.create({ data: payload });
      }
    }

    const menu = await this.listMenu(businessId, provider);
    const ctx = this.toContext(row);
    const push = await this.providers.get(provider).pushMenu(
      ctx,
      menu.map((m) => ({
        sku: m.externalSku,
        name: m.name,
        price: m.price,
        category: m.category,
        available: m.available,
      })),
    );

    await this.prisma.deliveryIntegration.update({
      where: { id: row.id },
      data: { lastSyncAt: new Date(), lastError: null },
    });
    await this.logEvent(row.id, 'menu_synced', push.message ?? 'Menú sincronizado');
    return { items: menu.length, push };
  }

  async pushMenu(businessId: string, provider: DeliveryProviderId) {
    const row = await this.requireIntegration(businessId, provider);
    const menu = await this.listMenu(businessId, provider);
    const ctx = this.toContext(row);
    const push = await this.providers.get(provider).pushMenu(
      ctx,
      menu.map((m) => ({
        sku: m.externalSku,
        name: m.name,
        price: m.price,
        category: m.category,
        available: m.available,
      })),
    );
    await this.logEvent(row.id, 'menu_pushed', push.message ?? 'Menú enviado a la plataforma');
    return push;
  }

  async getEvents(businessId: string, provider: DeliveryProviderId, limit = 50) {
    const row = await this.requireIntegration(businessId, provider);
    return this.prisma.deliveryIntegrationEvent.findMany({
      where: { integrationId: row.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async findByWebhookToken(provider: DeliveryProviderId, token: string) {
    return this.prisma.deliveryIntegration.findFirst({
      where: { provider, webhookToken: token, enabled: true },
    });
  }

  async requireIntegration(businessId: string, provider: DeliveryProviderId) {
    await assertPlanFeatureRead(this.prisma, businessId, 'deliveryIntegrations');
    const row = await this.prisma.deliveryIntegration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    if (!row) throw new NotFoundException(`Integración ${PROVIDER_LABELS[provider]} no configurada`);
    return row;
  }

  toContext(row: {
    id: string;
    businessId: string;
    provider: string;
    webhookSecret: string;
    credentialsEncrypted: string | null;
    config: unknown;
  }) {
    let credentials: Record<string, unknown> | undefined;
    if (row.credentialsEncrypted) {
      try {
        credentials = JSON.parse(decryptSecret(row.credentialsEncrypted));
      } catch {
        credentials = undefined;
      }
    }
    return {
      integrationId: row.id,
      businessId: row.businessId,
      provider: row.provider as DeliveryProviderId,
      webhookSecret: row.webhookSecret,
      credentials,
      config: (row.config && typeof row.config === 'object' ? row.config : {}) as Record<string, unknown>,
    };
  }

  private serialize(row: {
    id: string;
    businessId: string;
    provider: string;
    name: string;
    enabled: boolean;
    storeExternalId: string | null;
    chainExternalId: string | null;
    countryCode: string;
    config: unknown;
    credentialsEncrypted: string | null;
    webhookSecret: string;
    webhookToken: string;
    storeOpen: boolean;
    autoAccept: boolean;
    autoConfirmSale: boolean;
    prepMinutesDefault: number;
    lastSyncAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      businessId: row.businessId,
      provider: row.provider,
      name: row.name,
      enabled: row.enabled,
      storeExternalId: row.storeExternalId,
      chainExternalId: row.chainExternalId,
      countryCode: row.countryCode,
      config: row.config ?? {},
      hasCredentials: Boolean(row.credentialsEncrypted),
      webhookToken: row.webhookToken,
      storeOpen: row.storeOpen,
      autoAccept: row.autoAccept,
      autoConfirmSale: row.autoConfirmSale,
      prepMinutesDefault: row.prepMinutesDefault,
      lastSyncAt: row.lastSyncAt,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private emptyIntegration(businessId: string, provider: DeliveryProviderId) {
    return {
      id: null,
      businessId,
      provider,
      name: PROVIDER_LABELS[provider],
      enabled: false,
      storeExternalId: null,
      chainExternalId: null,
      countryCode: 'AR',
      config: {},
      hasCredentials: false,
      webhookToken: null,
      storeOpen: true,
      autoAccept: false,
      autoConfirmSale: true,
      prepMinutesDefault: 15,
      lastSyncAt: null,
      lastError: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  private async logEvent(integrationId: string, type: string, message?: string, payload?: unknown) {
    await this.prisma.deliveryIntegrationEvent.create({
      data: { integrationId, type, message, payload: payload as object | undefined },
    });
  }
}

function cryptoRandom() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
