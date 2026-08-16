import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { decorateProductUnits } from '../common/units';
import { fuzzyCodeClause } from '../common/fuzzy-code';

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

  constructor(private prisma: PrismaService) {}

  /**
   * Descuenta stock por lotes (FIFO por vencimiento). Si no hay lotes, descuenta del stock total (legacy).
   */
  async deductStockFromBatches(productId: string, businessId: string, qty: number): Promise<void> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new BadRequestException('Producto no encontrado');
    if (!product.stockControl || qty <= 0) return;
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

  async catalog(businessId: string, query: ProductCatalogQuery) {
    let where: Record<string, unknown>;
    const tokens = query.q?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (tokens.length) {
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
        const { match: fuzzy } = fuzzyCodeClause(
          query.q?.trim() ?? '', tokens, 'p',
          ['barcode', 'eanBox', 'supplierSku', 'supplierRef', 'externalId', 'allCodes'],
        );
        const matches = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT p."id"
          FROM "Product" p
          WHERE p."businessId" = ${businessId}
            AND (${Prisma.join(tokenConditions, ' AND ')} ${fuzzy})
        `);
        where = this.catalogWhere(businessId, { ...query, q: undefined });
        where.id = { in: matches.map((match) => match.id) };
      } catch (error) {
        this.logger.warn(
          `Búsqueda avanzada del catálogo no disponible; se usa fallback Prisma: ${error instanceof Error ? error.message : String(error)}`,
        );
        where = this.catalogWhere(businessId, query);
      }
    } else {
      where = this.catalogWhere(businessId, query);
    }
    const skip = (query.page - 1) * query.pageSize;
    const orderBy =
      query.sort === 'category'
        ? { category: { name: query.dir } }
        : { [query.sort]: query.dir };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: orderBy as any,
        skip,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
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
  }) {
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
        imageUrl: data.imageUrl,
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
      },
      include: { category: true },
    });
    if (initialStock > 0) {
      return this.adjustStock(product.id, businessId, initialStock, 'stock_inicial');
    }
    await this.prisma.stockMove.create({
      data: {
        productId: product.id,
        qty: 0,
        reason: 'alta_producto',
      },
    });
    return product;
  }

  async quick(businessId: string, data: { name: string; price: number; barcode?: string }) {
    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    const price = Number(data?.price);
    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    if (!Number.isFinite(price) || price < 0) {
      throw new BadRequestException('El precio debe ser un número mayor o igual a cero.');
    }
    const product = await this.create(businessId, {
      name,
      price,
      barcode: typeof data.barcode === 'string' && data.barcode.trim() ? data.barcode.trim() : undefined,
      stockControl: false,
      incomplete: true,
    });
    if (!product) throw new BadRequestException('No se pudo crear el producto.');
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
    brand: string;
    iva: number;
    expiresAt: string;
    imageUrl: string;
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
    return this.prisma.product.update({
      where: { id, businessId },
      data: update,
      include: { category: true },
    });
  }

  async adjustStock(id: string, businessId: string, qty: number, reason: string, reference?: string) {
    const product = await this.prisma.product.findFirst({ where: { id, businessId } });
    if (!product) return null;
    await this.prisma.stockMove.create({
      data: { productId: id, qty, reason, reference },
    });
    if (qty < 0) {
      await this.deductStockFromBatches(id, businessId, Math.abs(qty));
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
  async addCode(id: string, businessId: string, code: string) {
    const clean = String(code ?? '').trim();
    if (clean.length < 3 || clean.length > 40) throw new BadRequestException('Código inválido.');
    const p = await this.prisma.product.findFirst({ where: { id, businessId }, select: { id: true, barcode: true, allCodes: true } });
    if (!p) throw new NotFoundException('Producto no encontrado.');
    const codes = new Set((p.allCodes ?? '').split(/\s+/).filter(Boolean));
    codes.add(clean);
    const data: Prisma.ProductUpdateInput = { allCodes: [...codes].join(' ') };
    if (!p.barcode && /^\d{6,14}$/.test(clean)) data.barcode = clean; // si no tiene código de barras y es numérico, lo usamos
    await this.prisma.product.update({ where: { id }, data });
    return { ok: true, barcodeSet: !p.barcode && /^\d{6,14}$/.test(clean) };
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
}
