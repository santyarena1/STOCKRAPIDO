import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { assertPlanFeature, assertPlanFeatureRead } from '../billing/plan-guard';
import {
  calculateDeliveryListPrice,
  productToListingInput,
  resolveExternalSku,
  validateDeliveryListing,
  type DeliveryProviderId,
} from '../../../../shared/delivery-listing';
import { DeliveryIntegrationsService } from './delivery-integrations.service';
import { DeliveryProviderRegistry } from './delivery-provider.registry';
import { isDeliveryProvider } from './delivery.constants';

@Injectable()
export class DeliveryListingsService {
  constructor(
    private prisma: PrismaService,
    private integrations: DeliveryIntegrationsService,
    private providers: DeliveryProviderRegistry,
  ) {}

  async listCategoryRules(businessId: string, provider: string) {
    const row = await this.integrations.requireIntegration(businessId, provider as DeliveryProviderId);
    const categories = await this.prisma.category.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    const rules = await this.prisma.deliveryCategoryRule.findMany({ where: { integrationId: row.id } });
    const byCat = new Map(rules.map((r) => [r.categoryId, r]));
    return categories.map((cat) => {
      const rule = byCat.get(cat.id);
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        productCount: cat._count.products,
        published: rule?.published ?? false,
        platformCategoryId: rule?.platformCategoryId ?? null,
        platformCategoryName: rule?.platformCategoryName ?? null,
        sortOrder: rule?.sortOrder ?? 0,
        ruleId: rule?.id ?? null,
      };
    });
  }

  async upsertCategoryRules(
    businessId: string,
    provider: string,
    body: {
      rules: {
        categoryId: string;
        published?: boolean;
        platformCategoryId?: string;
        platformCategoryName?: string;
        sortOrder?: number;
      }[];
    },
  ) {
    await assertPlanFeature(this.prisma, businessId, 'deliveryIntegrations');
    const row = await this.integrations.requireIntegration(businessId, provider as DeliveryProviderId);
    for (const rule of body.rules ?? []) {
      await this.prisma.deliveryCategoryRule.upsert({
        where: { integrationId_categoryId: { integrationId: row.id, categoryId: rule.categoryId } },
        create: {
          integrationId: row.id,
          categoryId: rule.categoryId,
          published: rule.published ?? false,
          platformCategoryId: rule.platformCategoryId?.trim() || null,
          platformCategoryName: rule.platformCategoryName?.trim() || null,
          sortOrder: rule.sortOrder ?? 0,
        },
        update: {
          published: rule.published ?? false,
          platformCategoryId: rule.platformCategoryId?.trim() || null,
          platformCategoryName: rule.platformCategoryName?.trim() || null,
          sortOrder: rule.sortOrder ?? 0,
        },
      });
    }
    if (body.rules?.some((r) => r.published)) {
      await this.importFromSelection(businessId, provider, { categoryIds: body.rules.filter((r) => r.published).map((r) => r.categoryId) });
    }
    return this.listCategoryRules(businessId, provider);
  }

  async listListings(businessId: string, provider: string, q?: string) {
    const row = await this.integrations.requireIntegration(businessId, provider as DeliveryProviderId);
    const items = await this.prisma.deliveryMenuItem.findMany({
      where: {
        integrationId: row.id,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { externalSku: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        product: {
          select: {
            id: true,
            name: true,
            barcode: true,
            price: true,
            stock: true,
            stockControl: true,
            imageUrl: true,
            brand: true,
            category: { select: { name: true } },
          },
        },
      },
    });
    return items.map((item) => this.serializeListing(item, row, provider as DeliveryProviderId));
  }

  async upsertListing(
    businessId: string,
    provider: string,
    listingId: string,
    body: Record<string, unknown>,
  ) {
    await assertPlanFeature(this.prisma, businessId, 'deliveryIntegrations');
    const row = await this.integrations.requireIntegration(businessId, provider as DeliveryProviderId);
    const existing = await this.prisma.deliveryMenuItem.findFirst({
      where: { id: listingId, integrationId: row.id },
      include: { product: { include: { category: true } } },
    });
    if (!existing) throw new NotFoundException('Listing no encontrado');

    const data: Record<string, unknown> = {};
    if (body.published !== undefined) data.published = Boolean(body.published);
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.shortDescription !== undefined) data.shortDescription = String(body.shortDescription).trim() || null;
    if (body.description !== undefined) data.description = String(body.description).trim() || null;
    if (body.platformCategoryId !== undefined) data.platformCategoryId = String(body.platformCategoryId).trim() || null;
    if (body.platformCategoryName !== undefined) data.platformCategoryName = String(body.platformCategoryName).trim() || null;
    if (body.imageUrl !== undefined) data.imageUrl = String(body.imageUrl).trim() || null;
    if (body.available !== undefined) data.available = Boolean(body.available);
    if (body.priceMode !== undefined) data.priceMode = body.priceMode === 'manual' ? 'manual' : 'calculated';
    if (body.markupPercent !== undefined) data.markupPercent = body.markupPercent != null ? new Decimal(Number(body.markupPercent)) : null;
    if (body.listPrice !== undefined && body.priceMode === 'manual') {
      data.listPrice = new Decimal(Number(body.listPrice));
    }

    const updated = await this.prisma.deliveryMenuItem.update({
      where: { id: listingId },
      data,
      include: { product: { include: { category: true } } },
    });

    await this.recalculateListing(updated.id, row);
    const fresh = await this.prisma.deliveryMenuItem.findUnique({
      where: { id: listingId },
      include: { product: { include: { category: true } } },
    });
    return this.serializeListing(fresh!, row, provider as DeliveryProviderId);
  }

  async importFromSelection(
    businessId: string,
    provider: string,
    body: { productIds?: string[]; categoryIds?: string[]; allActive?: boolean },
  ) {
    await assertPlanFeature(this.prisma, businessId, 'deliveryIntegrations');
    const row = await this.integrations.requireIntegration(businessId, provider as DeliveryProviderId);
    const where: Record<string, unknown> = { businessId, isActive: true };

    if (body.productIds?.length) {
      where.id = { in: body.productIds };
    } else if (body.categoryIds?.length) {
      where.categoryId = { in: body.categoryIds };
    } else if (body.allActive) {
      // all active
    } else if (row.publishMode === 'by_category') {
      const publishedCats = await this.prisma.deliveryCategoryRule.findMany({
        where: { integrationId: row.id, published: true },
        select: { categoryId: true },
      });
      if (!publishedCats.length) return { imported: 0 };
      where.categoryId = { in: publishedCats.map((c) => c.categoryId) };
    } else {
      throw new BadRequestException('Indicá productos o categorías a importar');
    }

    const products = await this.prisma.product.findMany({
      where,
      include: { category: true },
      take: 1000,
      orderBy: { name: 'asc' },
    });

    const categoryRules = await this.prisma.deliveryCategoryRule.findMany({ where: { integrationId: row.id } });
    const ruleByCat = new Map(categoryRules.map((r) => [r.categoryId, r]));

    let imported = 0;
    for (const product of products) {
      const sku = resolveExternalSku(product);
      const catRule = product.categoryId ? ruleByCat.get(product.categoryId) : undefined;
      const existing = await this.prisma.deliveryMenuItem.findFirst({
        where: { integrationId: row.id, externalSku: sku },
      });
      const payload = {
        integrationId: row.id,
        externalSku: sku,
        name: product.name,
        category: product.category?.name ?? null,
        imageUrl: product.imageUrl,
        productId: product.id,
        basePrice: product.price,
        platformCategoryId: catRule?.platformCategoryId ?? null,
        platformCategoryName: catRule?.platformCategoryName ?? null,
        shortDescription: product.presentation || product.brand ? `${product.brand ?? ''} ${product.presentation ?? ''}`.trim() : null,
        available: product.stock > 0 || !product.stockControl,
        lastSyncedAt: new Date(),
      };
      if (existing) {
        await this.prisma.deliveryMenuItem.update({ where: { id: existing.id }, data: payload });
        await this.recalculateListing(existing.id, row);
      } else {
        const created = await this.prisma.deliveryMenuItem.create({ data: payload });
        await this.recalculateListing(created.id, row);
      }
      imported++;
    }
    return { imported };
  }

  async validateAll(businessId: string, provider: string) {
    const row = await this.integrations.requireIntegration(businessId, provider as DeliveryProviderId);
    const items = await this.prisma.deliveryMenuItem.findMany({
      where: { integrationId: row.id, published: true },
      include: { product: { include: { category: true } } },
    });
    let ready = 0;
    for (const item of items) {
      const serialized = await this.recalculateListing(item.id, row);
      if (serialized.validation.ready) ready++;
    }
    return { total: items.length, ready, pending: items.length - ready };
  }

  async pushPublished(businessId: string, provider: string) {
    await assertPlanFeature(this.prisma, businessId, 'deliveryIntegrations');
    const row = await this.integrations.requireIntegration(businessId, provider as DeliveryProviderId);
    const items = await this.prisma.deliveryMenuItem.findMany({
      where: { integrationId: row.id, published: true },
      include: { product: { include: { category: true } } },
    });

    const pushItems: Awaited<ReturnType<DeliveryListingsService['listListings']>> = [];
    for (const item of items) {
      const serialized = await this.recalculateListing(item.id, row);
      if (!serialized.validation.ready) continue;
      pushItems.push(serialized);
      await this.prisma.deliveryMenuItem.update({
        where: { id: item.id },
        data: { syncStatus: 'pushed', lastPushedAt: new Date() },
      });
    }

    const ctx = this.integrations.toContext(row);
    const push = await this.providers.get(provider as DeliveryProviderId).pushMenu(
      ctx,
      pushItems.map((m) => ({
        sku: m.externalSku,
        name: m.name,
        price: m.listPrice,
        category: m.platformCategoryName || m.category,
        available: m.available,
        description: m.shortDescription,
        imageUrl: m.imageUrl,
      })),
    );

    await this.prisma.deliveryIntegration.update({
      where: { id: row.id },
      data: { lastSyncAt: new Date(), lastError: null },
    });

    return { pushed: pushItems.length, push };
  }

  async productReadiness(businessId: string, productIds?: string[]) {
    await assertPlanFeatureRead(this.prisma, businessId, 'deliveryIntegrations');
    const integrations = await this.prisma.deliveryIntegration.findMany({
      where: { businessId, enabled: true },
    });
    if (!integrations.length) return { providers: [], byProduct: {} as Record<string, unknown> };

    const products = await this.prisma.product.findMany({
      where: { businessId, ...(productIds?.length ? { id: { in: productIds } } : {}) },
      include: { category: true },
      take: productIds?.length ? undefined : 500,
    });

    const listings = await this.prisma.deliveryMenuItem.findMany({
      where: { integration: { businessId }, ...(productIds?.length ? { productId: { in: productIds } } : {}) },
      include: { integration: true },
    });
    const listingByKey = new Map(listings.map((l) => [`${l.integration.provider}:${l.productId}`, l]));

    const byProduct: Record<string, { providers: ReturnType<DeliveryListingsService['readinessForProduct']>[] }> = {};
    for (const product of products) {
      byProduct[product.id] = {
        providers: integrations.map((integ) =>
          this.readinessForProduct(
            integ.provider as DeliveryProviderId,
            product,
            listingByKey.get(`${integ.provider}:${product.id}`),
            integ,
          ),
        ),
      };
    }

    return {
      providers: integrations.map((i) => ({ provider: i.provider, enabled: i.enabled })),
      byProduct,
    };
  }

  readinessForProduct(
    provider: DeliveryProviderId,
    product: {
      id: string;
      name: string;
      barcode: string | null;
      supplierSku: string | null;
      externalId: string | null;
      price: Decimal;
      cost: Decimal | null;
      categoryId: string | null;
      category: { name: string } | null;
      brand: string | null;
      imageUrl: string | null;
      iva: Decimal | null;
      weight: string | null;
      presentation: string | null;
      isActive: boolean;
      stock: number;
      stockControl: boolean;
    },
    listing:
      | {
          published: boolean;
          shortDescription: string | null;
          description: string | null;
          platformCategoryId: string | null;
          platformCategoryName: string | null;
          listPrice: Decimal | null;
          syncStatus: string;
        }
      | undefined,
    integration: { platformCommissionPercent: Decimal; priceMarkupPercent: Decimal },
  ) {
    const input = {
      ...productToListingInput(product),
      shortDescription: listing?.shortDescription,
      description: listing?.description,
      platformCategoryId: listing?.platformCategoryId,
      platformCategoryName: listing?.platformCategoryName,
      listPrice: listing?.listPrice ? Number(listing.listPrice) : calculateDeliveryListPrice(
        Number(product.price),
        Number(integration.priceMarkupPercent),
        Number(integration.platformCommissionPercent),
      ),
    };
    const validation = validateDeliveryListing(provider, input);
    return {
      provider,
      ready: validation.ready,
      requiredMissing: validation.issues.filter((i) => i.level === 'required'),
      recommendedMissing: validation.issues.filter((i) => i.level === 'recommended'),
      published: listing?.published ?? false,
      listPrice: input.listPrice ?? null,
      syncStatus: listing?.syncStatus ?? null,
    };
  }

  private async recalculateListing(itemId: string, integration: { priceMarkupPercent: Decimal; platformCommissionPercent: Decimal; provider: string }) {
    const item = await this.prisma.deliveryMenuItem.findUnique({
      where: { id: itemId },
      include: { product: { include: { category: true } } },
    });
    if (!item) throw new NotFoundException('Listing no encontrado');

    const provider = integration.provider as DeliveryProviderId;
    const base = Number(item.basePrice ?? item.product?.price ?? item.price ?? 0);
    const markup = item.markupPercent != null ? Number(item.markupPercent) : Number(integration.priceMarkupPercent);
    const commission = Number(integration.platformCommissionPercent);
    const listPrice =
      item.priceMode === 'manual' && item.listPrice != null
        ? Number(item.listPrice)
        : calculateDeliveryListPrice(base, markup, commission);

    const input = {
      ...productToListingInput(item.product ?? { name: item.name, price: base, isActive: true, stock: 0, stockControl: true }),
      name: item.name,
      shortDescription: item.shortDescription,
      description: item.description,
      platformCategoryId: item.platformCategoryId,
      platformCategoryName: item.platformCategoryName,
      imageUrl: item.imageUrl ?? item.product?.imageUrl,
      listPrice,
    };
    const validation = validateDeliveryListing(provider, input);

    await this.prisma.deliveryMenuItem.update({
      where: { id: itemId },
      data: {
        listPrice: new Decimal(listPrice),
        price: new Decimal(listPrice),
        basePrice: new Decimal(base),
        validationErrors: validation.issues as object,
        syncStatus: validation.ready ? (item.published ? 'ready' : 'draft') : 'error',
      },
    });

    return this.serializeListing(
      { ...item, listPrice: new Decimal(listPrice), validationErrors: validation.issues, syncStatus: validation.ready ? 'ready' : 'error' },
      integration,
      provider,
      validation,
    );
  }

  private serializeListing(
    item: {
      id: string;
      externalSku: string | null;
      name: string;
      category: string | null;
      price: Decimal | null;
      listPrice: Decimal | null;
      basePrice: Decimal | null;
      available: boolean;
      published: boolean;
      imageUrl: string | null;
      shortDescription: string | null;
      description: string | null;
      platformCategoryId: string | null;
      platformCategoryName: string | null;
      markupPercent: Decimal | null;
      priceMode: string;
      syncStatus: string;
      validationErrors: unknown;
      lastPushedAt: Date | null;
      product?: {
        id: string;
        name: string;
        barcode: string | null;
        price: Decimal;
        stock: number;
        stockControl: boolean;
        imageUrl: string | null;
        brand: string | null;
        category: { name: string } | null;
      } | null;
    },
    integration: { platformCommissionPercent: Decimal; priceMarkupPercent: Decimal },
    provider: DeliveryProviderId,
    validation?: ReturnType<typeof validateDeliveryListing>,
  ) {
    const val =
      validation ??
      validateDeliveryListing(provider, {
        ...productToListingInput(item.product ?? { name: item.name, price: item.basePrice ?? 0, isActive: true, stock: 0, stockControl: true }),
        name: item.name,
        shortDescription: item.shortDescription,
        description: item.description,
        platformCategoryId: item.platformCategoryId,
        platformCategoryName: item.platformCategoryName,
        imageUrl: item.imageUrl,
        listPrice: item.listPrice ? Number(item.listPrice) : null,
      });

    return {
      id: item.id,
      externalSku: item.externalSku,
      name: item.name,
      category: item.category,
      basePrice: item.basePrice ? Number(item.basePrice) : null,
      listPrice: item.listPrice ? Number(item.listPrice) : null,
      markupPercent: item.markupPercent != null ? Number(item.markupPercent) : Number(integration.priceMarkupPercent),
      priceMode: item.priceMode,
      available: item.available,
      published: item.published,
      imageUrl: item.imageUrl,
      shortDescription: item.shortDescription,
      description: item.description,
      platformCategoryId: item.platformCategoryId,
      platformCategoryName: item.platformCategoryName,
      syncStatus: item.syncStatus,
      lastPushedAt: item.lastPushedAt,
      product: item.product,
      validation: val,
    };
  }
}
