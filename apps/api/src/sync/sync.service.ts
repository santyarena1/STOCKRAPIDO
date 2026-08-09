import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MondelezProvider, NormalizedItem } from './mondelez.provider';
import { bulkCostToUnit, decorateSyncedProductUnits } from '../common/units';
import { decryptSecret, encryptSecret } from '../fiscal/fiscal-crypto';
import { TokinProvider } from './tokin.provider';
import { proxiedFetch } from './proxied-fetch';
import { discoverRawColumns, RawColumnType } from './raw-columns.util';

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

type SupplierAccountInput = {
  account?: {
    clienteId?: string;
    razonSocial?: string;
    balance?: number;
    creditLimit?: number;
    availableCredit?: number;
    currency?: string;
  };
  invoices?: Array<Record<string, any>>;
  movements?: Array<Record<string, any>>;
  credits?: Array<Record<string, any>>;
};

const SYNCED_MAPPED_FIELDS = [
  'name', 'brand', 'category', 'subcategory', 'ean', 'eanUnit', 'eanBox', 'sku',
  'supplierRef', 'externalId', 'cost', 'basePrice', 'listPrice', 'ivaAlicuota',
  'unitsPerBox', 'unitsPerDisplay', 'displaysPerBox', 'retornable', 'weight',
  'format', 'flavor', 'presentation', 'available', 'stock', 'imageUrl', 'link',
] as const;

@Injectable()
export class SyncService {
  private readonly logger = new Logger('SyncService');
  constructor(
    private prisma: PrismaService,
    private mondelez: MondelezProvider,
    private tokin: TokinProvider,
  ) {}

