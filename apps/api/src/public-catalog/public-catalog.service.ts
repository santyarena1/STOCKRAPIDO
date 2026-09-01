import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCatalogImportLimit,
  assertCatalogPublishLimit,
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

@Injectable()
export class PublicCatalogService {
  constructor(private prisma: PrismaService) {}

  async search(businessId: string, opts: { q?: string; limit?: number; offset?: number }) {
    await assertPlanFeatureRead(this.prisma, businessId, 'publicCatalog');
    const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const q = opts.q?.trim();
    const where = {
      status: 'active',
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { brand: { contains: q, mode: 'insensitive' as const } },
              { barcode: q },
              { keywords: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.publicProduct.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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
    };
  }

  async publishFromProduct(businessId: string, productId: string) {
    await assertCatalogPublishLimit(this.prisma, businessId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      include: { category: { select: { name: true } } },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const fields = this.productToPublicFields(product);
    const keywords = [product.name, product.brand, product.barcode, product.allCodes]
      .filter(Boolean)
      .join(' ');

    const existing = product.barcode
      ? await this.prisma.publicProduct.findFirst({
          where: { barcode: product.barcode, publishedByBusinessId: businessId, status: 'active' },
        })
      : null;

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
      where: { id: productId },
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

  async importOne(businessId: string, publicProductId: string, price?: number) {
    await assertCatalogImportLimit(this.prisma, businessId, 1);
    return this.importOneInternal(businessId, publicProductId, price);
  }

  async importBatch(businessId: string, publicProductIds: string[]) {
    const ids = [...new Set(publicProductIds)].filter(Boolean);
    if (!ids.length) return { imported: 0, skipped: 0, results: [] };
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

  private async importOneInternal(businessId: string, publicProductId: string, price?: number) {
    if (!publicProductId?.trim()) throw new NotFoundException('Producto del catálogo no encontrado');
    await assertProductLimit(this.prisma, businessId);

    const pub = await this.prisma.publicProduct.findFirst({
      where: { id: publicProductId, status: 'active' },
    });
    if (!pub) throw new NotFoundException('Producto del catálogo no encontrado');

    const existing = await this.prisma.product.findFirst({
      where: { businessId, sourcePublicProductId: publicProductId },
    });
    if (existing) return { product: existing, created: false };

    if (pub.barcode) {
      const dup = await this.prisma.product.findFirst({
        where: { businessId, barcode: pub.barcode },
      });
      if (dup) {
        return { product: dup, created: false, message: 'Ya tenés un producto con ese código.' };
      }
    }

    let categoryId: string | undefined;
    if (pub.category) {
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

    const product = await this.prisma.product.create({
      data: {
        businessId,
        name: pub.name,
        brand: pub.brand,
        barcode: pub.barcode,
        imageUrl: pub.imageUrl,
        unitsPerBox: pub.unitsPerBox,
        weight: pub.weight,
        format: pub.format,
        flavor: pub.flavor,
        presentation: pub.presentation,
        subcategory: pub.subcategory,
        categoryId,
        price: price && price > 0 ? price : 0,
        stock: 0,
        minStock: 0,
        stockControl: true,
        sourcePublicProductId: pub.id,
        allCodes: pub.barcode || null,
      },
    });

    await this.prisma.catalogImportLog.create({
      data: { businessId, publicProductId: pub.id, localProductId: product.id },
    });

    return { product, created: true };
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
