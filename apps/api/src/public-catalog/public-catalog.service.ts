import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCatalogImportLimit,
  ensureCatalogShareConsent,
  assertPlanFeatureRead,
  assertProductLimit,
} from '../billing/plan-guard';

type PublicProductFields = {
  name: string;
  brand?: string | null;
  category?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  unitsPerBox?: string | null;
  weight?: string | null;
  format?: string | null;
  flavor?: string | null;
  presentation?: string | null;
  subcategory?: string | null;
};

type ProductForCatalog = {
  id: string;
  businessId: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  unitsPerBox?: string | null;
  weight?: string | null;
  format?: string | null;
  flavor?: string | null;
  presentation?: string | null;
  subcategory?: string | null;
  allCodes?: string | null;
  category?: { name: string } | null;
};

const SYNC_BUSINESS_LIMIT = 500;
const SYNC_GLOBAL_LIMIT = 300;

@Injectable()
export class PublicCatalogService {
  private readonly logger = new Logger(PublicCatalogService.name);

  constructor(private prisma: PrismaService) {}

  async facets(businessId: string, q?: string) {
    await assertPlanFeatureRead(this.prisma, businessId, 'publicCatalog');
    const baseWhere = this.buildSearchWhere(q);
    const [brandRows, categoryRows] = await Promise.all([
      this.prisma.publicProduct.findMany({
        where: { ...baseWhere, brand: { not: null } },
        distinct: ['brand'],
        select: { brand: true },
        orderBy: { brand: 'asc' },
        take: 100,
      }),
      this.prisma.publicProduct.findMany({
        where: { ...baseWhere, category: { not: null } },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
        take: 100,
      }),
    ]);
    return {
      brands: brandRows.map((r) => r.brand!).filter(Boolean),
      categories: categoryRows.map((r) => r.category!).filter(Boolean),
    };
  }

  async search(
    businessId: string,
    opts: {
      q?: string;
      brand?: string;
      category?: string;
      imported?: 'yes' | 'no';
      hasImage?: boolean;
      sort?: 'newest' | 'name' | 'brand';
      limit?: number;
      offset?: number;
    },
  ) {
    await assertPlanFeatureRead(this.prisma, businessId, 'publicCatalog');
    await this.syncCommunityCatalog(businessId);

    const limit = Math.min(Math.max(opts.limit ?? 48, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where = await this.buildSearchWhereWithFilters(businessId, opts);
    const orderBy =
      opts.sort === 'name'
        ? { name: 'asc' as const }
        : opts.sort === 'brand'
          ? { brand: 'asc' as const }
          : { createdAt: 'desc' as const };

    const [items, total, facets] = await Promise.all([
      this.prisma.publicProduct.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          brand: true,
          category: true,
          barcode: true,
          imageUrl: true,
          unitsPerBox: true,
          weight: true,
          format: true,
          flavor: true,
          presentation: true,
          subcategory: true,
          createdAt: true,
        },
      }),
      this.prisma.publicProduct.count({ where }),
      this.facets(businessId, opts.q),
    ]);

    const imported = await this.prisma.product.findMany({
      where: {
        businessId,
        sourcePublicProductId: { in: items.map((i) => i.id) },
      },
      select: { id: true, sourcePublicProductId: true, name: true },
    });
    const importedMap = new Map(imported.map((p) => [p.sourcePublicProductId!, p]));