  // ---------- Conexiones ----------
  private sanitizeConnection<T extends Record<string, any>>(connection: T) {
    const { credentialsEncrypted, sessionEncrypted, ...safe } = connection;
    const columnsConfig = safe.columnsConfig && typeof safe.columnsConfig === 'object' && !Array.isArray(safe.columnsConfig)
      ? safe.columnsConfig as Record<string, any>
      : {};
    return {
      ...safe,
      hasCredentials: !!credentialsEncrypted,
      hasSession: !!sessionEncrypted,
      viewConfig: {
        tableColumns: Array.isArray(columnsConfig.view?.tableColumns) ? columnsConfig.view.tableColumns : [],
        filterColumns: Array.isArray(columnsConfig.view?.filterColumns) ? columnsConfig.view.filterColumns : [],
      },
    };
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

  private async rawColumnsForConnection(id: string, businessId: string, includeMapped: boolean) {
    const connection = await this.prisma.syncConnection.findFirst({
      where: { id, businessId },
      select: { id: true, provider: true, name: true },
    });
    if (!connection) throw new NotFoundException('Conexión no encontrada');
    const rows = await this.prisma.syncedProduct.findMany({
      where: { connectionId: id, businessId, raw: { not: Prisma.DbNull } },
      take: 400,
      orderBy: { syncedAt: 'desc' },
    });
    return {
      connection,
      total: rows.length,
      columns: discoverRawColumns(rows as Array<Record<string, any>>, includeMapped ? SYNCED_MAPPED_FIELDS : []),
    };
  }

  async getRawColumns(id: string, businessId: string) {
    return this.rawColumnsForConnection(id, businessId, true);
  }

  async getRawColumnsOverview(businessId: string) {
    const connections = await this.prisma.syncConnection.findMany({
      where: { businessId },
      select: { id: true, provider: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    const discoveries = await Promise.all(
      connections.map((connection) => this.rawColumnsForConnection(connection.id, businessId, false)),
    );
    const union = new Map<string, {
      types: Set<RawColumnType>;
      providers: Array<{ provider: string; connectionId: string; coverage: number; total: number; sample: string | null }>;
    }>();
    for (const discovery of discoveries) {
      for (const column of discovery.columns) {
        const current = union.get(column.path) ?? { types: new Set<RawColumnType>(), providers: [] };
        current.types.add(column.type);
        current.providers.push({
          provider: discovery.connection.provider,
          connectionId: discovery.connection.id,
          coverage: column.coverage,
          total: column.total,
          sample: column.samples[0] ?? null,
        });
        union.set(column.path, current);
      }
    }
    return [...union.entries()]
      .map(([path, info]) => ({
        path,
        type: info.types.size === 1 ? [...info.types][0] : 'mixed',
        providers: info.providers,
        coincidence: new Set(info.providers.map((provider) => provider.provider)).size,
      }))
      .sort((a, b) => b.coincidence - a.coincidence || a.path.localeCompare(b.path));
  }

  async updateViewConfig(
    id: string,
    businessId: string,
    input: { tableColumns?: unknown; filterColumns?: unknown },
  ) {
    const connection = await this.prisma.syncConnection.findFirst({ where: { id, businessId } });
    if (!connection) throw new NotFoundException('Conexión no encontrada');
    const normalize = (value: unknown, label: string) => {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new BadRequestException(`${label} debe ser una lista de paths.`);
      }
      return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].slice(0, 200);
    };
    const tableColumns = normalize(input?.tableColumns ?? [], 'tableColumns');
    const filterColumns = normalize(input?.filterColumns ?? [], 'filterColumns');
    const current = connection.columnsConfig && typeof connection.columnsConfig === 'object' && !Array.isArray(connection.columnsConfig)
      ? connection.columnsConfig as Record<string, unknown>
      : {};
    const columnsConfig = { ...current, view: { tableColumns, filterColumns } };
    const updated = await this.prisma.syncConnection.update({
      where: { id },
      data: { columnsConfig: columnsConfig as Prisma.InputJsonValue },
    });
    return this.sanitizeConnection(updated);
  }

  private static MAP_NOISE = /installment|paymentoption|teaser|highlight|promotion|\.quota\.|blacklist|clusterhighlights|specification|metatag|releasedate|cacheid/i;

  private static toNums(samples: string[]): number[] {
    return samples
      .map((x) => Number(String(x).replace(/[^0-9.\-]/g, '')))
      .filter((n) => Number.isFinite(n));
  }
  private static half(samples: string[], predicate: (v: string) => boolean): boolean {
    return samples.length > 0 && samples.filter((v) => predicate(String(v))).length >= Math.ceil(samples.length / 2);
  }
  private static V = {
    ean: (s: string[]) => SyncService.half(s, (v) => /^\d{8,14}$/.test(v.trim()) && v.trim().length >= 12),
    iva: (s: string[]) => { const n = SyncService.toNums(s); return n.length > 0 && n.every((x) => [0, 2.5, 5, 10.5, 21, 27].includes(x)); },
    stock: (s: string[]) => { const n = SyncService.toNums(s); return n.length > 0 && n.every((x) => Number.isInteger(x) && x >= 0 && x < 100000); },
    price: (s: string[]) => { const n = SyncService.toNums(s); return n.length > 0 && n.every((x) => x > 0) && n.some((x) => x >= 10 || !Number.isInteger(x)); },
    int: (s: string[]) => { const n = SyncService.toNums(s); return n.length > 0 && n.every((x) => Number.isInteger(x) && x >= 0); },
    img: (s: string[]) => SyncService.half(s, (v) => /^https?:\/\/\S+(assets|tokincms|\.(jpe?g|png|webp|gif|svg))/i.test(v)),
    url: (s: string[]) => SyncService.half(s, (v) => /^https?:\/\//i.test(v)),
    bool: (s: string[], t: RawColumnType[]) => t.includes('boolean') || SyncService.half(s, (v) => /^(true|false|si|sí|no|1|0)$/i.test(v.trim())),
    name: (s: string[]) => SyncService.half(s, (v) => /[a-záéíóúñ]/i.test(v) && v.trim().length >= 6),
  };

  private static TARGET_DETECTORS: Array<{ field: string; name: RegExp; value?: (s: string[], t: RawColumnType[]) => boolean; paths?: RegExp }> = [
    { field: 'ean', name: /^(ean|barcode|gtin|codigo de barras|ean ?13|ean ?unit)$/, value: (s) => SyncService.V.ean(s), paths: /(^|\.)ean(\[\]|$)/i },
    { field: 'externalId', name: /^(product ?id|id producto|id externo|external ?id|id)$/ },
    { field: 'sku', name: /^(sku|sku id|item ?id|codigo interno|internal ?code|cod ?articulo)$/ },
    { field: 'supplierRef', name: /^(ref ?id|reference ?id|referencia|supplier ?ref|product ?reference|cod ?proveedor)$/ },
    { field: 'eanBox', name: /(ean).*(bulto|box|bu)$|ean ?box/ },
    { field: 'ivaAlicuota', name: /(iva|tax|alicuota|impuesto|vat)/, value: (s) => SyncService.V.iva(s) },
    { field: 'listPrice', name: /(list ?price|precio ?lista|price ?from|pvp)/, value: (s) => SyncService.V.price(s) },
    { field: 'cost', name: /(selling ?price|^price$|precio$|costo|cost|price ?with ?tax|precio ?venta)/, value: (s) => SyncService.V.price(s) },
    { field: 'stock', name: /(stock|available ?quantity|existencia|cantidad|disponible|on ?hand)/, value: (s) => SyncService.V.stock(s) },
    { field: 'imageUrl', name: /(image|imagen|thumbnail|foto|picture)/, value: (s) => SyncService.V.img(s) },
    { field: 'link', name: /(link|url|permalink|detail ?url|slug)/, value: (s) => SyncService.V.url(s) },
    { field: 'brand', name: /^(brand|brand ?name|marca)$/ },
    { field: 'category', name: /^(category|categoria|department|departamento|rubro)$/ },
    { field: 'subcategory', name: /^(subcategory|subcategoria|sub ?department|sub ?rubro)$/ },
    { field: 'name', name: /^(name|product ?name|nombre|descripcion|titulo|title)$/, value: (s) => SyncService.V.name(s) },
    { field: 'weight', name: /(weight|peso|net ?weight)/ },
    { field: 'unitsPerBox', name: /(units ?per ?box|unidades ?por ?bulto|units ?un ?per ?bu|per ?bulto)/, value: (s) => SyncService.V.int(s) },
    { field: 'unitsPerDisplay', name: /(units ?per ?display|unidades ?por ?display|units ?un ?per ?di)/, value: (s) => SyncService.V.int(s) },
    { field: 'displaysPerBox', name: /(displays ?per ?box|display.*bulto|units ?di ?per ?bu)/, value: (s) => SyncService.V.int(s) },
    { field: 'retornable', name: /(retornable|returnable|retorno)/, value: (s, t) => SyncService.V.bool(s, t) },
    { field: 'available', name: /(available|activo|enabled|is ?active|habilitado)/, value: (s, t) => SyncService.V.bool(s, t) },
  ];

  private normalizeLeaf(path: string): string {
    const leaf = (path.split('.').pop() || path).replace(/\[\]/g, '');
    return leaf
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-]+/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private detectTarget(path: string, samples: string[], types: RawColumnType[]): { field: string; confidence: string } | null {
    const leaf = this.normalizeLeaf(path);
    let best = { field: '', score: 0 };
    for (const det of SyncService.TARGET_DETECTORS) {
      let score = 0;
      if (det.name.test(leaf)) score += 2;
      if (det.paths && det.paths.test(path)) score += 4;
      if (det.value && det.value(samples, types)) score += 3;
      if (score > best.score) best = { field: det.field, score };
    }
    // Señales de valor inequívocas, aun sin coincidencia de nombre.
    if (best.score < 2) {
      if (SyncService.V.ean(samples)) best = { field: 'ean', score: 3 };
      else if (SyncService.V.img(samples)) best = { field: 'imageUrl', score: 3 };
    }
    if (best.score < 2) return null;
    const confidence = best.score >= 5 ? 'alta' : best.score >= 3 ? 'media' : 'baja';
    return { field: best.field, confidence };
  }

  async getMappingSuggestions(businessId: string) {
    const rank = (c: string) => (c === 'alta' ? 3 : c === 'media' ? 2 : 1);
    const connections = await this.prisma.syncConnection.findMany({
      where: { businessId },
      select: { id: true, provider: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    const discoveries = await Promise.all(connections.map((c) => this.rawColumnsForConnection(c.id, businessId, false)));
    const union = new Map<string, { types: Set<RawColumnType>; providers: Array<{ provider: string; connectionId: string; sample: string | null }>; samples: string[] }>();
    for (const discovery of discoveries) {
      for (const col of discovery.columns) {
        if (col.path.startsWith('synced.')) continue;
        if (SyncService.MAP_NOISE.test(col.path)) continue;
        const entry = union.get(col.path) ?? { types: new Set<RawColumnType>(), providers: [], samples: [] };
        entry.types.add(col.type);
        entry.providers.push({ provider: discovery.connection.provider, connectionId: discovery.connection.id, sample: col.samples[0] ?? null });
        entry.samples.push(...col.samples);
        union.set(col.path, entry);
      }
    }
    const groups = new Map<string, {
      field: string; confidence: string;
      members: Array<{ path: string; type: RawColumnType; confidence: string; providers: Array<{ provider: string; connectionId: string; sample: string | null }> }>;
    }>();
    for (const [path, entry] of union) {
      const detection = this.detectTarget(path, entry.samples, [...entry.types]);
      if (!detection) continue;
      const group = groups.get(detection.field) ?? { field: detection.field, confidence: 'baja', members: [] };
      if (rank(detection.confidence) > rank(group.confidence)) group.confidence = detection.confidence;
      group.members.push({
        path,
        type: entry.types.size === 1 ? [...entry.types][0] : 'mixed',
        confidence: detection.confidence,
        providers: entry.providers,
      });
      groups.set(detection.field, group);
    }
    return [...groups.values()]
      .map((group) => ({
        suggestedField: group.field,
        label: group.field,
        confidence: group.confidence,
        providers: [...new Set(group.members.flatMap((m) => m.providers.map((p) => p.provider)))],
        columns: group.members.sort((a, b) => rank(b.confidence) - rank(a.confidence)),
      }))
      .sort((a, b) => rank(b.confidence) - rank(a.confidence) || b.providers.length - a.providers.length || a.label.localeCompare(b.label));
  }

  async approveMappingSuggestion(
    businessId: string,
    input: { field?: unknown; members?: Array<{ connectionId?: unknown; path?: unknown }> },
  ) {
    const field = typeof input?.field === 'string' && input.field.trim() ? input.field.trim() : null;
    if (!field) throw new BadRequestException('Falta el campo destino (field).');
    const members = Array.isArray(input?.members) ? input.members : [];
    const byConn = new Map<string, string[]>();
    for (const m of members) {
      const connId = typeof m?.connectionId === 'string' ? m.connectionId : null;
      const path = typeof m?.path === 'string' ? m.path : null;
      if (!connId || !path) continue;
      const list = byConn.get(connId) ?? [];
      list.push(path);
      byConn.set(connId, list);
    }
    if (!byConn.size) throw new BadRequestException('No hay columnas válidas para mapear.');
    let updated = 0;
    for (const [connId, paths] of byConn) {
      const conn = await this.prisma.syncConnection.findFirst({ where: { id: connId, businessId } });
      if (!conn) continue;
      const cfg = conn.columnsConfig && typeof conn.columnsConfig === 'object' && !Array.isArray(conn.columnsConfig)
        ? (conn.columnsConfig as Record<string, any>)
        : {};
      const aliases = { ...(cfg.aliases && typeof cfg.aliases === 'object' ? cfg.aliases : {}) };
      for (const p of paths) aliases[p] = field;
      await this.prisma.syncConnection.update({
        where: { id: connId },
        data: { columnsConfig: { ...cfg, aliases } as Prisma.InputJsonValue },
      });
      updated += paths.length;
    }
    return { ok: true, field, aliasesSet: updated };
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

  async updateSession(
    id: string,
    businessId: string,
    session: string | Record<string, unknown> | undefined,
    expiresAt?: string,
  ) {
    await this.getConnection(id, businessId);
    if (
      (typeof session !== 'string' || !session.trim()) &&
      (!session || typeof session !== 'object' || Array.isArray(session))
    ) {
      throw new BadRequestException('Sesión inválida.');
    }
    const parsedExpiry = expiresAt ? new Date(expiresAt) : null;
    if (parsedExpiry && Number.isNaN(parsedExpiry.getTime())) {
      throw new BadRequestException('Fecha de vencimiento inválida.');
    }
    const serialized = typeof session === 'string' ? session : JSON.stringify(session);
    const connection = await this.prisma.syncConnection.update({
      where: { id },
      data: {
        sessionEncrypted: encryptSecret(serialized),
        sessionExpiresAt: parsedExpiry,
      },
    });
    return { hasSession: true, sessionExpiresAt: connection.sessionExpiresAt };
  }

  async deleteSession(id: string, businessId: string) {
    await this.getConnection(id, businessId);
    await this.prisma.syncConnection.update({
      where: { id },
      data: { sessionEncrypted: null, sessionExpiresAt: null },
    });
    return { hasSession: false, sessionExpiresAt: null };
  }

  /** Endpoint sensible para runners autenticados con el JWT del negocio dueño. */
  async getCredentialsSecret(id: string, businessId: string) {
    const connection = await this.prisma.syncConnection.findFirst({ where: { id, businessId } });
    if (!connection) throw new NotFoundException('Conexión no encontrada');
    const credentials = connection.credentialsEncrypted
      ? JSON.parse(decryptSecret(connection.credentialsEncrypted))
      : null;
    let session: string | Record<string, unknown> | null = null;
    if (connection.sessionEncrypted) {
      const decrypted = decryptSecret(connection.sessionEncrypted);
      try {
        session = JSON.parse(decrypted);
      } catch {
        session = decrypted;
      }
    }
    return { credentials, session, sessionExpiresAt: connection.sessionExpiresAt };
  }

  async upsertSupplierAccount(id: string, businessId: string, body: SupplierAccountInput) {
    await this.getConnection(id, businessId);
    if (!body?.account || typeof body.account !== 'object') {
      throw new BadRequestException('Faltan los datos de la cuenta del proveedor.');
    }
    const decimal = (value: unknown) => {
      if (value == null || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? new Decimal(parsed) : null;
    };
    const date = (value: unknown) => {
      if (!value) return null;
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.supplierAccount.upsert({
        where: { connectionId: id },
        create: {
          connectionId: id,
          businessId,
          clienteId: body.account?.clienteId ?? null,
          razonSocial: body.account?.razonSocial ?? null,
          balance: decimal(body.account?.balance),
          creditLimit: decimal(body.account?.creditLimit),
          availableCredit: decimal(body.account?.availableCredit),
          currency: body.account?.currency || 'ARS',
        },
        update: {
          clienteId: body.account?.clienteId,
          razonSocial: body.account?.razonSocial,
          balance: body.account?.balance !== undefined ? decimal(body.account.balance) : undefined,
          creditLimit: body.account?.creditLimit !== undefined ? decimal(body.account.creditLimit) : undefined,
          availableCredit: body.account?.availableCredit !== undefined ? decimal(body.account.availableCredit) : undefined,
          currency: body.account?.currency,
        },
      });
      if (body.invoices !== undefined) {
        await tx.supplierInvoice.deleteMany({ where: { accountId: account.id } });
        if (body.invoices.length) await tx.supplierInvoice.createMany({ data: body.invoices.map((invoice) => ({
          accountId: account.id,
          number: invoice.number != null ? String(invoice.number) : null,
          date: date(invoice.date),
          dueDate: date(invoice.dueDate),
          total: decimal(invoice.total),
          saldoPendiente: decimal(invoice.saldoPendiente),
          status: invoice.status != null ? String(invoice.status) : null,
          pdfUrl: invoice.pdfUrl != null ? String(invoice.pdfUrl) : null,
          raw: invoice.raw ?? Prisma.JsonNull,
        })) });
      }
      if (body.movements !== undefined) {
        await tx.supplierAccountMovement.deleteMany({ where: { accountId: account.id } });
        if (body.movements.length) await tx.supplierAccountMovement.createMany({ data: body.movements.map((movement) => ({
          accountId: account.id,
          date: date(movement.date),
          type: movement.type != null ? String(movement.type) : null,
          reference: movement.reference != null ? String(movement.reference) : null,
          amount: decimal(movement.amount),
          runningBalance: decimal(movement.runningBalance),
        })) });
      }
      if (body.credits !== undefined) {
        await tx.supplierCredit.deleteMany({ where: { accountId: account.id } });
        if (body.credits.length) await tx.supplierCredit.createMany({ data: body.credits.map((credit) => ({
          accountId: account.id,
          tipo: credit.tipo != null ? String(credit.tipo) : null,
          montoDisponible: decimal(credit.montoDisponible),
          montoUsado: decimal(credit.montoUsado),
          vencimiento: date(credit.vencimiento),
          condiciones: credit.condiciones != null ? String(credit.condiciones) : null,
        })) });
      }
    });
    return { ok: true };
  }

  async getSupplierAccount(id: string, businessId: string) {
    await this.getConnection(id, businessId);
    return this.prisma.supplierAccount.findFirst({
      where: { connectionId: id, businessId },
      include: {
        invoices: { orderBy: { date: 'desc' } },
        movements: { orderBy: { date: 'desc' } },
        credits: { orderBy: { vencimiento: 'desc' } },
      },
    });
  }

  async replaceSupplierOrders(id: string, businessId: string, orders: any[]) {
    await this.getConnection(id, businessId);
    if (!Array.isArray(orders)) throw new BadRequestException('Pedidos inválidos.');
    const decimal = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : new Decimal(Number(value));
    const date = (value: unknown) => { const parsed = value ? new Date(String(value)) : null; return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null; };
    await this.prisma.$transaction(async (tx) => {
      await tx.supplierOrder.deleteMany({ where: { connectionId: id, businessId, source: 'harvested' } });
      for (const order of orders) {
        await tx.supplierOrder.create({
          data: {
            connectionId: id,
            businessId,
            source: 'harvested',
            externalOrderId: order.externalOrderId != null ? String(order.externalOrderId) : null,
            status: order.status != null ? String(order.status) : null,
            total: decimal(order.total),
            deliveryDate: date(order.deliveryDate),
            tracking: order.tracking != null ? String(order.tracking) : null,
            placedAt: date(order.placedAt),
            raw: order.raw ?? Prisma.JsonNull,
            items: { create: (Array.isArray(order.items) ? order.items : []).map((item: any) => ({
              name: item.name != null ? String(item.name) : null,
              uom: item.uom != null ? String(item.uom) : null,
              qty: Math.max(1, Math.trunc(Number(item.qty) || 1)),
              unitPrice: decimal(item.unitPrice),
              total: decimal(item.total),
            })) },
          },
        });
      }
    });
    return { ok: true, imported: orders.length };
  }

  async listSupplierOrders(id: string, businessId: string, source = 'all') {
    await this.getConnection(id, businessId);
    if (!['all', 'harvested', 'draft'].includes(source)) throw new BadRequestException('Origen de pedidos inválido.');
    return this.prisma.supplierOrder.findMany({
      where: { connectionId: id, businessId, source: source === 'all' ? undefined : source },
      include: { items: true },
      orderBy: [{ placedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createSupplierOrderDraft(
    id: string,
    businessId: string,
    body: { items?: Array<{ syncedProductId: string; uom?: string; qty: number; unitPrice: number }>; deliveryDate?: string },
  ) {
    await this.getConnection(id, businessId);
    if (!Array.isArray(body?.items) || body.items.length === 0) throw new BadRequestException('Agregá productos al pedido.');
    const productIds = [...new Set(body.items.map((item) => item.syncedProductId).filter(Boolean))];
    const products = await this.prisma.syncedProduct.findMany({ where: { id: { in: productIds }, connectionId: id, businessId } });
    const byId = new Map(products.map((product) => [product.id, product]));
    if (products.length !== productIds.length) throw new BadRequestException('Hay productos que no pertenecen a esta conexión.');
    const items = body.items.map((item) => {
      const qty = Math.trunc(Number(item.qty));
      const unitPrice = Number(item.unitPrice);
      if (!Number.isInteger(qty) || qty < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) throw new BadRequestException('Cantidad o precio inválido.');
      return { syncedProductId: item.syncedProductId, name: byId.get(item.syncedProductId)?.name, uom: item.uom || 'UN', qty, unitPrice, total: Math.round(qty * unitPrice * 100) / 100 };
    });
    const total = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
    const deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null;
    if (deliveryDate && Number.isNaN(deliveryDate.getTime())) throw new BadRequestException('Fecha de entrega inválida.');
    return this.prisma.supplierOrder.create({
      data: {
        connectionId: id, businessId, source: 'draft', status: 'borrador', total: new Decimal(total), deliveryDate,
        items: { create: items.map((item) => ({ ...item, unitPrice: new Decimal(item.unitPrice), total: new Decimal(item.total) })) },
      },
      include: { items: true },
    });
  }

  async deleteSupplierOrderDraft(id: string, businessId: string, orderId: string) {
    await this.getConnection(id, businessId);
    const order = await this.prisma.supplierOrder.findFirst({ where: { id: orderId, connectionId: id, businessId } });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    if (order.source !== 'draft') throw new BadRequestException('Solo se pueden borrar borradores.');
    await this.prisma.supplierOrder.delete({ where: { id: order.id } });
    return { ok: true };
  }

  async updateSupplierLoyalty(id: string, businessId: string, loyaltyPoints: unknown) {
    await this.getConnection(id, businessId);
    const points = Number(loyaltyPoints);
    if (!Number.isInteger(points) || points < 0) throw new BadRequestException('Puntos inválidos.');
    const account = await this.prisma.supplierAccount.upsert({
      where: { connectionId: id },
      create: { connectionId: id, businessId, loyaltyPoints: points, currency: 'ARS' },
      update: { loyaltyPoints: points },
    });
    return { ok: true, loyaltyPoints: account.loyaltyPoints };
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
  async proxyCheck() {
    try {
      const [site, ipResponse] = await Promise.all([
        proxiedFetch('https://tokintienda.com.ar/', { redirect: 'follow' }),
        proxiedFetch('https://api.ipify.org?format=json', { headers: { Accept: 'application/json' } }),
      ]);
      const ipPayload: any = ipResponse.ok ? await ipResponse.json() : null;
      return { ok: site.ok && ipResponse.ok, status: site.status, ip: typeof ipPayload?.ip === 'string' ? ipPayload.ip : null };
    } catch {
      return { ok: false, status: 0, ip: null };
    }
  }

  async runCatalogSync(id: string, businessId: string) {
    const conn = await this.getConnection(id, businessId);
    if (conn.provider === 'tokin') {
      throw new BadRequestException(
        'Tokin se sincroniza desde la extensión del navegador (Configuración → Proveedores → Descargar extensión), porque Tokin bloquea las IPs de servidor.',
      );
    }
    if (conn.provider === 'juntosplus') {
      throw new BadRequestException(
        'Juntos+ se sincroniza con el runner local (no hay catálogo público en el servidor).',
      );
    }
    if (conn.provider !== 'mondelez') {
      throw new BadRequestException(
        `El proveedor ${conn.provider} no ofrece sincronización pública en el servidor. Usá su runner o extensión.`,
      );
    }
    const run = await this.prisma.syncRun.create({
      data: { connectionId: id, status: 'running' },
    });
    try {
      const items: NormalizedItem[] = await this.mondelez.fetchCatalog();
      const withCost = false;
      const upserted = await this.upsertItems(businessId, id, items, withCost);
      const withPrice = items.filter((item) => item.cost != null).length;
      const finished = await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          itemsFetched: items.length,
          itemsUpserted: upserted,
          finishedAt: new Date(),
          message: withCost
            ? `Catálogo Tokin autenticado: ${withPrice} con costo B2B`
            : 'Catálogo sincronizado sin costo autenticado; se preservaron costos existentes',
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
    const connection = await this.prisma.syncConnection.findFirst({ where: { id: connectionId, businessId }, select: { priceMarkup: true } });
    const markup = Number(connection?.priceMarkup ?? 0);
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
        const previousPrice = await tx.syncedPriceHistory.findFirst({
          where: { syncedProductId: syncedProduct.id },
          orderBy: { capturedAt: 'desc' },
        });
        const sameValue = (left: unknown, right: unknown) =>
          (left == null && right == null) ||
          (left != null && right != null && Number(left) === Number(right));
        if (!previousPrice || !sameValue(previousPrice.cost, syncedProduct.cost) || !sameValue(previousPrice.listPrice, syncedProduct.listPrice)) {
          const costUnit = bulkCostToUnit(
            syncedProduct.cost != null ? Number(syncedProduct.cost) : null,
            syncedProduct.unitsPerBox,
          );
          const sellingPrice = costUnit != null
            ? Math.round(costUnit * (1 + markup / 100) * 100) / 100
            : null;
          await tx.syncedPriceHistory.create({
            data: {
              syncedProductId: syncedProduct.id,
              connectionId,
              cost: syncedProduct.cost,
              listPrice: syncedProduct.listPrice,
              sellingPrice: sellingPrice != null ? new Decimal(sellingPrice) : null,
            },
          });
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
    const tokens = opts.q?.trim().split(/\s+/).filter(Boolean) ?? [];
    let matchedIds: string[] | undefined;
    let usePrismaFallback = false;
    if (tokens.length) {
      try {
        const tokenConditions = tokens.map((token) => {
          const contains = `%${token}%`;
          return Prisma.sql`(
            unaccent(lower(sp."name")) LIKE unaccent(lower(${contains}))
            OR unaccent(lower(COALESCE(sp."brand", ''))) LIKE unaccent(lower(${contains}))
            OR COALESCE(sp."ean", '') ILIKE ${contains}
            OR COALESCE(sp."eanUnit", '') ILIKE ${contains}
            OR COALESCE(sp."eanBox", '') ILIKE ${contains}
            OR COALESCE(sp."sku", '') ILIKE ${contains}
            OR COALESCE(sp."supplierRef", '') ILIKE ${contains}
            OR COALESCE(sp."externalId", '') ILIKE ${contains}
          )`;
        });
        const matches = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT sp."id"
          FROM "SyncedProduct" sp
          WHERE sp."connectionId" = ${id}
            AND sp."businessId" = ${businessId}
            AND ${Prisma.join(tokenConditions, ' AND ')}
        `);
        matchedIds = matches.map((match) => match.id);
      } catch (error) {
        usePrismaFallback = true;
        this.logger.warn(
          `Búsqueda avanzada de productos sincronizados no disponible; se usa fallback Prisma: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const rows = await this.prisma.syncedProduct.findMany({
      where: {
        connectionId: id,
        businessId,
        available: opts.onlyAvailable ? true : undefined,
        cost: opts.onlyWithCost ? { not: null } : undefined,
        id: matchedIds ? { in: matchedIds } : undefined,
        AND: usePrismaFallback
          ? tokens.map((token) => ({
              OR: [
                { name: { contains: token, mode: 'insensitive' as const } },
                { brand: { contains: token, mode: 'insensitive' as const } },
                { ean: { contains: token } },
                { eanUnit: { contains: token } },
                { eanBox: { contains: token } },
                { sku: { contains: token, mode: 'insensitive' as const } },
                { supplierRef: { contains: token, mode: 'insensitive' as const } },
                { externalId: { contains: token, mode: 'insensitive' as const } },
              ],
            }))
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

  async getSyncedPriceHistory(id: string, businessId: string, syncedProductId: string) {
    const product = await this.prisma.syncedProduct.findFirst({ where: { id: syncedProductId, connectionId: id, businessId }, select: { id: true } });
    if (!product) throw new NotFoundException('Producto sincronizado no encontrado.');
    return this.prisma.syncedPriceHistory.findMany({
      where: { syncedProductId, connectionId: id },
      select: { capturedAt: true, cost: true, listPrice: true, sellingPrice: true },
      orderBy: { capturedAt: 'asc' },
    });
  }

  async getPriceChanges(id: string, businessId: string, days = 30, threshold = 10) {
    await this.getConnection(id, businessId);
    const safeDays = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), 3650) : 30;
    const safeThreshold = Number.isFinite(threshold) ? Math.max(threshold, 0) : 10;
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const products = await this.prisma.syncedProduct.findMany({
      where: { connectionId: id, businessId, priceHistory: { some: { capturedAt: { gte: since }, cost: { not: null } } } },
      select: {
        id: true,
        name: true,
        priceHistory: {
          where: { capturedAt: { gte: since }, cost: { not: null } },
          select: { cost: true, capturedAt: true },
          orderBy: { capturedAt: 'asc' },
        },
      },
    });
    return products.flatMap((product) => {
      if (product.priceHistory.length < 2) return [];
      const from = Number(product.priceHistory[0].cost);
      const to = Number(product.priceHistory[product.priceHistory.length - 1].cost);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return [];
      const changePct = Math.round(((to - from) / from) * 10000) / 100;
      if (Math.abs(changePct) < safeThreshold) return [];
      return [{ syncedProductId: product.id, name: product.name, from, to, changePct, direction: changePct >= 0 ? 'up' : 'down' }];
    }).sort((left, right) => Math.abs(right.changePct) - Math.abs(left.changePct));
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
    opts: { onlyWithCost?: boolean; onlyAvailable?: boolean; ids?: string[] } = {},
  ) {
    const conn = await this.getConnection(id, businessId);
    let selectedIds: string[] | undefined;
    if (opts.ids !== undefined) {
      if (!Array.isArray(opts.ids)) throw new BadRequestException('La selección de productos es inválida.');
      selectedIds = [...new Set(opts.ids.filter((productId): productId is string => typeof productId === 'string' && productId.length > 0))];
      if (selectedIds.length === 0) throw new BadRequestException('Seleccioná al menos un producto para importar.');
    }
    const markup = Number(conn.priceMarkup) || 0;
    const minStock = conn.defaultMinStock || 0;
    const map = this.getMapping(conn);

    const synced = await this.prisma.syncedProduct.findMany({
      where: {
        connectionId: id,
        id: selectedIds ? { in: selectedIds } : undefined,
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
      where: { autoSync: true, enabled: true, provider: { in: ['mondelez', 'tokin'] } },
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
