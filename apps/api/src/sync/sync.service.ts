import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { MondelezProvider, NormalizedItem } from './mondelez.provider';
import { parseUnitsPerBox } from '../common/units';

type ConnInput = {
  provider?: string;
  name?: string;
  enabled?: boolean;
  config?: any;
  priceMarkup?: number;
  defaultMinStock?: number;
  autoSync?: boolean;
};

@Injectable()
export class SyncService {
  private readonly logger = new Logger('SyncService');
  constructor(
    private prisma: PrismaService,
    private mondelez: MondelezProvider,
  ) {}

  // ---------- Conexiones ----------
  listConnections(businessId: string) {
    return this.prisma.syncConnection.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
  }

  async getConnection(id: string, businessId: string) {
    const c = await this.prisma.syncConnection.findFirst({ where: { id, businessId } });
    if (!c) throw new NotFoundException('Conexión no encontrada');
    return c;
  }

  createConnection(businessId: string, data: ConnInput) {
    return this.prisma.syncConnection.create({
      data: {
        businessId,
        provider: data.provider || 'mondelez',
        name: data.name || 'Mondelez',
        enabled: data.enabled ?? true,
        config: data.config ?? {},
        priceMarkup: new Decimal(data.priceMarkup ?? 0),
        defaultMinStock: data.defaultMinStock ?? 0,
        autoSync: data.autoSync ?? false,
      },
    });
  }

  async updateConnection(id: string, businessId: string, data: ConnInput) {
    await this.getConnection(id, businessId);
    const patch: any = { ...data };
    if (data.priceMarkup != null) patch.priceMarkup = new Decimal(data.priceMarkup);
    return this.prisma.syncConnection.update({ where: { id }, data: patch });
  }

  async deleteConnection(id: string, businessId: string) {
    await this.getConnection(id, businessId);
    await this.prisma.syncConnection.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- Sync de catálogo (público, server-side) ----------
  async runCatalogSync(id: string, businessId: string) {
    const conn = await this.getConnection(id, businessId);
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
        imageUrl: it.imageUrl,
        link: it.link,
        raw: it.raw ?? undefined,
        syncedAt: new Date(),
      };
      // El costo solo se escribe cuando viene del runner autenticado, para no
      // pisar un precio real con el placeholder del catálogo público.
      if (withCost) {
        base.cost = it.cost != null ? new Decimal(it.cost) : null;
        base.listPrice = it.listPrice != null ? new Decimal(it.listPrice) : null;
      }
      await this.prisma.syncedProduct.upsert({
        where: { connectionId_externalId: { connectionId, externalId: it.externalId } },
        create: { connectionId, externalId: it.externalId, ...base },
        update: base,
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
    await this.getConnection(id, businessId);
    return this.prisma.syncedProduct.findMany({
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
    });
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
    'format', 'flavor', 'presentation', 'subcategory', 'supplierSku', 'externalId',
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
    'presentation', 'imageUrl', 'link', 'sku', 'externalId',
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
      // nombre (requerido)
      const nameVal = src(s, 'name') ?? s.name;
      data.name = nameVal ? String(nameVal) : 'Sin nombre';
      // costo + precio de venta con markup
      // El costo del proveedor puede ser por bulto; lo convertimos a unitario antes de guardar.
      const rawCost = src(s, 'cost');
      const bulkCost = rawCost != null && Number(rawCost) > 0 && Number(rawCost) < 1000000 ? Number(rawCost) : null;
      const unitsNum = parseUnitsPerBox(data.unitsPerBox ?? s.unitsPerBox);
      const cost = bulkCost != null && unitsNum != null ? Math.round((bulkCost / unitsNum) * 100) / 100 : bulkCost;
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
          },
        });
        await this.prisma.syncedProduct.update({ where: { id: s.id }, data: { linkedProductId: prod.id } });
        created++;
      }
    }
    return { created, updated, skipped, total: synced.length };
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