    return {
      items: items.map((item) => ({
        ...item,
        alreadyImported: importedMap.has(item.id),
        localProductId: importedMap.get(item.id)?.id ?? null,
      })),
      total,
      facets,
    };
  }

  private buildSearchWhere(q?: string) {
    const term = q?.trim();
    return {
      status: 'active',
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { brand: { contains: term, mode: 'insensitive' as const } },
              { barcode: term },
              { keywords: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  private async buildSearchWhereWithFilters(
    businessId: string,
    opts: {
      q?: string;
      brand?: string;
      category?: string;
      imported?: 'yes' | 'no';
      hasImage?: boolean;
    },
  ) {
    const where: Prisma.PublicProductWhereInput = {
      ...this.buildSearchWhere(opts.q),
      ...(opts.brand?.trim() ? { brand: { equals: opts.brand.trim(), mode: 'insensitive' } } : {}),
      ...(opts.category?.trim()
        ? { category: { equals: opts.category.trim(), mode: 'insensitive' } }
        : {}),
      ...(opts.hasImage === true ? { imageUrl: { not: null } } : {}),
      ...(opts.hasImage === false ? { imageUrl: null } : {}),
    };

    if (opts.imported === 'yes' || opts.imported === 'no') {
      const importedRows = await this.prisma.product.findMany({
        where: { businessId, sourcePublicProductId: { not: null } },
        select: { sourcePublicProductId: true },
      });
      const importedIds = [
        ...new Set(
          importedRows.map((r) => r.sourcePublicProductId).filter((id): id is string => Boolean(id)),
        ),
      ];
      if (opts.imported === 'yes') {
        where.id = importedIds.length ? { in: importedIds } : { in: ['__none__'] };
      } else {
        where.id = importedIds.length ? { notIn: importedIds } : undefined;
      }
    }

    return where;
  }

  /** Sincroniza productos locales al catálogo comunitario (backfill + mantenimiento). */
  async syncCommunityCatalog(requestingBusinessId: string) {
    try {
      await this.syncBusinessProducts(requestingBusinessId, SYNC_BUSINESS_LIMIT);
      await this.syncPendingProducts(SYNC_GLOBAL_LIMIT);
    } catch (err) {
      this.logger.warn(
        `Sync catálogo comunitario parcial: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async syncBusinessProducts(businessId: string, limit = SYNC_BUSINESS_LIMIT) {
    await ensureCatalogShareConsent(this.prisma, businessId);
    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        incomplete: false,
        sourcePublicProductId: null,
        publishToCatalog: false,
      },
      include: { category: { select: { name: true } } },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });
    for (const product of products) {
      await this.upsertPublicFromProduct(businessId, product);
    }
    return { synced: products.length };
  }

  async syncPendingProducts(limit = SYNC_GLOBAL_LIMIT) {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        incomplete: false,
        sourcePublicProductId: null,
        publishToCatalog: false,
      },
      include: { category: { select: { name: true } } },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });
    for (const product of products) {
      try {
        await ensureCatalogShareConsent(this.prisma, product.businessId);
        await this.upsertPublicFromProduct(product.businessId, product);
      } catch {
        /* otro negocio sin consentimiento aún */
      }
    }
    return { synced: products.length };
  }

  async publishFromProduct(businessId: string, productId: string) {
    await ensureCatalogShareConsent(this.prisma, businessId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: { category: { select: { name: true } } },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (!product.isActive || product.incomplete) {
      throw new NotFoundException('El producto no está listo para compartir en el catálogo.');
    }
    return this.upsertPublicFromProduct(businessId, product);
  }

  private async upsertPublicFromProduct(businessId: string, product: ProductForCatalog) {
    const fields = this.productToPublicFields(product);
    const keywords = [product.name, product.brand, product.barcode, product.allCodes]
      .filter(Boolean)
      .join(' ');

    const existing = product.barcode
      ? await this.prisma.publicProduct.findFirst({
          where: { barcode: product.barcode, publishedByBusinessId: businessId, status: 'active' },
        })
      : await this.prisma.publicProduct.findFirst({
          where: {
            publishedByBusinessId: businessId,
            status: 'active',
            barcode: null,
            name: product.name,
            brand: product.brand ?? null,
          },
        });

    const row = existing
      ? await this.prisma.publicProduct.update({
          where: { id: existing.id },
          data: { ...fields, keywords, status: 'active' },
        })
      : await this.prisma.publicProduct.create({
          data: {
            ...fields,
            keywords,
            publishedByBusinessId: businessId,
          },
        });

    await this.prisma.product.update({
      where: { id: product.id },
      data: { publishToCatalog: true },
    });

    return row;
  }

  async unpublish(businessId: string, publicProductId: string) {
    const row = await this.prisma.publicProduct.findFirst({
      where: { id: publicProductId, publishedByBusinessId: businessId },
    });
    if (!row) throw new NotFoundException('Ficha pública no encontrada');
    await this.prisma.publicProduct.update({
      where: { id: publicProductId },
      data: { status: 'hidden' },
    });
    await this.prisma.product.updateMany({
      where: { businessId, barcode: row.barcode ?? undefined, publishToCatalog: true },
      data: { publishToCatalog: false },
    });
    return { ok: true };
  }

  async importOne(
    businessId: string,
    publicProductId: string,
    options?: {
      price?: number;
      cost?: number;
      barcode?: string;
      brand?: string;
      categoryId?: string;
    },
  ) {
    await ensureCatalogShareConsent(this.prisma, businessId);
    await assertCatalogImportLimit(this.prisma, businessId, 1);
    return this.importOneInternal(businessId, publicProductId, options);
  }

  async importPreview(businessId: string, publicProductId: string) {
    await assertPlanFeatureRead(this.prisma, businessId, 'publicCatalog');
    const pub = await this.prisma.publicProduct.findFirst({
      where: { id: publicProductId, status: 'active' },
    });
    if (!pub) throw new NotFoundException('Producto del catálogo no encontrado');

    const existing = await this.prisma.product.findFirst({
      where: { businessId, sourcePublicProductId: publicProductId },
      select: {
        id: true,
        name: true,
        brand: true,
        barcode: true,
        price: true,
        cost: true,
        category: { select: { id: true, name: true } },
      },
    });

    let categoryId: string | null = null;
    if (pub.category) {
      const cat = await this.prisma.category.findFirst({
        where: { businessId, name: { equals: pub.category, mode: 'insensitive' } },
        select: { id: true },
      });
      categoryId = cat?.id ?? null;
    }

    const similarProducts = await this.findSimilarProducts(businessId, pub, existing?.id);

    return {
      publicProduct: pub,
      alreadyImported: Boolean(existing),
      localProductId: existing?.id ?? null,
      suggestedCategoryId: categoryId,
      similarProducts,
    };
  }

  async listImportHistory(
    businessId: string,
    opts: { q?: string; limit?: number; offset?: number } = {},
  ) {
    await assertPlanFeatureRead(this.prisma, businessId, 'publicCatalog');
    const limit = Math.min(Math.max(opts.limit ?? 48, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const term = opts.q?.trim();

    let where: Prisma.CatalogImportLogWhereInput = { businessId };
    if (term) {
      const [pubs, locals] = await Promise.all([
        this.prisma.publicProduct.findMany({
          where: {
            status: 'active',
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { brand: { contains: term, mode: 'insensitive' } },
              { barcode: term },
            ],
          },
          select: { id: true },
          take: 200,
        }),
        this.prisma.product.findMany({
          where: { businessId, name: { contains: term, mode: 'insensitive' } },
          select: { id: true },
          take: 200,
        }),
      ]);
      const pubIds = pubs.map((p) => p.id);
      const localIds = locals.map((p) => p.id);
      const or: Prisma.CatalogImportLogWhereInput[] = [];
      if (pubIds.length) or.push({ publicProductId: { in: pubIds } });
      if (localIds.length) or.push({ localProductId: { in: localIds } });
      where = or.length ? { businessId, OR: or } : { businessId, id: { in: [] } };
    }

    const [logs, total] = await Promise.all([
      this.prisma.catalogImportLog.findMany({
        where,
        orderBy: { importedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.catalogImportLog.count({ where }),
    ]);

    if (!logs.length) return { items: [], total };

    const pubIds = [...new Set(logs.map((l) => l.publicProductId))];
    const localIds = [...new Set(logs.map((l) => l.localProductId).filter(Boolean))] as string[];
    const [pubs, locals] = await Promise.all([
      this.prisma.publicProduct.findMany({
        where: { id: { in: pubIds } },
        select: { id: true, name: true, brand: true, barcode: true, imageUrl: true, category: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: localIds } },
        select: { id: true, name: true, brand: true, barcode: true },
      }),
    ]);
    const pubMap = new Map(pubs.map((p) => [p.id, p]));
    const localMap = new Map(locals.map((p) => [p.id, p]));

    return {
      items: logs.map((log) => ({
        id: log.id,
        importedAt: log.importedAt,
        publicProduct: pubMap.get(log.publicProductId) ?? null,
        localProduct: log.localProductId ? localMap.get(log.localProductId) ?? null : null,
      })),
      total,
    };
  }

  async importBatch(businessId: string, publicProductIds: string[]) {
    const ids = [...new Set(publicProductIds)].filter(Boolean);
    if (!ids.length) return { imported: 0, skipped: 0, results: [] };
    await ensureCatalogShareConsent(this.prisma, businessId);
    await assertCatalogImportLimit(this.prisma, businessId, ids.length);

    const results: { publicProductId: string; ok: boolean; error?: string }[] = [];
    let imported = 0;
    let skipped = 0;
    for (const id of ids) {
      try {
        const r = await this.importOneInternal(businessId, id);
        if (r.created) imported += 1;
        else skipped += 1;
        results.push({ publicProductId: id, ok: true });
      } catch (e) {
        skipped += 1;
        results.push({
          publicProductId: id,
          ok: false,
          error: e instanceof Error ? e.message : 'Error',
        });
      }
    }
    return { imported, skipped, results };
  }

  private async importOneInternal(
    businessId: string,
    publicProductId: string,
    options?: {
      price?: number;
      cost?: number;
      barcode?: string;
      brand?: string;
      categoryId?: string;
    },
  ) {
    if (!publicProductId?.trim()) throw new NotFoundException('Producto del catálogo no encontrado');
    await assertProductLimit(this.prisma, businessId);

    const pub = await this.prisma.publicProduct.findFirst({
      where: { id: publicProductId, status: 'active' },
    });
    if (!pub) throw new NotFoundException('Producto del catálogo no encontrado');

    const existing = await this.prisma.product.findFirst({
      where: { businessId, sourcePublicProductId: publicProductId },
    });
    if (existing) {
      return {
        product: existing,
        created: false,
        similarProducts: await this.findSimilarProducts(businessId, pub, existing.id),
      };
    }

    const barcode = options?.barcode?.trim() || pub.barcode || null;
    if (barcode) {
      const dup = await this.prisma.product.findFirst({
        where: { businessId, barcode },
      });
      if (dup) {
        return {
          product: dup,
          created: false,
          message: 'Ya tenés un producto con ese código de barras.',
          similarProducts: await this.findSimilarProducts(businessId, pub, dup.id),
        };
      }
    }

    let categoryId: string | undefined = options?.categoryId || undefined;
    if (!categoryId && pub.category) {
      const cat = await this.prisma.category.findFirst({
        where: { businessId, name: { equals: pub.category, mode: 'insensitive' } },
      });
      if (cat) categoryId = cat.id;
      else {
        const created = await this.prisma.category.create({
          data: { businessId, name: pub.category },
        });
        categoryId = created.id;
      }
    }

    const brand = options?.brand?.trim() || pub.brand;
    const price = options?.price != null && options.price >= 0 ? options.price : 0;
    const cost =
      options?.cost != null && options.cost >= 0 ? options.cost : undefined;

    const product = await this.prisma.product.create({
      data: {
        businessId,
        name: pub.name,
        brand,
        barcode,
        imageUrl: pub.imageUrl,
        unitsPerBox: pub.unitsPerBox,
        weight: pub.weight,
        format: pub.format,
        flavor: pub.flavor,
        presentation: pub.presentation,
        subcategory: pub.subcategory,
        categoryId,
        price,
        cost: cost != null ? cost : null,
        stock: 0,
        minStock: 0,
        stockControl: true,
        sourcePublicProductId: pub.id,
        allCodes: barcode || null,
      },
      include: { category: { select: { id: true, name: true } } },
    });

    await this.prisma.catalogImportLog.create({
      data: { businessId, publicProductId: pub.id, localProductId: product.id },
    });

    return {
      product,
      created: true,
      similarProducts: await this.findSimilarProducts(businessId, pub, product.id),
    };
  }

  private async findSimilarProducts(
    businessId: string,
    pub: { id: string; name: string; brand?: string | null; barcode?: string | null },
    excludeProductId?: string,
  ) {
    const or: Prisma.ProductWhereInput[] = [];
    if (pub.barcode) {
      or.push({ barcode: pub.barcode });
      or.push({ allCodes: { contains: pub.barcode } });
    }
    const name = pub.name.trim();
    if (name.length >= 3) {
      or.push({ name: { equals: name, mode: 'insensitive' } });
      const chunk = name.slice(0, Math.min(28, name.length));
      or.push({ name: { contains: chunk, mode: 'insensitive' } });
    }
    if (pub.brand && name.length >= 3) {
      or.push({
        AND: [
          { brand: { equals: pub.brand, mode: 'insensitive' } },
          { name: { contains: name.slice(0, Math.min(20, name.length)), mode: 'insensitive' } },
        ],
      });
    }
    if (!or.length) return [];

    const products = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        ...(excludeProductId ? { NOT: { id: excludeProductId } } : {}),
        OR: or,
      },
      select: {
        id: true,
        name: true,
        brand: true,
        barcode: true,
        price: true,
        cost: true,
        category: { select: { name: true } },
      },
      take: 6,
      orderBy: { updatedAt: 'desc' },
    });
    return products;
  }

  private productToPublicFields(product: {
    name: string;
    brand?: string | null;
    barcode?: string | null;
    imageUrl?: string | null;
    unitsPerBox?: string | null;
    weight?: string | null;
    format?: string | null;
    flavor?: string | null;
    presentation?: string | null;
    subcategory?: string | null;
    category?: { name: string } | null;
  }): PublicProductFields {
    return {
      name: product.name,
      brand: product.brand,
      category: product.category?.name ?? null,
      barcode: product.barcode,
      imageUrl: product.imageUrl,
      unitsPerBox: product.unitsPerBox,
      weight: product.weight,
      format: product.format,
      flavor: product.flavor,
      presentation: product.presentation,
      subcategory: product.subcategory,
    };
  }
}
