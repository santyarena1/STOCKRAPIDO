import { Inject, Injectable, BadRequestException, ForbiddenException, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsignmentService } from '../consignment/consignment.service';
import { quickProductFlags } from '../consignment/pick-party';
import { Decimal } from '@prisma/client/runtime/library';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { decorateProductUnits } from '../common/units';
import { fuzzyCodeClause } from '../common/fuzzy-code';
import { assertProductLimit } from '../billing/plan-guard';
import { collectAllCodes } from '../common/codes';
import { buildEan13, tenantPrefix } from '../common/ean13';
import { PublicCatalogService } from '../public-catalog/public-catalog.service';
import { parseBulkCreateText, scoreCatalogNameMatch } from './bulk-create-text';
import { roundPriceUpToStep } from './round-price';

export type ProductCatalogQuery = {
  q?: string;
  categoryId?: string;
  excludeCategoryIds?: string[];
  brand?: string;
  provider?: string;
  type?: string;
  subcategory?: string;
  presentation?: string;
  stockControl?: boolean;
  status: 'active' | 'inactive' | 'all';
  hasStock?: boolean;
  lowStock?: boolean;
  sort: 'name' | 'price' | 'cost' | 'stock' | 'updatedAt' | 'brand' | 'category';
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
};

export type ProductBulkInput = {
  ids: string[];
  action:
    | 'setPrice'
    | 'applyMarkup'
    | 'adjustPrice'
    | 'setCategory'
    | 'setBrand'
    | 'setIva'
    | 'setStock'
    | 'adjustStock'
    | 'setStockControl'
    | 'setActive'
    | 'setSilent'
    | 'stopSync'
    | 'delete';
  value?: unknown;
};

