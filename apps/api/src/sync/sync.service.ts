import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MondelezProvider, NormalizedItem } from './mondelez.provider';
import { bulkCostToUnit, decorateSyncedProductUnits } from '../common/units';
import { encryptSecret } from '../fiscal/fiscal-crypto';

const SYNC_FREQUENCIES = ['manual', 'daily', 'hourly', 'every_6h', 'every_12h'] as const;
type SyncFrequency = (typeof SYNC_FREQUENCIES)[number];

type ConnInput = {
  provider?: string;
  name?: string;
  enabled?: boolean;
  config?: any;
  priceMarkup?: number;
  defaultMinStock?: number;
  autoSync?: boolean;
  syncFrequency?: SyncFrequency;
  syncHourLocal?: number | null;
  columnsConfig?: Record<string, unknown> | null;
};

@Injectable()
export class SyncService {
  private readonly logger = new Logger('SyncService');
  constructor(
    private prisma: PrismaService,
    private mondelez: MondelezProvider,
  ) {}

  // ---------- Conexiones ----------
  private sanitizeConnection<T extends Record<string, any>>(connection: T) {
    const { credentialsEncrypted, ...safe } = connection;
    return { ...safe, hasCredentials: !!credentialsEncrypted };
  }

  async listConnections(businessId: string) {
    const connections = await this.prisma.syncConnection.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
    return connections.map((connection) => this.sanitizeConnection(connection));
  }

  async getConnection(id: string, businessId: string) {
    const c = await this.prisma.syncConnection.findFirst({ where: { id, businessId } });
    if (!c) throw new NotFoundException('Conexión no encontrada');
    return this.sanitizeConnection(c);
  }

  async createConnection(businessId: string, data: ConnInput) {
    this.validateSchedule(data);
    const connection = await this.prisma.syncConnection.create({
      data: {
        businessId,
        provider: data.provider || 'mondelez',
        name: data.name || 'Mondelez',
        enabled: data.enabled ?? true,
        config: data.config ?? {},
        priceMarkup: new Decimal(data.priceMarkup ?? 0),
        defaultMinStock: data.defaultMinStock ?? 0,
        autoSync: data.autoSync ?? false,
        syncFrequency: data.syncFrequency ?? 'manual',
        syncHourLocal: data.syncHourLocal ?? null,
        columnsConfig: (data.columnsConfig ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
    return this.sanitizeConnection(connection);
  }

  async updateConnection(id: string, businessId: string, data: ConnInput) {
    await this.getConnection(id, businessId);
    this.validateSchedule(data);
    const patch: any = {};
    if (data.provider !== undefined) patch.provider = data.provider;
    if (data.name !== undefined) patch.name = data.name;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.config !== undefined) patch.config = data.config;
    if (data.priceMarkup != null) patch.priceMarkup = new Decimal(data.priceMarkup);
    if (data.defaultMinStock !== undefined) patch.defaultMinStock = data.defaultMinStock;
    if (data.autoSync !== undefined) patch.autoSync = data.autoSync;
    if (data.syncFrequency !== undefined) patch.syncFrequency = data.syncFrequency;
    if (data.syncHourLocal !== undefined) patch.syncHourLocal = data.syncHourLocal;
    if (data.columnsConfig !== undefined) patch.columnsConfig = data.columnsConfig;
    const connection = await this.prisma.syncConnection.update({ where: { id }, data: patch });
    return this.sanitizeConnection(connection);
  }

  async updateCredentials(id: string, businessId: string, credentials?: Record<string, string>) {
    await this.getConnection(id, businessId);
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
      throw new BadRequestException('Credenciales inválidas.');
    }
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value !== 'string') throw new BadRequestException('Credenciales inválidas.');
      normalized[key] = value;
    }
    const connection = await this.prisma.syncConnection.update({
      where: { id },
      data: { credentialsEncrypted: encryptSecret(JSON.stringify(normalized)) },
    });
    return this.sanitizeConnection(connection);
  }

  private validateSchedule(data: ConnInput) {
    if (data.syncFrequency !== undefined && !SYNC_FREQUENCIES.includes(data.syncFrequency)) {
      throw new BadRequestException('Frecuencia de sincronización inválida.');
    }
    if (
      data.syncHourLocal !== undefined &&
      data.syncHourLocal !== null &&
      (!Number.isInteger(data.syncHourLocal) || data.syncHourLocal < 0 || data.syncHourLocal > 23)
    ) {
      throw new BadRequestException('La hora local debe estar entre 0 y 23.');
    }
  }

  async deleteConnection(id: string, businessId: string) {
    await this.getConnection(id, businessId);
    await this.prisma.syncConnection.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- Sync de catálogo (público, server-side) ----------
  async runCatalogSync(id: string, businessId: string) {
    const conn = await this.getConnection(id, businessId);
    if (conn.provider === 'juntosplus' || conn.provider === 'tokin') {
      const providerName = conn.provider === 'tokin' ? 'Tokin' : 'Juntos+';
      throw new BadRequestException(
        `${providerName} se sincroniza con el runner local (no hay catálogo público en el servidor).`,
      );
    }
    if (conn.provider !== 'mondelez') {
      throw new BadRequestException(
        `El proveedor ${conn.provider} no ofrece sincronización pública en el servidor. Usá su runner local.`,
      );
    }
    const run = await this.prisma.syncRun.create({
      data: { connectionId: id, status: 'running' },
    });
    try {
      const items = await this.mondelez.fetchCatalog();
      const upserted = await this.upsertItems(businessId, id, items, false);
      const finished = await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          itemsFetched: items.length,
          itemsUpserted: upserted,
          finishedAt: new Date(),
          message: 'Catálogo sincronizado (sin precio real)',
        },
      });
      await this.prisma.syncConnection.update({
        where: { id },
        data: { lastSyncAt: new Date(), lastStatus: 'success' },
      });
      return finished;
    } catch (e: any) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'error', message: String(e?.message || e), finishedAt: new Date() },
      });
      await this.prisma.syncConnection.update({
        where: { id },
        data: { lastStatus: 'error' },
      });
      throw e;
    }
  }

  /**
   * Recibe items desde el RUNNER autenticado (login con teléfono): trae el precio
   * real B2B + todos los campos. Hace upsert preservando el costo.
   */
  async pushItems(id: string, businessId: string, items: NormalizedItem[]) {
    const conn = await this.getConnection(id, businessId);
    const run = await this.prisma.syncRun.create({
      data: { connectionId: id, status: 'running' },
    });
    try {
      const upserted = await this.upsertItems(businessId, id, items, true);
      const withCost = items.filter((i) => i.cost != null).length;
      const finished = await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          itemsFetched: items.length,
          itemsUpserted: upserted,
          finishedAt: new Date(),
          message: `Sync autenticado: ${withCost} con precio real`,
        },
      });
      await this.prisma.syncConnection.update({
        where: { id },
        data: { lastSyncAt: new Date(), lastStatus: 'success' },
      });
      return finished;
    } catch (e: any) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'error', message: String(e?.message || e), finishedAt: new Date() },
      });
      throw e;
    }
  }

  private async upsertItems(
    businessId: string,
    connectionId: string,
    items: NormalizedItem[],
    withCost: boolean,
  ): Promise<number> {
    let n = 0;
    for (const it of items) {
      const base: any = {
        businessId,
        sku: it.sku,
        ean: it.ean,
        supplierRef: it.supplierRef,
        eanUnit: it.eanUnit,
        eanBox: it.eanBox,
        name: it.name,
        brand: it.brand,
        category: it.category,
        subcategory: it.subcategory,
        available: it.available ?? true,
        stock: it.stock ?? null,
        unitsPerBox: it.unitsPerBox,
        weight: it.weight,
        format: it.format,
        flavor: it.flavor,
        presentation: it.presentation,
        unitsPerDisplay: it.unitsPerDisplay,
        displaysPerBox: it.displaysPerBox,
        retornable: it.retornable,
        imageUrl: it.imageUrl,
        link: it.link,
        raw: it.raw ?? undefined,
        syncedAt: new Date(),
      };
      if (it.ivaAlicuota !== undefined) {
        base.ivaAlicuota = it.ivaAlicuota != null ? new Decimal(it.ivaAlicuota) : null;
      }
      if (it.basePrice !== undefined) {
        base.basePrice = it.basePrice != null ? new Decimal(it.basePrice) : null;
      }
      // El costo solo se escribe cuando viene del runner autenticado, para no
      // pisar un precio real con el placeholder del catálogo público.
      if (withCost) {
        base.cost = it.cost != null ? new Decimal(it.cost) : null;
        base.listPrice = it.listPrice != null ? new Decimal(it.listPrice) : null;
      }
      await this.prisma.$transaction(async (tx) => {
        const syncedProduct = await tx.syncedProduct.upsert({
          where: { connectionId_externalId: { connectionId, externalId: it.externalId } },
          create: { connectionId, externalId: it.externalId, ...base },
          update: base,
        });
        if (it.variants !== undefined) {
          await tx.syncedVariant.deleteMany({ where: { syncedProductId: syncedProduct.id } });
          if (it.variants.length > 0) {
            await tx.syncedVariant.createMany({
              data: it.variants.map((variant) => ({
                syncedProductId: syncedProduct.id,
                uom: variant.uom,
                multiplier: variant.multiplier ?? 1,
                skuId: variant.skuId ?? null,
                refId: variant.refId ?? null,
                ean: variant.ean ?? null,
                listPrice: variant.listPrice != null ? new Decimal(variant.listPrice) : null,
                sellingPrice: variant.sellingPrice != null ? new Decimal(variant.sellingPrice) : null,
                priceWithTax: variant.priceWithTax != null ? new Decimal(variant.priceWithTax) : null,
                cost: variant.cost != null ? new Decimal(variant.cost) : null,
                stock: variant.stock ?? null,
                taxAlicuota: variant.taxAlicuota != null ? new Decimal(variant.taxAlicuota) : null,
                sellerId: variant.sellerId ?? null,
                erpStatus: variant.erpStatus ?? null,
              })),
            });
          }
        }
      });
      n++;
    }
    return n;
  }

  // ---------- Listados ----------
  async listSyncedProducts(
    id: string,
    businessId: string,
    opts: { q?: string; onlyAvailable?: boolean; onlyWithCost?: boolean; limit?: number } = {},
  ) {
    const conn = await this.getConnection(id, businessId);
    const rows = await this.prisma.syncedProduct.findMany({
      where: {
        connectionId: id,
        available: opts.onlyAvailable ? true : undefined,
        cost: opts.onlyWithCost ? { not: null } : undefined,
        OR: opts.q
          ? [
              { name: { contains: opts.q, mode: 'insensitive' } },
              { ean: { contains: opts.q } },
              { brand: { contains: opts.q, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: { name: 'asc' },
      take: opts.limit ?? 1000,
      include: { variants: true },
    });
    const markup = Number(conn.priceMarkup ?? 0);
    return rows.map((r) => decorateSyncedProductUnits(r, markup));
  }

  async listRuns(id: string, businessId: string) {
    await this.getConnection(id, businessId);
    return this.prisma.syncRun.findMany({
      where: { connectionId: id },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  // Campos del Producto que se llenan por copia directa (string) según el mapeo.
  private static STRING_FIELDS = [
    'barcode', 'brand', 'imageUrl', 'unitsPerBox', 'weight',
    'format', 'flavor', 'presentation', 'subcategory', 'supplierSku', 'supplierRef',
    'eanBox', 'externalId',
  ];
  // Mapeo por defecto: campo del Producto -> campo del SyncedProduct.
  static DEFAULT_MAPPING: Record<string, string> = {
    name: 'name',
    barcode: 'ean',
    brand: 'brand',
    imageUrl: 'imageUrl',
    unitsPerBox: 'unitsPerBox',
    weight: 'weight',
    format: 'format',
    flavor: 'flavor',
    presentation: 'presentation',
    subcategory: 'subcategory',
    supplierSku: 'sku',
    supplierRef: 'supplierRef',
    eanBox: 'eanBox',
    externalId: 'externalId',
    category: 'category',
    cost: 'cost',
  };

  getMapping(conn: any): Record<string, string> {
    const cfg = (conn?.config && conn.config.mapping) || {};
    return { ...SyncService.DEFAULT_MAPPING, ...cfg };
  }

  // Campos del SyncedProduct disponibles como origen del mapeo.
  static SYNCED_FIELDS = [
    'name', 'ean', 'brand', 'category', 'subcategory', 'cost', 'listPrice',
    'available', 'stock', 'unitsPerBox', 'weight', 'format', 'flavor',
    'presentation', 'imageUrl', 'link', 'sku', 'externalId', 'supplierRef',
    'eanUnit', 'eanBox', 'ivaAlicuota', 'unitsPerDisplay', 'displaysPerBox',
    'retornable', 'basePrice',
  ];

  async getMappingInfo(id: string, businessId: string) {
    const conn = await this.getConnection(id, businessId);
    return {
      mapping: this.getMapping(conn),
      productFields: Object.keys(SyncService.DEFAULT_MAPPING),
      syncedFields: SyncService.SYNCED_FIELDS,
    };
  }

  async setMapping(id: string, businessId: string, mapping: Record<string, string>) {
    const conn = await this.getConnection(id, businessId);
    const config: any = { ...(conn.config as any), mapping };
    await this.prisma.syncConnection.update({ where: { id }, data: { config } });
    return { ok: true, mapping };
  }

  // ---------- Importar a Productos del negocio (con mapeo configurable) ----------
  async importToProducts(
    id: string,
    businessId: string,
    opts: { onlyWithCost?: boolean; onlyAvailable?: boolean } = {},
  ) {
    const conn = await this.getConnection(id, businessId);
    const markup = Number(conn.priceMarkup) || 0;
    const minStock = conn.defaultMinStock || 0;
    const map = this.getMapping(conn);

    const synced = await this.prisma.syncedProduct.findMany({
      where: {
        connectionId: id,
        cost: opts.onlyWithCost ? { not: null } : undefined,
        available: opts.onlyAvailable ? true : undefined,
      },
    });

    const cats = await this.prisma.category.findMany({ where: { businessId } });
    const catMap = new Map<string, string>(cats.map((c) => [c.name.toLowerCase(), c.id]));
    const ensureCategory = async (name?: string | null): Promise<string | undefined> => {
      if (!name) return undefined;
      const key = String(name).toLowerCase();
      if (catMap.has(key)) return catMap.get(key);
      const created = await this.prisma.category.create({ data: { name: String(name), businessId } });
      catMap.set(key, created.id);
      return created.id;
    };
    const src = (s: any, productField: string) => {
      const k = map[productField];
      return k ? s[k] : undefined;
    };

    let created = 0, updated = 0, skipped = 0;
    for (const s of synced as any[]) {
      // campos string por mapeo
      const data: any = {};
      for (const f of SyncService.STRING_FIELDS) {
        const v = src(s, f);
        if (v != null && v !== '') data[f] = String(v);
      }
      const preferredUnitEan = s.eanUnit || s.ean;
      if (preferredUnitEan) data.barcode = String(preferredUnitEan);
      if (s.supplierRef) data.supplierRef = String(s.supplierRef);
      if (s.eanBox) data.eanBox = String(s.eanBox);
      // nombre (requerido)
      const nameVal = src(s, 'name') ?? s.name;
      data.name = nameVal ? String(nameVal) : 'Sin nombre';
      // costo + precio de venta con markup
      // El costo del proveedor puede ser por bulto; lo convertimos a unitario antes de guardar.
      const rawCost = src(s, 'cost');
      const bulkCost = rawCost != null && Number(rawCost) > 0 && Number(rawCost) < 1000000 ? Number(rawCost) : null;
      const cost = bulkCostToUnit(bulkCost, data.unitsPerBox ?? s.unitsPerBox);
      const price = cost != null ? Math.round(cost * (1 + markup / 100) * 100) / 100 : null;
      // categoría
      const categoryId = await ensureCategory(src(s, 'category'));

      let existing = s.linkedProductId
        ? await this.prisma.product.findFirst({ where: { id: s.linkedProductId, businessId } })
        : null;
      if (!existing && data.barcode)
        existing = await this.prisma.product.findFirst({ where: { businessId, barcode: data.barcode } });

      if (existing) {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: {
            ...data,
            categoryId: categoryId ?? existing.categoryId,
            cost: cost != null ? new Decimal(cost) : existing.cost,
            price: price != null ? new Decimal(price) : existing.price,
            sourceConnectionId: conn.id,
            sourceProvider: conn.provider,
            iva: s.ivaAlicuota != null ? new Decimal(s.ivaAlicuota) : existing.iva,
          },
        });
        await this.prisma.syncedProduct.update({ where: { id: s.id }, data: { linkedProductId: existing.id } });
        updated++;
      } else {
        if (price == null) { skipped++; continue; }
        const prod = await this.prisma.product.create({
          data: {
            businessId,
            ...data,
            categoryId: categoryId ?? undefined,
            cost: cost != null ? new Decimal(cost) : undefined,
            price: new Decimal(price),
            minStock,
            stockControl: true,
            sourceConnectionId: conn.id,
            sourceProvider: conn.provider,
            iva: s.ivaAlicuota != null ? new Decimal(s.ivaAlicuota) : undefined,
          },
        });
        await this.prisma.syncedProduct.update({ where: { id: s.id }, data: { linkedProductId: prod.id } });
        created++;
      }
    }
    return { created, updated, skipped, total: synced.length };
  }

  async repriceConnection(id: string, businessId: string) {
    const conn = await this.getConnection(id, businessId);
    const markup = Number(conn.priceMarkup) || 0;
    const products = await this.prisma.product.findMany({
      where: { businessId, sourceConnectionId: id, cost: { not: null } },
      select: { id: true, cost: true },
    });
    let updated = 0;
    for (const product of products) {
      const price = Math.round(Number(product.cost) * (1 + markup / 100) * 100) / 100;
      const result = await this.prisma.product.updateMany({
        where: { id: product.id, businessId, sourceConnectionId: id },
        data: { price: new Decimal(price) },
      });
      updated += result.count;
    }
    return { updated };
  }

  // ---------- Cron: sync automático de catálogo ----------
  async runAllAuto() {
    const conns = await this.prisma.syncConnection.findMany({
      where: { autoSync: true, enabled: true, provider: 'mondelez' },
    });
    const results: any[] = [];
    for (const c of conns) {
      try {
        const r = await this.runCatalogSync(c.id, c.businessId);
        results.push({ connectionId: c.id, status: 'success', upserted: r.itemsUpserted });
      } catch (e: any) {
        results.push({ connectionId: c.id, status: 'error', message: String(e?.message || e) });
      }
    }
    return { ran: results.length, results };
  }
}