type ProviderFacetGroup = { sourceProvider: string | null; _count: { _all: number } };

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PublicCatalogService))
    private publicCatalog: PublicCatalogService,
    private consignment: ConsignmentService,
  ) {}

  private queuePublicCatalogSync(businessId: string, productId: string) {
    void this.publicCatalog.publishFromProduct(businessId, productId).catch((err) => {
      this.logger.warn(
        `No se pudo sincronizar producto ${productId} al catálogo: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  private maybeQueueCatalogSync(
    businessId: string,
    product: { id: string; isActive?: boolean; incomplete?: boolean; sourcePublicProductId?: string | null },
  ) {
    if (product.sourcePublicProductId) return;
    if (product.incomplete) return;
    if (product.isActive === false) return;
    this.queuePublicCatalogSync(businessId, product.id);
  }

  /**
   * Descuenta stock. Con control de stock: FIFO por lotes (o stock total si no hay lotes).
   * Sin control: igual baja Product.stock (antes era no-op y las ventas/ajustes no descontaban).
   */
  async deductStockFromBatches(productId: string, businessId: string, qty: number): Promise<void> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new BadRequestException('Producto no encontrado');
    if (qty <= 0) return;
    if (!product.stockControl) {
      await this.prisma.product.update({
        where: { id: productId },
        data: { stock: Math.max(0, product.stock - qty) },
      });
      return;
    }
    const batches = await this.prisma.productBatch.findMany({
      where: { productId, businessId, qty: { gt: 0 } },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (batches.length === 0) {
      const newStock = Math.max(0, product.stock - qty);
      await this.prisma.product.update({
        where: { id: productId },
        data: { stock: newStock },
      });
      return;
    }
    let remaining = qty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.qty, remaining);
      remaining -= deduct;
      const newQty = batch.qty - deduct;
      if (newQty <= 0) {
        await this.prisma.productBatch.delete({ where: { id: batch.id } });
      } else {
        await this.prisma.productBatch.update({
          where: { id: batch.id },
          data: { qty: newQty },
        });
      }
    }
    await this.prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: qty } },
    });
  }

  async search(
    businessId: string,
    q: string,
    limit = 20,
    excludeCombos = false,
    excludeCategoryIds: string[] = [],
  ) {
    const term = q.trim();
    if (!term) return [];
    const byBarcode = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { barcode: term },
          { eanBox: term },
          { supplierSku: term },
          { supplierRef: term },
          { externalId: term },
          ...(term.length >= 6 ? [{ allCodes: { contains: term } as const }] : []),
        ],
      },
      take: 1,
      include: { category: true },
    });
    if (byBarcode.length) return byBarcode.map(decorateProductUnits);
    const tokens = term.split(/\s+/).filter(Boolean);
    try {
      const firstToken = tokens[0];
      const tokenConditions = tokens.map((token) => {
        const contains = `%${token}%`;
        return Prisma.sql`(
          unaccent(lower(p."name")) LIKE unaccent(lower(${contains}))
          OR unaccent(lower(COALESCE(p."brand", ''))) LIKE unaccent(lower(${contains}))
          OR COALESCE(p."barcode", '') ILIKE ${contains}
          OR COALESCE(p."eanBox", '') ILIKE ${contains}
          OR COALESCE(p."supplierSku", '') ILIKE ${contains}
          OR COALESCE(p."supplierRef", '') ILIKE ${contains}
          OR COALESCE(p."externalId", '') ILIKE ${contains}
          OR COALESCE(p."allCodes", '') ILIKE ${contains}
        )`;
      });
      const firstContains = `%${firstToken}%`;
      const firstStarts = `${firstToken}%`;
      // Coincidencia aproximada por código (comparte una parte; ej. Tokin ARC-... vs barcode).
      const { match: fuzzyClause, sim: simSelect } = fuzzyCodeClause(
        term, tokens, 'p',
        ['barcode', 'eanBox', 'supplierSku', 'supplierRef', 'externalId', 'allCodes'],
      );
      const excludedCategories = excludeCategoryIds.length
        ? Prisma.sql`AND (p."categoryId" IS NULL OR p."categoryId" NOT IN (${Prisma.join(excludeCategoryIds)}))`
        : Prisma.empty;
      const excludedCombos = excludeCombos
        ? Prisma.sql`AND NOT EXISTS (
            SELECT 1 FROM "Category" c
            WHERE c."id" = p."categoryId" AND lower(c."name") = lower('combo')
          )`
        : Prisma.empty;
      const raw = await this.prisma.$queryRaw<Array<{ id: string; score: number; matched: string; sim: number }>>(Prisma.sql`
        SELECT p."id",
          CASE
            WHEN p."barcode" = ${term} OR p."eanBox" = ${term} OR p."supplierSku" = ${term}
              OR p."supplierRef" = ${term} OR p."externalId" = ${term} THEN 0
            WHEN unaccent(lower(p."name")) LIKE unaccent(lower(${firstStarts})) THEN 1
            WHEN unaccent(lower(p."name")) LIKE unaccent(lower(${firstContains})) THEN 2
            WHEN COALESCE(p."barcode", '') ILIKE ${firstContains}
              OR COALESCE(p."eanBox", '') ILIKE ${firstContains}
              OR COALESCE(p."supplierSku", '') ILIKE ${firstContains}
              OR COALESCE(p."supplierRef", '') ILIKE ${firstContains}
              OR COALESCE(p."externalId", '') ILIKE ${firstContains}
              OR COALESCE(p."allCodes", '') ILIKE ${firstContains} THEN 3
            WHEN unaccent(lower(COALESCE(p."brand", ''))) LIKE unaccent(lower(${firstContains})) THEN 4
            ELSE 5
          END AS score,
          CASE
            WHEN p."eanBox" = ${term} THEN 'bulto'
            WHEN p."supplierSku" = ${term} THEN 'sku'
            WHEN p."supplierRef" = ${term} THEN 'ref'
            WHEN p."barcode" = ${term} OR p."externalId" = ${term} THEN 'codigo'
            WHEN unaccent(lower(p."name")) LIKE unaccent(lower(${firstContains})) THEN 'nombre'
            WHEN COALESCE(p."barcode", '') ILIKE ${firstContains} OR COALESCE(p."externalId", '') ILIKE ${firstContains} THEN 'codigo'
            WHEN COALESCE(p."supplierSku", '') ILIKE ${firstContains} THEN 'sku'
            WHEN COALESCE(p."supplierRef", '') ILIKE ${firstContains} THEN 'ref'
            WHEN COALESCE(p."eanBox", '') ILIKE ${firstContains} THEN 'bulto'
            WHEN unaccent(lower(COALESCE(p."brand", ''))) LIKE unaccent(lower(${firstContains})) THEN 'marca'
            ELSE 'nombre'
          END AS matched,
          ${simSelect} AS sim
        FROM "Product" p
        WHERE p."businessId" = ${businessId}
          AND p."isActive" = true
          AND (${Prisma.join(tokenConditions, ' AND ')} ${fuzzyClause})
          ${excludedCategories}
          ${excludedCombos}
        ORDER BY score ASC, sim DESC, p."name" ASC
        LIMIT ${limit}
      `);
      const ids = raw.map((row) => row.id);
      if (!ids.length) return [];
      const products = await this.prisma.product.findMany({
        where: { id: { in: ids }, businessId },
        include: { category: true },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      const matchedById = new Map(raw.map((row) => [row.id, row.matched]));
      return ids.flatMap((id) => {
        const product = productsById.get(id);
        return product
          ? [{ ...decorateProductUnits(product), matched: matchedById.get(id) ?? 'nombre' }]
          : [];
      });
    } catch (error) {
      this.logger.warn(
        `Búsqueda SQL avanzada no disponible; se usa fallback Prisma: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return this.searchWithPrismaFallback(businessId, tokens, limit, excludeCombos, excludeCategoryIds);
  }

  private async searchWithPrismaFallback(
    businessId: string,
    tokens: string[],
    limit: number,
    excludeCombos: boolean,
    excludeCategoryIds: string[],
  ) {
    const results = await this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        AND: [
          ...tokens.map((token) => ({
            OR: [
              { name: { contains: token, mode: 'insensitive' as const } },
              { barcode: { contains: token } },
              { eanBox: { contains: token } },
              { supplierSku: { contains: token, mode: 'insensitive' as const } },
              { supplierRef: { contains: token, mode: 'insensitive' as const } },
              { externalId: { contains: token, mode: 'insensitive' as const } },
              { allCodes: { contains: token, mode: 'insensitive' as const } },
              { brand: { contains: token, mode: 'insensitive' as const } },
            ],
          })),
          ...(excludeCategoryIds.length
            ? [{ OR: [{ categoryId: null }, { categoryId: { notIn: excludeCategoryIds } }] }]
            : []),
        ],
        ...(excludeCombos && {
          NOT: {
            category: { is: { name: { equals: 'combo', mode: 'insensitive' } } },
          },
        }),
      },
      take: limit,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    return results.map((product) => ({ ...decorateProductUnits(product), matched: 'nombre' }));
  }

  async list(businessId: string, categoryId?: string, lowStock?: boolean) {
    const where: Record<string, unknown> = { businessId, isActive: true };
    if (categoryId) where.categoryId = categoryId;
    let list = await this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    if (lowStock)
      list = list.filter((p: { stockControl: boolean; stock: number; minStock: number }) => p.stockControl && p.stock <= p.minStock);
    return list.map(decorateProductUnits);
  }

  private looksLikeCodeQuery(q: string) {
    const term = q.trim();
    if (!term || /\s/.test(term)) return false;
    return /^\d{8,14}$/.test(term) || /^[a-z0-9._\/-]{6,}$/i.test(term);
  }

  private async findExactCatalogCodeIds(businessId: string, term: string) {
    const rows = await this.prisma.product.findMany({
      where: {
        businessId,
        OR: [
          { barcode: term },
          { eanBox: term },
          { supplierSku: term },
          { supplierRef: term },
          { externalId: term },
          ...(term.length >= 6 ? [{ allCodes: { contains: term } as const }] : []),
        ],
      },
      select: { id: true, barcode: true, eanBox: true, supplierSku: true, supplierRef: true, externalId: true, allCodes: true },
    });
    // Preferí igualdad exacta de campo; allCodes contains solo si el token está aislado.
    return rows
      .filter((row) => {
        if ([row.barcode, row.eanBox, row.supplierSku, row.supplierRef, row.externalId].includes(term)) return true;
        return (row.allCodes ?? '').split(/\s+/).includes(term);
      })
      .map((row) => row.id);
  }

  async catalog(businessId: string, query: ProductCatalogQuery) {
    let where: Record<string, unknown>;
    const rawQ = query.q?.trim() ?? '';
    const tokens = rawQ.split(/\s+/).filter(Boolean);
    let rankedIds: string[] | null = null;
    const codeQuery = this.looksLikeCodeQuery(rawQ);

    if (codeQuery) {
      const exactIds = await this.findExactCatalogCodeIds(businessId, rawQ);
      if (exactIds.length) {
        where = this.catalogWhere(businessId, { ...query, q: undefined });
        where.id = { in: exactIds };
        rankedIds = exactIds;
      }
    }

    if (!rankedIds && tokens.length) {
      try {
        const tokenConditions = tokens.map((token) => {
          const contains = `%${token}%`;
          return Prisma.sql`(
            unaccent(lower(p."name")) LIKE unaccent(lower(${contains}))
            OR unaccent(lower(COALESCE(p."brand", ''))) LIKE unaccent(lower(${contains}))
            OR COALESCE(p."barcode", '') ILIKE ${contains}
            OR COALESCE(p."eanBox", '') ILIKE ${contains}
            OR COALESCE(p."supplierSku", '') ILIKE ${contains}
            OR COALESCE(p."supplierRef", '') ILIKE ${contains}
            OR COALESCE(p."externalId", '') ILIKE ${contains}
            OR COALESCE(p."allCodes", '') ILIKE ${contains}
          )`;
        });
        // Si parece código y no hubo exacto, igual buscamos parciales; si es texto, también fuzzy.
        const { match: fuzzy } = fuzzyCodeClause(
          rawQ, tokens, 'p',
          ['barcode', 'eanBox', 'supplierSku', 'supplierRef', 'externalId', 'allCodes'],
        );
        const firstToken = tokens[0];
        const firstContains = `%${firstToken}%`;
        const firstStarts = `${firstToken}%`;
        const matches = await this.prisma.$queryRaw<Array<{ id: string; score: number }>>(Prisma.sql`
          SELECT p."id",
            CASE
              WHEN p."barcode" = ${rawQ} OR p."eanBox" = ${rawQ} OR p."supplierSku" = ${rawQ}
                OR p."supplierRef" = ${rawQ} OR p."externalId" = ${rawQ} THEN 0
              WHEN unaccent(lower(p."name")) LIKE unaccent(lower(${firstStarts})) THEN 1
              WHEN unaccent(lower(p."name")) LIKE unaccent(lower(${firstContains})) THEN 2
              WHEN COALESCE(p."barcode", '') ILIKE ${firstContains}
                OR COALESCE(p."eanBox", '') ILIKE ${firstContains}
                OR COALESCE(p."supplierSku", '') ILIKE ${firstContains}
                OR COALESCE(p."supplierRef", '') ILIKE ${firstContains}
                OR COALESCE(p."externalId", '') ILIKE ${firstContains}
                OR COALESCE(p."allCodes", '') ILIKE ${firstContains} THEN 3
              WHEN unaccent(lower(COALESCE(p."brand", ''))) LIKE unaccent(lower(${firstContains})) THEN 4
              ELSE 5
            END AS score
          FROM "Product" p
          WHERE p."businessId" = ${businessId}
            AND (${Prisma.join(tokenConditions, ' AND ')} ${codeQuery ? Prisma.empty : fuzzy})
          ORDER BY score ASC, p."name" ASC
        `);
        where = this.catalogWhere(businessId, { ...query, q: undefined });
        where.id = { in: matches.map((match) => match.id) };
        rankedIds = matches.map((match) => match.id);
      } catch (error) {
        this.logger.warn(
          `Búsqueda avanzada del catálogo no disponible; se usa fallback Prisma: ${error instanceof Error ? error.message : String(error)}`,
        );
        where = this.catalogWhere(businessId, query);
      }
    } else if (!rankedIds) {
      where = this.catalogWhere(businessId, query);
    }

    const skip = (query.page - 1) * query.pageSize;
    const preferRelevance = Boolean(rankedIds) && (codeQuery || query.sort === 'name');
    if (preferRelevance && rankedIds) {
      const matched = await this.prisma.product.findMany({
        where: where!,
        select: { id: true },
      });
      const allowed = new Set(matched.map((row) => row.id));
      const orderedIds = rankedIds.filter((id) => allowed.has(id));
      const total = orderedIds.length;
      const pageIds = orderedIds.slice(skip, skip + query.pageSize);
      if (!pageIds.length) {
        return { items: [], total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) || 0 };
      }
      const items = await this.prisma.product.findMany({
        where: { ...where!, id: { in: pageIds } },
        include: { category: true },
      });
      const order = new Map(pageIds.map((id, index) => [id, index]));
      items.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
      return {
        items: items.map(decorateProductUnits),
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      };
    }

    const orderBy =
      query.sort === 'category'
        ? { category: { name: query.dir } }
        : { [query.sort]: query.dir };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: where!,
        include: { category: true },
        orderBy: orderBy as any,
        skip,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where: where! }),
    ]);
    return {
      items: items.map(decorateProductUnits),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async facets(businessId: string) {
    const where = { businessId, isActive: true };
    const [providerGroups, brandGroups, categoryGroups, typeGroups] = await Promise.all([
      (this.prisma.product as any).groupBy({
        by: ['sourceProvider'],
        where,
        _count: { _all: true },
      }) as Promise<ProviderFacetGroup[]>,
      this.prisma.product.groupBy({ by: ['brand'], where, _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['format'], where, _count: { _all: true } }),
    ]);
    const categoryIds = categoryGroups.flatMap((row) => (row.categoryId ? [row.categoryId] : []));
    const categories = await this.prisma.category.findMany({
      where: { businessId, id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const byCount = <T extends { count: number }>(rows: T[]) => rows.sort((a, b) => b.count - a.count);
    return {
      providers: byCount(
        providerGroups
          .filter((row) => row.sourceProvider?.trim())
          .map((row) => ({ value: row.sourceProvider!, label: row.sourceProvider!, count: row._count._all })),
      ),
      brands: byCount(
        brandGroups
          .filter((row) => row.brand?.trim())
          .map((row) => ({ value: row.brand!, count: row._count._all })),
      ).slice(0, 200),
      categories: byCount(
        categoryGroups.flatMap((row) => {
          const name = row.categoryId ? categoryNames.get(row.categoryId) : undefined;
          return row.categoryId && name ? [{ id: row.categoryId, name, count: row._count._all }] : [];
        }),
      ),
      types: byCount(
        typeGroups
          .filter((row) => row.format?.trim())
          .map((row) => ({ value: row.format!, count: row._count._all })),
      ),
    };
  }

  /**
   * Resumen de rentabilidad actual (markup %) de productos seleccionados,
   * para prellenar el diálogo de “Aplicar rentabilidad”.
   */
  async bulkMarkupInfo(businessId: string, ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Indicá al menos un producto.');
    }
    const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: unique } },
      select: { id: true, cost: true, price: true },
    });

    const markups: number[] = [];
    let withoutCost = 0;
    for (const product of products) {
      if (product.cost == null || Number(product.cost) <= 0) {
        withoutCost += 1;
        continue;
      }
      const cost = Number(product.cost);
      const price = Number(product.price);
      const markup = Math.round(((price - cost) / cost) * 10000) / 100;
      markups.push(markup);
    }

    const minMarkup = markups.length ? Math.min(...markups) : null;
    const maxMarkup = markups.length ? Math.max(...markups) : null;
    const avgMarkup = markups.length
      ? Math.round((markups.reduce((sum, value) => sum + value, 0) / markups.length) * 100) / 100
      : null;
    const commonMarkup =
      markups.length > 0 && markups.every((value) => Math.abs(value - markups[0]) < 0.05)
        ? Math.round(markups[0] * 100) / 100
        : null;

    return {
      total: products.length,
      withCost: markups.length,
      withoutCost,
      minMarkup,
      maxMarkup,
      avgMarkup,
      commonMarkup,
    };
  }

  async bulk(businessId: string, input: ProductBulkInput) {
    if (!Array.isArray(input?.ids) || input.ids.length === 0) {
      throw new BadRequestException('Indicá al menos un producto.');
    }
    const actions: ProductBulkInput['action'][] = [
      'setPrice',
      'applyMarkup',
      'adjustPrice',
      'setCategory',
      'setBrand',
      'setIva',
      'setStock',
      'adjustStock',
      'setStockControl',
      'setActive',
      'setSilent',
      'stopSync',
      'delete',
    ];
    if (!actions.includes(input.action)) throw new BadRequestException('Acción masiva inválida.');

    const ids = [...new Set(input.ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: ids } },
      select: { id: true, cost: true, price: true, stock: true },
    });
    const allowedIds = products.map((product) => product.id);
    const foundIds = new Set(allowedIds);
    const skipped = ids
      .filter((id) => !foundIds.has(id))
      .map((id) => ({ id, reason: 'Producto no encontrado en el negocio.' }));

    if (input.action === 'applyMarkup') {
      const markup = this.numericBulkValue(input.value, 'El porcentaje de markup');
      let updated = 0;
      for (const product of products) {
        if (product.cost == null) {
          skipped.push({ id: product.id, reason: 'El producto no tiene costo.' });
          continue;
        }
        const price = Math.round(Number(product.cost) * (1 + markup / 100) * 100) / 100;
        await this.prisma.product.updateMany({
          where: { id: product.id, businessId },
          data: { price: new Decimal(price) },
        });
        updated++;
      }
      return { updated, skipped };
    }

    if (input.action === 'adjustPrice') {
      const percentage = this.numericBulkValue(input.value, 'El porcentaje de ajuste');
      if (percentage < -100) throw new BadRequestException('El ajuste no puede dejar el precio debajo de cero.');
      await this.prisma.$transaction(
        products.map((product) => {
          const price = Math.round(Number(product.price) * (1 + percentage / 100) * 100) / 100;
          return this.prisma.product.updateMany({
            where: { id: product.id, businessId },
            data: { price: new Decimal(price) },
          });
        }),
      );
      return { updated: products.length, skipped };
    }

    if (input.action === 'adjustStock') {
      const delta = this.integerBulkValue(input.value, 'El ajuste de stock');
      await this.prisma.$transaction(
        products.map((product) => this.prisma.product.updateMany({
          where: { id: product.id, businessId },
          data: { stock: Math.max(0, product.stock + delta) },
        })),
      );
      return { updated: products.length, skipped };
    }

    if (input.action === 'delete') {
      let updated = 0;
      for (const id of allowedIds) {
        try {
          const result = await this.prisma.product.deleteMany({ where: { id, businessId } });
          updated += result.count;
        } catch {
          skipped.push({ id, reason: 'No se pudo eliminar porque el producto tiene datos relacionados.' });
        }
      }
      return { updated, skipped };
    }

    let data: Record<string, unknown>;
    if (input.action === 'setPrice') {
      const price = this.numericBulkValue(input.value, 'El precio');
      if (price < 0) throw new BadRequestException('El precio no puede ser negativo.');
      data = { price: new Decimal(price) };
    } else if (input.action === 'setCategory') {
      if (typeof input.value !== 'string' || !input.value) {
        throw new BadRequestException('La categoría es inválida.');
      }
      const category = await this.prisma.category.findFirst({
        where: { id: input.value, businessId },
        select: { id: true },
      });
      if (!category) throw new BadRequestException('La categoría no pertenece al negocio.');
      data = { categoryId: category.id };
    } else if (input.action === 'setBrand') {
      if (typeof input.value !== 'string' || !input.value.trim()) throw new BadRequestException('La marca es inválida.');
      data = { brand: input.value.trim() };
    } else if (input.action === 'setIva') {
      const iva = this.numericBulkValue(input.value, 'El IVA');
      if (iva < 0 || iva > 100) throw new BadRequestException('El IVA debe estar entre 0 y 100.');
      data = { iva: new Decimal(iva) };
    } else if (input.action === 'setStock') {
      const stock = this.integerBulkValue(input.value, 'El stock');
      if (stock < 0) throw new BadRequestException('El stock no puede ser negativo.');
      data = { stock };
    } else if (input.action === 'stopSync') {
      data = { sourceConnectionId: null, sourceProvider: null };
    } else {
      if (typeof input.value !== 'boolean') throw new BadRequestException('El valor debe ser booleano.');
      data =
        input.action === 'setStockControl' ? { stockControl: input.value }
        : input.action === 'setSilent' ? { silent: input.value }
        : { isActive: input.value };
    }
    const result = await this.prisma.product.updateMany({
      where: { businessId, id: { in: allowedIds } },
      data,
    });
    return { updated: result.count, skipped };
  }

  async exportSelectedCsv(businessId: string, ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException('Indicá al menos un producto.');
    const uniqueIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: uniqueIds } },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = products.map((product) => [
      product.name,
      product.category?.name ?? '',
      product.brand ?? '',
      product.barcode ?? '',
      Number(product.price).toFixed(2),
      product.cost == null ? '' : Number(product.cost).toFixed(2),
      product.stock,
      product.iva == null ? '' : Number(product.iva).toFixed(2),
    ].map(cell).join(';'));
    return `\uFEFF${['nombre', 'categoria', 'marca', 'EAN', 'precio', 'costo', 'stock', 'IVA'].map(cell).join(';')}\n${rows.join('\n')}`;
  }

  async duplicates(businessId: string) {
    const barcodeGroups = await this.prisma.product.groupBy({
      by: ['barcode'],
      where: { businessId, isActive: true, barcode: { not: null } },
      _count: { _all: true },
    });
    const duplicateGroups = barcodeGroups
      .filter((group) => !!group.barcode?.trim() && group._count._all >= 2)
      .sort((a, b) => b._count._all - a._count._all);
    const barcodes = duplicateGroups.map((group) => group.barcode!);
    const products = await this.prisma.product.findMany({
      where: { businessId, isActive: true, barcode: { in: barcodes } },
      select: { id: true, name: true, barcode: true, brand: true, cost: true, price: true, sourceProvider: true, stock: true },
      orderBy: { name: 'asc' },
    });
    const byBarcode = new Map<string, typeof products>();
    for (const product of products) {
      if (!product.barcode) continue;
      const list = byBarcode.get(product.barcode) ?? [];
      list.push(product);
      byBarcode.set(product.barcode, list);
    }
    return duplicateGroups.map((group) => ({
      barcode: group.barcode!,
      count: group._count._all,
      products: (byBarcode.get(group.barcode!) ?? []).map(({ barcode: _barcode, ...product }) => product),
    }));
  }

  async mergeDuplicates(businessId: string, keepId: string, mergeIds: string[]) {
    if (typeof keepId !== 'string' || !Array.isArray(mergeIds) || mergeIds.length === 0) {
      throw new BadRequestException('Indicá el producto a conservar y los productos a fusionar.');
    }
    const ids = [keepId, ...new Set(mergeIds.filter((id) => id !== keepId))];
    if (ids.length < 2) throw new BadRequestException('No hay productos distintos para fusionar.');
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: ids } },
      select: { id: true, barcode: true },
    });
    if (products.length !== ids.length) throw new BadRequestException('Algún producto no pertenece al negocio.');
    const barcode = products[0]?.barcode;
    if (!barcode?.trim() || products.some((product) => product.barcode !== barcode)) {
      throw new BadRequestException('Los productos deben compartir el mismo código de barras.');
    }
    const idsToMerge = ids.filter((id) => id !== keepId);
    const result = await this.prisma.product.updateMany({
      where: { businessId, id: { in: idsToMerge } },
      data: { isActive: false },
    });
    return { keptId: keepId, merged: result.count };
  }

  private numericBulkValue(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${label} debe ser un número válido.`);
    }
    return value;
  }

  private integerBulkValue(value: unknown, label: string): number {
    const number = this.numericBulkValue(value, label);
    if (!Number.isInteger(number)) throw new BadRequestException(`${label} debe ser un número entero.`);
    return number;
  }

  private catalogWhere(businessId: string, query: ProductCatalogQuery): Record<string, unknown> {
    const tokens = query.q?.trim().split(/\s+/).filter(Boolean) ?? [];
    const and: Record<string, unknown>[] = tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' } },
        { barcode: { contains: token } },
        { eanBox: { contains: token } },
        { brand: { contains: token, mode: 'insensitive' } },
        { supplierSku: { contains: token, mode: 'insensitive' } },
        { supplierRef: { contains: token, mode: 'insensitive' } },
        { externalId: { contains: token, mode: 'insensitive' } },
        { allCodes: { contains: token, mode: 'insensitive' } },
      ],
    }));
    if (query.provider) {
      and.push({
        OR: [
          { sourceProvider: { equals: query.provider, mode: 'insensitive' } },
          { sourceConnectionId: query.provider },
        ],
      });
    }
    if (query.excludeCategoryIds?.length) {
      and.push({
        OR: [
          { categoryId: null },
          { categoryId: { notIn: query.excludeCategoryIds } },
        ],
      });
    }
    if (query.lowStock) {
      and.push({
        stockControl: true,
        stock: { lte: this.prisma.product.fields.minStock },
      });
    }
    const where: Record<string, unknown> = {
      businessId,
      ...(query.status !== 'all' && { isActive: query.status === 'active' }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.brand && { brand: { equals: query.brand, mode: 'insensitive' } }),
      ...(query.type && { format: { equals: query.type, mode: 'insensitive' } }),
      ...(query.subcategory && { subcategory: { equals: query.subcategory, mode: 'insensitive' } }),
      ...(query.presentation && { presentation: { equals: query.presentation, mode: 'insensitive' } }),
      ...(query.stockControl !== undefined && { stockControl: query.stockControl }),
      ...(query.hasStock && { stock: { gt: 0 } }),
      ...(and.length && { AND: and }),
    };
    return where;
  }

  async create(businessId: string, data: {
    name: string;
    barcode?: string;
    categoryId?: string;
    cost?: number;
    price: number;
    stock?: number;
    minStock?: number;
    stockControl?: boolean;
    brand?: string;
    iva?: number;
    expiresAt?: string;
    imageUrl?: string;
    unitsPerBox?: string;
    weight?: string;
    format?: string;
    flavor?: string;
    presentation?: string;
    subcategory?: string;
    supplierSku?: string;
    externalId?: string;
    incomplete?: boolean;
    silent?: boolean;
    sourcePublicProductId?: string;
  }) {
    await assertProductLimit(this.prisma, businessId);
    const initialStock = Math.max(0, Math.floor(data.stock ?? 0));
    const product = await this.prisma.product.create({
      data: {
        businessId,
        name: data.name,
        barcode: data.barcode,
        categoryId: data.categoryId,
        cost: data.cost != null ? new Decimal(data.cost) : null,
        price: new Decimal(data.price),
        stock: 0,
        minStock: data.minStock ?? 0,
        stockControl: data.stockControl ?? true,
        brand: data.brand,
        iva: data.iva != null ? new Decimal(data.iva) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        imageUrl: typeof data.imageUrl === 'string' && /^https?:\/\//i.test(data.imageUrl.trim())
          ? data.imageUrl.trim()
          : undefined,
        unitsPerBox: data.unitsPerBox,
        weight: data.weight,
        format: data.format,
        flavor: data.flavor,
        presentation: data.presentation,
        subcategory: data.subcategory,
        supplierSku: data.supplierSku,
        externalId: data.externalId,
        incomplete: data.incomplete ?? false,
        silent: data.silent ?? false,
        sourcePublicProductId: data.sourcePublicProductId || undefined,
        allCodes: collectAllCodes(null, [data.barcode, data.supplierSku, data.externalId]),
      },
      include: { category: true },
    });
    if (initialStock > 0) {
      const adjusted = await this.adjustStock(product.id, businessId, initialStock, 'stock_inicial');
      if (adjusted) this.maybeQueueCatalogSync(businessId, adjusted);
      return adjusted;
    }
    await this.prisma.stockMove.create({
      data: {
        productId: product.id,
        qty: 0,
        reason: 'alta_producto',
      },
    });
    this.maybeQueueCatalogSync(businessId, product);
    return product;
  }

  async quick(
    businessId: string,
    data: {
      name: string;
      price: number;
      barcode?: string;
      imageUrl?: string;
      silent?: boolean;
      consigned?: boolean;
      consignmentPartyId?: string | null;
      consignmentCommissionPercent?: number | null;
    },
  ) {
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    const price = Number(data?.price);
    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    if (!Number.isFinite(price) || price < 0) {
      throw new BadRequestException('El precio debe ser un número mayor o igual a cero.');
    }
    const imageUrl = typeof data.imageUrl === 'string' && /^https?:\/\//i.test(data.imageUrl.trim())
      ? data.imageUrl.trim()
      : undefined;
    const flags = quickProductFlags({ silent: data.silent });
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    // Teatro siempre controla stock (aunque el alta rápida en otros locales lo deje off).
    const stockControl =
      business && this.isTeatroTenant(business.name, business.id) ? true : flags.stockControl;
    const percent =
      data.consignmentCommissionPercent == null || data.consignmentCommissionPercent === ('' as unknown)
        ? null
        : Number(data.consignmentCommissionPercent);
    if (data.consigned && percent != null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      throw new BadRequestException('El porcentaje de comisión tiene que estar entre 0 y 100.');
    }
    const product = await this.create(businessId, {
      name,
      price,
      barcode: typeof data.barcode === 'string' && data.barcode.trim() ? data.barcode.trim() : undefined,
      imageUrl,
      stockControl,
      incomplete: flags.incomplete,
      silent: flags.silent,
    });
    if (!product) throw new BadRequestException('No se pudo crear el producto.');
    if (data.consigned) {
      return decorateProductUnits(
        await this.consignment.assignProduct(businessId, product.id, {
          consigned: true,
          consignmentPartyId: data.consignmentPartyId,
          consignmentCommissionPercent: percent,
        }),
      );
    }
    return decorateProductUnits(product);
  }

  async incomplete(businessId: string) {
    const products = await this.prisma.product.findMany({
      where: { businessId, incomplete: true, isActive: true },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    return products.map(decorateProductUnits);
  }

  async update(id: string, businessId: string, data: Partial<{
    name: string;
    barcode: string;
    categoryId: string;
    cost: number;
    price: number;
    minStock: number;
    stockControl: boolean;
    isActive: boolean;
    incomplete: boolean;
    silent: boolean;
    consigned?: boolean;
    consignmentPartyId?: string | null;
    consignmentCommissionPercent?: number | null;
    brand: string;
    iva: number;
    expiresAt: string;
    imageUrl: string | null;
    unitsPerBox: string;
    weight: string;
    format: string;
    flavor: string;
    presentation: string;
    subcategory: string;
    supplierSku: string;
    externalId: string;
  }>) {
    const update: Record<string, unknown> = { ...data };
    if (data.cost != null) update.cost = new Decimal(data.cost);
    if (data.price != null) update.price = new Decimal(data.price);
    if (data.iva != null) update.iva = new Decimal(data.iva);
    if (data.expiresAt != null) update.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (data.consignmentCommissionPercent !== undefined) {
      update.consignmentCommissionPercent =
        data.consignmentCommissionPercent == null
          ? null
          : new Decimal(data.consignmentCommissionPercent);
    }
    if (data.consigned === false) {
      update.consigned = false;
      update.consignmentPartyId = null;
      update.consignmentCommissionPercent = null;
    }
    if (data.imageUrl !== undefined) {
      const url = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '';
      update.imageUrl = url && /^https?:\/\//i.test(url) ? url : null;
    }
    if (data.barcode != null || data.supplierSku != null || data.externalId != null) {
      const current = await this.prisma.product.findFirst({ where: { id, businessId } });
      if (current) {
        update.allCodes = collectAllCodes(null, [
          data.barcode ?? current.barcode,
          data.supplierSku ?? current.supplierSku,
          current.eanBox,
          current.supplierRef,
          data.externalId ?? current.externalId,
          current.allCodes,
        ]);
      }
    }
    const updated = await this.prisma.product.update({
      where: { id, businessId },
      data: update,
      include: { category: true, consignmentParty: true },
    });
    this.maybeQueueCatalogSync(businessId, updated);
    return updated;
  }

  async adjustStock(id: string, businessId: string, qty: number, reason: string, reference?: string) {
    const product = await this.prisma.product.findFirst({ where: { id, businessId } });
    if (!product) return null;
    if (!Number.isFinite(qty) || qty === 0) {
      throw new BadRequestException('La cantidad del ajuste debe ser distinta de cero.');
    }
    await this.prisma.stockMove.create({
      data: { productId: id, qty, reason, reference },
    });
    if (qty < 0) {
      const abs = Math.abs(qty);
      // Con control de stock: FIFO por lotes. Sin control: bajar Product.stock igual
      // (antes el egreso era no-op y el usuario veía el mismo número tras “ajustar”).
      if (product.stockControl) {
        await this.deductStockFromBatches(id, businessId, abs);
      } else {
        await this.prisma.product.update({
          where: { id },
          data: { stock: Math.max(0, product.stock - abs) },
        });
      }
    } else {
      await this.prisma.productBatch.create({
        data: {
          productId: id,
          businessId,
          qty,
          unitCost: product.cost ?? new Decimal(0),
          purchaseItemId: null,
        },
      });
      await this.prisma.product.update({
        where: { id },
        data: { stock: { increment: qty } },
      });
    }
    return this.prisma.product.findFirst({
      where: { id, businessId },
      include: { category: true, batches: true },
    });
  }

  /**
   * Módulo Stock rápido: escaneás un código y ajusta el stock ±1 (ingreso/egreso).
   * Match EXACTO por cualquiera de los códigos del producto. Pensado para escaneos rápidos.
   */
  async scanMove(businessId: string, code: string, direction: 'in' | 'out') {
    const clean = String(code ?? '').trim();
    if (!clean) throw new BadRequestException('Código vacío.');
    // 1) match exacto por columnas de código
    let product = await this.prisma.product.findFirst({
      where: {
        businessId,
        isActive: true,
        OR: [
          { barcode: clean },
          { eanBox: clean },
          { supplierSku: clean },
          { supplierRef: clean },
          { externalId: clean },
        ],
      },
      select: { id: true, name: true, stock: true, stockControl: true, barcode: true, imageUrl: true },
    });
    // 2) fallback exacto dentro de allCodes (token completo, no substring)
    if (!product && clean.length >= 4) {
      const candidates = await this.prisma.product.findMany({
        where: { businessId, isActive: true, allCodes: { contains: clean } },
        select: { id: true, name: true, stock: true, stockControl: true, barcode: true, imageUrl: true, allCodes: true },
        take: 20,
      });
      const hit = candidates.find((c) => (c.allCodes ?? '').split(/\s+/).includes(clean));
      if (hit) {
        const { allCodes: _allCodes, ...rest } = hit;
        product = rest;
      }
    }
    if (!product) return { found: false as const, code: clean };

    const reason = direction === 'out' ? 'egreso_escaneo' : 'ingreso_escaneo';
    if (direction === 'in') {
      await this.adjustStock(product.id, businessId, 1, reason);
    } else {
      // egreso: registramos el movimiento y bajamos 1 (contemplando productos sin control de stock)
      await this.prisma.stockMove.create({ data: { productId: product.id, qty: -1, reason } });
      if (product.stockControl) {
        await this.deductStockFromBatches(product.id, businessId, 1);
      } else {
        await this.prisma.product.update({
          where: { id: product.id },
          data: { stock: Math.max(0, product.stock - 1) },
        });
      }
    }
    const updated = await this.prisma.product.findFirst({
      where: { id: product.id },
      select: { id: true, name: true, stock: true, barcode: true, imageUrl: true },
    });
    return { found: true as const, product: updated, qty: direction === 'out' ? -1 : 1 };
  }

  async getOne(id: string, businessId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, businessId },
      include: {
        category: true,
        consignmentParty: true,
        batches: { orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!p) return null;
    return decorateProductUnits(p);
  }

  /** Busca un código de barras en bases públicas (Open Food Facts) para identificar qué producto es. */
  async barcodeLookup(code: string) {
    const c = String(code ?? '').trim();
    if (!/^\d{8,14}$/.test(c)) return { found: false as const };
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=product_name,product_name_es,brands,image_url,quantity`,
        { headers: { 'User-Agent': 'StockRapido/1.0 (kiosco POS)' } },
      );
      if (!res.ok) return { found: false as const };
      const json: any = await res.json();
      if (json?.status === 1 && json?.product) {
        const p = json.product;
        const name = (p.product_name_es || p.product_name || '').trim();
        if (name) {
          return {
            found: true as const,
            name,
            brand: (p.brands || '').split(',')[0]?.trim() || null,
            quantity: p.quantity || null,
            image: p.image_url || null,
            source: 'Open Food Facts',
          };
        }
      }
    } catch (error) {
      this.logger.warn(`Lookup de código público falló: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { found: false as const };
  }

  /** Asocia un código (ej. de barras escaneado) a un producto, para que la próxima búsqueda sea exacta. */
  async addCode(id: string, businessId: string, code: string, opts?: { keepPrimary?: boolean }) {
    const clean = String(code ?? '').trim();
    if (clean.length < 3 || clean.length > 40) throw new BadRequestException('Código inválido.');
    const p = await this.prisma.product.findFirst({ where: { id, businessId }, select: { id: true, barcode: true, allCodes: true } });
    if (!p) throw new NotFoundException('Producto no encontrado.');
    const codes = new Set((p.allCodes ?? '').split(/\s+/).filter(Boolean));
    codes.add(clean);
    if (p.barcode) codes.add(p.barcode);
    const data: Prisma.ProductUpdateInput = { allCodes: [...codes].join(' ') };
    const keepPrimary = opts?.keepPrimary === true;
    if (!keepPrimary && p.barcode !== clean) data.barcode = clean;
    else if (!p.barcode) data.barcode = clean;
    await this.prisma.product.update({ where: { id }, data });
    return {
      ok: true,
      barcodeSet: !keepPrimary && p.barcode !== clean,
      coexist: Boolean(p.barcode) && p.barcode !== clean,
    };
  }

  /** Suma un código alternativo (ej. EAN de Precios Claros) sin pisar el barcode principal. */
  async addAlternateCode(id: string, businessId: string, code: string) {
    return this.addCode(id, businessId, code, { keepPrimary: true });
  }

  /** Completa Product.allCodes con todos los códigos (columnas + del proveedor vinculado). */
  async backfillAllCodes(businessId: string) {
    const products = await this.prisma.product.findMany({
      where: { businessId },
      select: { id: true, barcode: true, eanBox: true, supplierSku: true, supplierRef: true, externalId: true, sourceConnectionId: true },
    });
    let updated = 0;
    for (const p of products) {
      let syncedCodes: string | null = null;
      if (p.sourceConnectionId && p.externalId) {
        const sp = await this.prisma.syncedProduct.findFirst({
          where: { connectionId: p.sourceConnectionId, externalId: p.externalId },
          select: { allCodes: true },
        });
        syncedCodes = sp?.allCodes ?? null;
      }
      const parts = [p.barcode, p.eanBox, p.supplierSku, p.supplierRef, p.externalId, syncedCodes]
        .filter(Boolean)
        .flatMap((s) => String(s).split(/\s+/));
      const codes = [...new Set(parts.filter((c) => c.length >= 3 && c.length <= 40))].join(' ') || null;
      if (codes) {
        await this.prisma.product.update({ where: { id: p.id }, data: { allCodes: codes } });
        updated += 1;
      }
    }
    return { ok: true, total: products.length, updated };
  }

  async getSupplierData(id: string, businessId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, businessId },
      select: { id: true, sourceConnectionId: true, externalId: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    let syncedProduct = await this.prisma.syncedProduct.findFirst({
      where: { businessId, linkedProductId: product.id },
      include: {
        connection: { select: { id: true, provider: true, name: true } },
        variants: { orderBy: [{ uom: 'asc' }, { multiplier: 'asc' }] },
        priceHistory: { orderBy: { capturedAt: 'asc' } },
      },
      orderBy: { syncedAt: 'desc' },
    });

    if (!syncedProduct && product.sourceConnectionId && product.externalId) {
      syncedProduct = await this.prisma.syncedProduct.findFirst({
        where: {
          businessId,
          connectionId: product.sourceConnectionId,
          externalId: product.externalId,
        },
        include: {
          connection: { select: { id: true, provider: true, name: true } },
          variants: { orderBy: [{ uom: 'asc' }, { multiplier: 'asc' }] },
          priceHistory: { orderBy: { capturedAt: 'asc' } },
        },
      });
    }

    return syncedProduct ? { linked: true, syncedProduct } : { linked: false, syncedProduct: null };
  }

  /**
   * `kind=altas`: solo altas de producto y stock inicial al crear (no compiten con cientos de ventas).
   * `kind=all`: últimos N movimientos de cualquier tipo (ventas, compras, etc.).
   */
  async getAllStockMoves(businessId: string, limit = 300, kind: 'all' | 'altas' | 'escaneo' = 'all') {
    const where =
      kind === 'altas'
        ? {
            product: { businessId },
            reason: { in: ['alta_producto', 'stock_inicial'] },
          }
        : kind === 'escaneo'
          ? {
              product: { businessId },
              reason: { in: ['ingreso_escaneo', 'egreso_escaneo'] },
            }
          : { product: { businessId } };
    return this.prisma.stockMove.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, barcode: true } } },
    });
  }

  async getStockMoves(productId: string, businessId: string, limit = 50) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) return [];
    return this.prisma.stockMove.findMany({
      where: { productId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Exporta Excel con ExcelJS (formato estándar que Excel abre sin problemas). */
  async exportStockExcel(businessId: string): Promise<Buffer> {
    const list = await this.prisma.product.findMany({
      where: { businessId, isActive: true },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stock productos', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'id', key: 'id', width: 28 },
      { header: 'codigo_barras', key: 'codigo_barras', width: 18 },
      { header: 'nombre', key: 'nombre', width: 32 },
      { header: 'categoria', key: 'categoria', width: 18 },
      { header: 'precio', key: 'precio', width: 10 },
      { header: 'costo', key: 'costo', width: 10 },
      { header: 'stock_actual', key: 'stock_actual', width: 14 },
      { header: 'stock_minimo', key: 'stock_minimo', width: 12 },
      { header: 'marca', key: 'marca', width: 14 },
      { header: 'control_stock', key: 'control_stock', width: 12 },
      { header: 'vencimiento', key: 'vencimiento', width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of list) {
      ws.addRow({
        id: p.id,
        codigo_barras: p.barcode ?? '',
        nombre: p.name,
        categoria: p.category?.name ?? '',
        precio: Number(p.price),
        costo: p.cost != null ? Number(p.cost) : '',
        stock_actual: p.stock,
        stock_minimo: p.minStock,
        marca: p.brand ?? '',
        control_stock: p.stockControl ? 'Sí' : 'No',
        vencimiento: p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : '',
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
  }

  /** Parsea Excel y devuelve filas para importar (id/barcode, stock, minStock). */
  parseExcelStock(buffer: Buffer): Array<{ id?: string; barcode?: string; stock: number; minStock?: number }> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return [];
    const ws = wb.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];
    if (rows.length < 2) return [];
    const headerRow = rows[0].map((h) => String(h).toLowerCase().trim().replace(/\s+/g, '_'));
    const idCol = headerRow.indexOf('id');
    const barcodeCol = headerRow.indexOf('codigo_barras') >= 0 ? headerRow.indexOf('codigo_barras') : headerRow.indexOf('barcode');
    const stockCol = headerRow.indexOf('stock_actual') >= 0 ? headerRow.indexOf('stock_actual') : headerRow.indexOf('stock');
    const minStockCol = headerRow.indexOf('stock_minimo') >= 0 ? headerRow.indexOf('stock_minimo') : -1;
    if (stockCol === -1 || (idCol === -1 && barcodeCol === -1)) return [];
    const out: Array<{ id?: string; barcode?: string; stock: number; minStock?: number }> = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as (string | number)[];
      const id = idCol >= 0 ? String(row[idCol] ?? '').trim() : undefined;
      const barcode = barcodeCol >= 0 ? String(row[barcodeCol] ?? '').trim() : undefined;
      if (!id && !barcode) continue;
      const stockNum = Number(row[stockCol]);
      const stock = Number.isNaN(stockNum) || stockNum < 0 ? 0 : Math.floor(stockNum);
      const minStockNum = minStockCol >= 0 ? Number(row[minStockCol]) : undefined;
      const minStock = minStockNum !== undefined && !Number.isNaN(minStockNum) && minStockNum >= 0 ? Math.floor(minStockNum) : undefined;
      out.push({ id: id || undefined, barcode: barcode || undefined, stock, minStock });
    }
    return out;
  }

  private isTeatroTenant(businessName: string, businessId: string): boolean {
    const allow = (process.env.INVENTORY_WIPE_BUSINESS_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (allow.includes(businessId)) return true;
    const n = businessName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return n.includes('teatro');
  }

  private nameSearchTokens(name: string): string[] {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3)
      .slice(0, 4);
  }

  private async findPublicCatalogCandidates(row: {
    barcode?: string;
    name: string;
    brand?: string;
  }) {
    type Pub = {
      id: string;
      name: string;
      brand: string | null;
      category: string | null;
      barcode: string | null;
      imageUrl: string | null;
      unitsPerBox: string | null;
      weight: string | null;
      format: string | null;
      flavor: string | null;
      presentation: string | null;
      subcategory: string | null;
    };

    if (row.barcode?.trim()) {
      const byCode = await this.prisma.publicProduct.findMany({
        where: { status: 'active', barcode: row.barcode.trim() },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      });
      if (byCode.length) {
        return byCode.map((c) => ({ ...c, score: 100 }));
      }
    }

    const name = row.name.trim();
    if (name.length < 2) return [] as Array<Pub & { score: number }>;

    const tokens = this.nameSearchTokens(name);
    const or: Array<Record<string, unknown>> = [
      { name: { equals: name, mode: 'insensitive' } },
      { name: { contains: name, mode: 'insensitive' } },
      { keywords: { contains: name, mode: 'insensitive' } },
    ];
    for (const token of tokens) {
      or.push({ name: { contains: token, mode: 'insensitive' } });
      or.push({ keywords: { contains: token, mode: 'insensitive' } });
    }

    const candidates = await this.prisma.publicProduct.findMany({
      where: { status: 'active', OR: or },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    });

    return candidates
      .map((c) => ({
        ...c,
        score: scoreCatalogNameMatch(name, c.name, c.brand),
      }))
      .filter((c) => c.score >= 50)
      .sort(
        (a, b) =>
          b.score - a.score
          || (b.imageUrl ? 1 : 0) - (a.imageUrl ? 1 : 0)
          || (b.barcode ? 1 : 0) - (a.barcode ? 1 : 0),
      )
      .slice(0, 8);
  }

  private async findLocalCandidates(businessId: string, name: string, barcode?: string) {
    const or: Array<Record<string, unknown>> = [
      { name: { equals: name.trim(), mode: 'insensitive' } },
      { name: { contains: name.trim(), mode: 'insensitive' } },
    ];
    if (barcode?.trim()) or.push({ barcode: barcode.trim() });
    for (const token of this.nameSearchTokens(name)) {
      or.push({ name: { contains: token, mode: 'insensitive' } });
    }

    const candidates = await this.prisma.product.findMany({
      where: { businessId, isActive: true, OR: or },
      select: {
        id: true,
        name: true,
        barcode: true,
        imageUrl: true,
        brand: true,
        price: true,
        stock: true,
        sourcePublicProductId: true,
      },
      take: 30,
      orderBy: { updatedAt: 'desc' },
    });

    return candidates
      .map((c) => ({
        ...c,
        price: Number(c.price),
        score: barcode && c.barcode === barcode
          ? 100
          : scoreCatalogNameMatch(name, c.name, c.brand),
      }))
      .filter((c) => c.score >= 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  private async resolveCategoryIdCached(
    businessId: string,
    name: string | undefined,
    cache: Map<string, string>,
  ): Promise<string | undefined> {
    const trimmed = name?.trim();
    if (!trimmed) return undefined;
    const key = trimmed.toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;
    const existing = await this.prisma.category.findFirst({
      where: { businessId, name: { equals: trimmed, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }
    const createdCat = await this.prisma.category.create({
      data: { businessId, name: trimmed },
    });
    cache.set(key, createdCat.id);
    return createdCat.id;
  }

  /** Preview de carga masiva: sugiere match local o catálogo público por fila. */
  async bulkCreatePreview(businessId: string, text: string) {
    const parsed = parseBulkCreateText(text);
    if (!parsed.rows.length && parsed.errors.length) {
      return { rows: [], parseErrors: parsed.errors };
    }
    if (!parsed.rows.length) {
      throw new BadRequestException('No se encontraron filas válidas para crear.');
    }

    const rows: Array<{
      row: number;
      name: string;
      price: number;
      stock: number;
      cost?: number;
      barcode?: string;
      suggestedAction: 'update_local' | 'link_catalog' | 'create_new';
      suggestedLocal: {
        id: string;
        name: string;
        barcode: string | null;
        imageUrl: string | null;
        brand: string | null;
        price: number;
        stock: number;
        score: number;
      } | null;
      suggestedCatalog: {
        id: string;
        name: string;
        barcode: string | null;
        imageUrl: string | null;
        brand: string | null;
        category: string | null;
        score: number;
      } | null;
      localAlternatives: Array<{
        id: string;
        name: string;
        barcode: string | null;
        imageUrl: string | null;
        brand: string | null;
        price: number;
        stock: number;
        score: number;
      }>;
      catalogAlternatives: Array<{
        id: string;
        name: string;
        barcode: string | null;
        imageUrl: string | null;
        brand: string | null;
        category: string | null;
        score: number;
      }>;
    }> = [];
    for (const row of parsed.rows) {
      const catalog = await this.findPublicCatalogCandidates(row);
      const bestCatalog = catalog[0] ?? null;
      const locals = await this.findLocalCandidates(
        businessId,
        row.name,
        row.barcode || bestCatalog?.barcode || undefined,
      );
      const bestLocal = locals[0] ?? null;

      let suggestedAction: 'update_local' | 'link_catalog' | 'create_new' = 'create_new';
      if (bestLocal && bestLocal.score >= 70) suggestedAction = 'update_local';
      else if (bestCatalog && bestCatalog.score >= 55) suggestedAction = 'link_catalog';

      rows.push({
        row: row.line,
        name: row.name,
        price: row.price,
        stock: row.stock ?? 0,
        cost: row.cost,
        barcode: row.barcode,
        suggestedAction,
        suggestedLocal: bestLocal
          ? {
              id: bestLocal.id,
              name: bestLocal.name,
              barcode: bestLocal.barcode,
              imageUrl: bestLocal.imageUrl,
              brand: bestLocal.brand,
              price: bestLocal.price,
              stock: bestLocal.stock,
              score: bestLocal.score,
            }
          : null,
        suggestedCatalog: bestCatalog
          ? {
              id: bestCatalog.id,
              name: bestCatalog.name,
              barcode: bestCatalog.barcode,
              imageUrl: bestCatalog.imageUrl,
              brand: bestCatalog.brand,
              category: bestCatalog.category,
              score: bestCatalog.score,
            }
          : null,
        localAlternatives: locals.slice(0, 5).map((l) => ({
          id: l.id,
          name: l.name,
          barcode: l.barcode,
          imageUrl: l.imageUrl,
          brand: l.brand,
          price: l.price,
          stock: l.stock,
          score: l.score,
        })),
        catalogAlternatives: catalog.slice(0, 5).map((c) => ({
          id: c.id,
          name: c.name,
          barcode: c.barcode,
          imageUrl: c.imageUrl,
          brand: c.brand,
          category: c.category,
          score: c.score,
        })),
      });
    }

    return { rows, parseErrors: parsed.errors };
  }

  async bulkCreateSearch(businessId: string, q: string) {
    const term = q.trim();
    if (term.length < 2) return { local: [], catalog: [] };
    const [local, catalog] = await Promise.all([
      this.findLocalCandidates(businessId, term),
      this.findPublicCatalogCandidates({ name: term }),
    ]);
    return {
      local: local.map((l) => ({
        id: l.id,
        name: l.name,
        barcode: l.barcode,
        imageUrl: l.imageUrl,
        brand: l.brand,
        price: l.price,
        stock: l.stock,
        score: l.score,
      })),
      catalog: catalog.map((c) => ({
        id: c.id,
        name: c.name,
        barcode: c.barcode,
        imageUrl: c.imageUrl,
        brand: c.brand,
        category: c.category,
        score: c.score,
      })),
    };
  }

  async bulkCreateConfirm(
    businessId: string,
    items: Array<{
      row: number;
      name: string;
      price: number;
      stock?: number;
      cost?: number;
      action: 'approve' | 'reject';
      localProductId?: string;
      publicProductId?: string;
    }>,
  ) {
    if (!Array.isArray(items) || !items.length) {
      throw new BadRequestException('No hay ítems para confirmar.');
    }

    const categoryCache = new Map<string, string>();
    const errors: Array<{ row: number; message: string }> = [];
    const matches: Array<{ row: number; pasted: string; catalog: string; barcode?: string }> = [];
    const ids: string[] = [];
    let created = 0;
    let updated = 0;
    let matchedFromCatalog = 0;
    let skipped = 0;
    let rejected = 0;
    let limitHit = false;

    for (const item of items) {
      if (item.action === 'reject') {
        rejected += 1;
        continue;
      }
      if (limitHit) {
        skipped += 1;
        errors.push({ row: item.row, message: 'Omitido: se alcanzó el límite del plan.' });
        continue;
      }

      try {
        const price = Number(item.price);
        if (!Number.isFinite(price) || price < 0) {
          skipped += 1;
          errors.push({ row: item.row, message: 'Precio de venta inválido' });
          continue;
        }
        const costNum = item.cost != null ? Number(item.cost) : NaN;
        const hasCost = Number.isFinite(costNum) && costNum >= 0;
        if (!hasCost) {
          skipped += 1;
          errors.push({ row: item.row, message: 'Costo inválido' });
          continue;
        }
        const stock = Math.max(0, Math.floor(Number(item.stock ?? 0) || 0));
        const name = String(item.name || '').trim();
        if (!name) {
          skipped += 1;
          errors.push({ row: item.row, message: 'Falta el nombre' });
          continue;
        }

        // 1) Actualizar producto local elegido
        if (item.localProductId) {
          const existing = await this.prisma.product.findFirst({
            where: { id: item.localProductId, businessId, isActive: true },
            select: { id: true, name: true },
          });
          if (!existing) {
            skipped += 1;
            errors.push({ row: item.row, message: 'Producto local no encontrado' });
            continue;
          }
          if (stock > 0) {
            await this.adjustStock(existing.id, businessId, stock, 'carga_masiva', `Fila ${item.row}`);
          }
          await this.prisma.product.update({
            where: { id: existing.id },
            data: {
              cost: new Decimal(costNum),
              ...(price > 0 ? { price: new Decimal(price) } : {}),
            },
          });
          updated += 1;
          ids.push(existing.id);
          continue;
        }

        // 2) Crear (opcionalmente con ficha pública)
        let pub: Awaited<ReturnType<typeof this.findPublicCatalogCandidates>>[number] | null = null;
        if (item.publicProductId) {
          const found = await this.prisma.publicProduct.findFirst({
            where: { id: item.publicProductId, status: 'active' },
          });
          if (found) {
            pub = { ...found, score: 100 };
          }
        }

        const effectiveBarcode = pub?.barcode?.trim() || undefined;
        if (effectiveBarcode) {
          const dup = await this.prisma.product.findFirst({
            where: { businessId, isActive: true, barcode: effectiveBarcode },
            select: { id: true, name: true },
          });
          if (dup) {
            if (stock > 0) {
              await this.adjustStock(dup.id, businessId, stock, 'carga_masiva', `Fila ${item.row}`);
            }
            await this.prisma.product.update({
              where: { id: dup.id },
              data: {
                cost: new Decimal(costNum),
                ...(price > 0 ? { price: new Decimal(price) } : {}),
              },
            });
            updated += 1;
            ids.push(dup.id);
            if (pub) {
              matchedFromCatalog += 1;
              matches.push({
                row: item.row,
                pasted: name,
                catalog: pub.name,
                barcode: pub.barcode?.trim() || undefined,
              });
            }
            continue;
          }
        }

        let sourcePublicProductId: string | undefined;
        if (pub) {
          const alreadyLinked = await this.prisma.product.findFirst({
            where: { businessId, sourcePublicProductId: pub.id },
            select: { id: true },
          });
          if (!alreadyLinked) sourcePublicProductId = pub.id;
          else {
            // Ya vinculado: sumar stock al local existente
            if (stock > 0) {
              await this.adjustStock(alreadyLinked.id, businessId, stock, 'carga_masiva', `Fila ${item.row}`);
            }
            await this.prisma.product.update({
              where: { id: alreadyLinked.id },
              data: {
                cost: new Decimal(costNum),
                ...(price > 0 ? { price: new Decimal(price) } : {}),
              },
            });
            updated += 1;
            ids.push(alreadyLinked.id);
            matchedFromCatalog += 1;
            matches.push({
              row: item.row,
              pasted: name,
              catalog: pub.name,
              barcode: pub.barcode?.trim() || undefined,
            });
            continue;
          }
        }

        const categoryId = await this.resolveCategoryIdCached(
          businessId,
          pub?.category || undefined,
          categoryCache,
        );
        const imageUrl =
          pub?.imageUrl && /^https?:\/\//i.test(pub.imageUrl.trim()) ? pub.imageUrl.trim() : undefined;

        const product = await this.create(businessId, {
          name: pub?.name?.trim() || name,
          price: price > 0 ? price : 0,
          cost: costNum,
          stock,
          barcode: effectiveBarcode,
          categoryId,
          brand: pub?.brand?.trim() || undefined,
          imageUrl,
          unitsPerBox: pub?.unitsPerBox?.trim() || undefined,
          weight: pub?.weight?.trim() || undefined,
          format: pub?.format?.trim() || undefined,
          flavor: pub?.flavor?.trim() || undefined,
          presentation: pub?.presentation?.trim() || undefined,
          subcategory: pub?.subcategory?.trim() || undefined,
          sourcePublicProductId,
        });
        if (!product?.id) {
          skipped += 1;
          errors.push({ row: item.row, message: 'No se pudo crear el producto.' });
          continue;
        }
        created += 1;
        ids.push(product.id);
        if (pub) {
          matchedFromCatalog += 1;
          matches.push({
            row: item.row,
            pasted: name,
            catalog: pub.name,
            barcode: pub.barcode?.trim() || undefined,
          });
          if (sourcePublicProductId) {
            await this.prisma.catalogImportLog
              .create({
                data: {
                  businessId,
                  publicProductId: pub.id,
                  localProductId: product.id,
                },
              })
              .catch(() => undefined);
          }
        }
      } catch (err) {
        skipped += 1;
        let message = 'Error al crear';
        if (err instanceof ForbiddenException || err instanceof BadRequestException) {
          const raw = (err as { message?: string | string[] }).message;
          message = Array.isArray(raw) ? String(raw[0] ?? message) : String(raw || message);
        } else if (err instanceof Error) {
          message = err.message;
        }
        if (err instanceof ForbiddenException && /productos/i.test(message)) {
          limitHit = true;
        }
        errors.push({ row: item.row, message });
      }
    }

    return {
      created,
      updated,
      matchedFromCatalog,
      skipped,
      rejected,
      errors,
      matches,
      ids,
    };
  }

  /**
   * Carga directa: crea exactamente lo pegado (nombre/cantidad/costo).
   * NO busca en catálogo público ni cambia nombres/códigos/fotos.
   * El 3.er valor es COSTO (no precio de venta). Precio de venta queda 0 en altas nuevas
   * y no se pisa en productos existentes.
   * Si el mismo nombre ya existe (o se repite), suma stock y actualiza costo.
   */
  async bulkCreateFromText(businessId: string, text: string) {
    const parsed = parseBulkCreateText(text);
    const parseErrors = [...parsed.errors];
    const errors: Array<{ row: number; message: string }> = [...parseErrors];
    // Filas que no parsearon ya “no entran”: cuentan como omitidas con mensaje claro.
    let skipped = parseErrors.filter((e) => e.row > 0).length;

    if (!parsed.rows.length) {
      if (!errors.length) throw new BadRequestException('No se encontraron filas válidas para crear.');
      return {
        created: 0,
        updated: 0,
        matchedFromCatalog: 0,
        skipped,
        rejected: 0,
        errors,
        matches: [],
        ids: [] as string[],
        parseErrors,
      };
    }

    const ids: string[] = [];
    const nameToId = new Map<string, string>(); // normalizado → id (esta carga + existentes)
    let created = 0;
    let updated = 0;
    let limitHit = false;

    const norm = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

    for (const row of parsed.rows) {
      if (limitHit) {
        skipped += 1;
        errors.push({ row: row.line, message: 'Omitido: se alcanzó el límite del plan.' });
        continue;
      }
      try {
        const key = norm(row.name);
        const qty = Math.max(0, Math.floor(row.stock ?? 0));
        let existingId = nameToId.get(key);

        let existingMeta: { id: string; price: unknown; cost: unknown } | null = null;
        if (!existingId) {
          existingMeta = await this.prisma.product.findFirst({
            where: {
              businessId,
              isActive: true,
              name: { equals: row.name.trim(), mode: 'insensitive' },
            },
            select: { id: true, price: true, cost: true },
          });
          if (existingMeta) {
            existingId = existingMeta.id;
            nameToId.set(key, existingMeta.id);
          }
        }

        if (existingId) {
          // Mismo nombre → sumar cantidad (no eliminar ni saltar la fila).
          if (qty > 0) {
            await this.adjustStock(existingId, businessId, qty, 'carga_masiva', `Fila ${row.line}`);
          }
          // Si una carga anterior dejó el número en venta y costo vacío, lo corregimos.
          const wronglyAsSale =
            row.price <= 0 &&
            existingMeta != null &&
            existingMeta.cost == null &&
            Number(existingMeta.price) === row.cost;
          await this.prisma.product.update({
            where: { id: existingId },
            data: {
              cost: new Decimal(row.cost),
              ...(row.price > 0
                ? { price: new Decimal(row.price) }
                : wronglyAsSale
                  ? { price: new Decimal(0) }
                  : {}),
            },
          });
          updated += 1;
          ids.push(existingId);
          continue;
        }

        const product = await this.create(businessId, {
          name: row.name.trim(),
          // Alta nueva: costo de la lista; venta 0 si no vino precio_venta explícito.
          price: row.price > 0 ? row.price : 0,
          cost: row.cost,
          stock: qty,
        });
        if (!product?.id) {
          skipped += 1;
          errors.push({ row: row.line, message: 'No se pudo crear el producto.' });
          continue;
        }
        created += 1;
        ids.push(product.id);
        nameToId.set(key, product.id);
      } catch (err) {
        skipped += 1;
        let message = 'Error al crear';
        if (err instanceof ForbiddenException || err instanceof BadRequestException) {
          const raw = (err as { message?: string | string[] }).message;
          message = Array.isArray(raw) ? String(raw[0] ?? message) : String(raw || message);
        } else if (err instanceof Error) {
          message = err.message;
        }
        if (err instanceof ForbiddenException && /productos/i.test(message)) {
          limitHit = true;
        }
        errors.push({ row: row.line, message });
      }
    }

    return {
      created,
      updated,
      matchedFromCatalog: 0,
      skipped,
      rejected: 0,
      errors,
      matches: [],
      ids,
      parseErrors,
    };
  }

  /**
   * Teatro: activa control de stock en TODOS los productos y corrige egresos
   * que se registraron en StockMove pero no bajaron Product.stock (bug previo
   * con stockControl=false: ventas y ajustes negativos).
   * Los egresos por escaneo (`egreso_escaneo`) ya descontaban y no se vuelven a aplicar.
   */
  async enableStockControlAndReconcile(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) throw new NotFoundException('Negocio no encontrado');
    if (!this.isTeatroTenant(business.name, business.id)) {
      throw new ForbiddenException('Solo está habilitado para el tenant Teatro.');
    }

    const withoutControl = await this.prisma.product.findMany({
      where: { businessId, stockControl: false },
      select: { id: true, name: true, stock: true },
    });

    let enabled = 0;
    let reconciled = 0;
    let unitsFixed = 0;
    const samples: { name: string; from: number; to: number; undeducted: number }[] = [];

    for (const product of withoutControl) {
      const negativeMoves = await this.prisma.stockMove.findMany({
        where: {
          productId: product.id,
          qty: { lt: 0 },
          NOT: { reason: 'egreso_escaneo' },
        },
        select: { qty: true },
      });
      const undeducted = negativeMoves.reduce((sum, move) => sum + Math.abs(move.qty), 0);
      const nextStock = Math.max(0, product.stock - undeducted);
      await this.prisma.product.update({
        where: { id: product.id },
        data: { stockControl: true, stock: nextStock },
      });
      enabled++;
      if (undeducted > 0) {
        reconciled++;
        unitsFixed += product.stock - nextStock;
        if (samples.length < 15) {
          samples.push({
            name: product.name,
            from: product.stock,
            to: nextStock,
            undeducted,
          });
        }
      }
    }

    // Por si quedó alguno raro: asegurar flag en todo el catálogo.
    const alreadyOk = await this.prisma.product.updateMany({
      where: { businessId, stockControl: false },
      data: { stockControl: true },
    });
    enabled += alreadyOk.count;

    const total = await this.prisma.product.count({ where: { businessId } });
    const withControl = await this.prisma.product.count({
      where: { businessId, stockControl: true },
    });

    return {
      total,
      withControl,
      enabled,
      reconciled,
      unitsFixed,
      samples,
      message:
        reconciled === 0
          ? `Control de stock activado en ${enabled} producto(s). No había egresos pendientes de descontar.`
          : `Control de stock activado en ${enabled} producto(s). Se corrigieron ${reconciled} con ${unitsFixed} unidad(es) que debían haberse descontado.`,
    };
  }

  /**
   * Redondea TODOS los precios del inventario hacia arriba al múltiplo de `step`
   * (por defecto 500). Solo tenant Teatro.
   * Ej.: 1100→1500, 900→1000, 1000 se mantiene.
   */
  async roundAllPricesUp(businessId: string, step = 500) {
    if (!Number.isFinite(step) || step <= 0) {
      throw new BadRequestException('El paso de redondeo debe ser mayor a 0.');
    }
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) throw new NotFoundException('Negocio no encontrado');
    if (!this.isTeatroTenant(business.name, business.id)) {
      throw new ForbiddenException('Redondear precios del inventario solo está habilitado para el tenant Teatro.');
    }

    const products = await this.prisma.product.findMany({
      where: { businessId },
      select: { id: true, price: true },
    });
    const toUpdate: { id: string; next: number }[] = [];
    let unchanged = 0;
    for (const product of products) {
      const current = Number(product.price);
      const next = roundPriceUpToStep(current, step);
      if (next === current) {
        unchanged++;
        continue;
      }
      toUpdate.push({ id: product.id, next });
    }

    const chunkSize = 80;
    for (let i = 0; i < toUpdate.length; i += chunkSize) {
      const chunk = toUpdate.slice(i, i + chunkSize);
      await this.prisma.$transaction(
        chunk.map((row) =>
          this.prisma.product.updateMany({
            where: { id: row.id, businessId },
            data: { price: new Decimal(row.next) },
          }),
        ),
      );
    }

    return {
      total: products.length,
      updated: toUpdate.length,
      unchanged,
      step,
      message:
        toUpdate.length === 0
          ? `Ningún precio cambió: los ${products.length} productos ya estaban en múltiplos de $${step}.`
          : `Se redondearon ${toUpdate.length} de ${products.length} productos hacia arriba a múltiplos de $${step} (${unchanged} ya estaban redondeados).`,
    };
  }

  /**
   * Vacía el inventario del negocio. Solo permitido para el tenant Teatro
   * (nombre contiene "teatro") o IDs en INVENTORY_WIPE_BUSINESS_IDS.
   */
  async wipeInventory(businessId: string, confirm: string) {
    if (confirm !== 'VACIAR') {
      throw new BadRequestException('Escribí VACIAR para confirmar.');
    }
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) throw new NotFoundException('Negocio no encontrado');
    if (!this.isTeatroTenant(business.name, business.id)) {
      throw new ForbiddenException('Vaciar inventario solo está habilitado para el tenant Teatro.');
    }

    const products = await this.prisma.product.findMany({
      where: { businessId },
      select: { id: true },
    });
    const ids = products.map((p) => p.id);
    if (!ids.length) {
      return { deleted: 0, deactivated: 0, message: 'No había productos.' };
    }

    await this.prisma.productBatch.deleteMany({ where: { businessId } });
    await this.prisma.catalogImportLog.deleteMany({ where: { businessId } });
    await this.prisma.stockMove.deleteMany({ where: { productId: { in: ids } } });

    const purchased = await this.prisma.purchaseItem.findMany({
      where: { productId: { in: ids } },
      select: { productId: true },
      distinct: ['productId'],
    });
    const keepIds = [...new Set(purchased.map((p) => p.productId))];

    let deactivated = 0;
    if (keepIds.length) {
      const res = await this.prisma.product.updateMany({
        where: { businessId, id: { in: keepIds } },
        data: {
          isActive: false,
          stock: 0,
          barcode: null,
          allCodes: null,
          sourcePublicProductId: null,
          incomplete: true,
        },
      });
      deactivated = res.count;
    }

    const del = await this.prisma.product.deleteMany({
      where: {
        businessId,
        ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
      },
    });

    return {
      deleted: del.count,
      deactivated,
      message: `Inventario vaciado: ${del.count} eliminados, ${deactivated} desactivados (con historial de compras).`,
    };
  }

  /** Importa stock (y opcionalmente stock_minimo) desde filas Excel. */
  async importStock(
    businessId: string,
    rows: Array<{ id?: string; barcode?: string; stock: number; minStock?: number }>,
  ): Promise<{ updated: number; errors: Array<{ row: number; message: string }> }> {
    const errors: Array<{ row: number; message: string }> = [];
    let updated = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const stock = Number(row.stock);
      if (Number.isNaN(stock) || stock < 0) {
        errors.push({ row: i + 1, message: 'Stock inválido' });
        continue;
      }
      const where: { businessId: string; id?: string; barcode?: string } = { businessId };
      if (row.id) where.id = row.id;
      else if (row.barcode != null && String(row.barcode).trim() !== '') where.barcode = String(row.barcode).trim();
      else {
        errors.push({ row: i + 1, message: 'Falta id o codigo_barras' });
        continue;
      }
      const product = await this.prisma.product.findFirst({ where });
      if (!product) {
        errors.push({ row: i + 1, message: 'Producto no encontrado' });
        continue;
      }
      try {
        const delta = stock - product.stock;
        if (delta !== 0) {
          await this.adjustStock(product.id, businessId, delta, 'Importación masiva', `Fila ${i + 1}`);
        }
        if (row.minStock !== undefined && row.minStock !== product.minStock) {
          await this.prisma.product.update({
            where: { id: product.id, businessId },
            data: { minStock: row.minStock },
          });
        }
        updated++;
      } catch {
        errors.push({ row: i + 1, message: 'Error al actualizar' });
      }
    }
    return { updated, errors };
  }

  async generateInternalBarcode(businessId: string, used = new Set<string>()): Promise<{ barcode: string }> {
    const prefix = `20${tenantPrefix(businessId)}`;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const serial = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
      const barcode = buildEan13(`${prefix}${serial}`);
      if (used.has(barcode)) continue;
      const exists = await this.prisma.product.findFirst({
        where: { businessId, barcode },
        select: { id: true },
      });
      if (!exists) {
        used.add(barcode);
        return { barcode };
      }
    }
    throw new BadRequestException('No pudimos generar un código libre. Probá de nuevo.');
  }

  async assignMissingBarcodes(businessId: string, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return { updated: 0, items: [] as Array<{ id: string; barcode: string }> };
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: unique } },
      select: { id: true, barcode: true, allCodes: true, supplierSku: true, eanBox: true, supplierRef: true, externalId: true },
    });
    const items: Array<{ id: string; barcode: string }> = [];
    const used = new Set(products.map((p) => p.barcode?.trim()).filter(Boolean) as string[]);
    let updated = 0;
    for (const product of products) {
      if (product.barcode?.trim()) {
        items.push({ id: product.id, barcode: product.barcode.trim() });
        continue;
      }
      const { barcode } = await this.generateInternalBarcode(businessId, used);
      await this.prisma.product.update({
        where: { id: product.id, businessId },
        data: {
          barcode,
          allCodes: collectAllCodes(null, [barcode, product.supplierSku, product.eanBox, product.supplierRef, product.externalId, product.allCodes]),
        },
      });
      updated += 1;
      items.push({ id: product.id, barcode });
    }
    return { updated, items };
  }

  async catalogIds(businessId: string, query: ProductCatalogQuery) {
    const catalog = await this.catalog(businessId, { ...query, page: 1, pageSize: 200 });
    const ids: string[] = catalog.items.map((item: { id: string }) => item.id);
    const total = Number(catalog.total || ids.length);
    for (let page = 2; page <= Math.ceil(total / 200); page += 1) {
      const next = await this.catalog(businessId, { ...query, page, pageSize: 200 });
      ids.push(...next.items.map((item: { id: string }) => item.id));
    }
    return { ids, total: ids.length };
  }

  async labelData(businessId: string, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 2000);
    if (!unique.length) return [];
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: unique } },
      select: {
        id: true,
        name: true,
        barcode: true,
        supplierSku: true,
        price: true,
        category: { select: { name: true } },
      },
    });
    const order = new Map(unique.map((id, i) => [id, i]));
    return products
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((p) => ({
        id: p.id,
        name: p.name,
        barcode: p.barcode?.trim() || '',
        sku: p.supplierSku?.trim() || '',
        category: p.category?.name?.trim() || '',
        price: Number(p.price),
      }));
  }
}
