import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessService } from '../business/business.service';
import { PRECIOS_CLAROS_BASE } from './precios-claros.constants';

export type PreciosClarosHit = {
  ean: string;
  name: string;
  brand?: string | null;
  presentation?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  score?: number;
  source: 'precios-claros' | 'dia';
};

export type PreciosClarosConfig = {
  enabled: boolean;
  lat?: number;
  lng?: number;
  /** IDs tipo "15-1-455" (comercio-bandera-sucursal) */
  branchIds?: string[];
};

type PcProducto = {
  id?: string;
  nombre?: string;
  marca?: string;
  presentacion?: string;
  precioMin?: number;
  precioMax?: number;
};

function readPreciosClarosConfig(posConfig: unknown): PreciosClarosConfig {
  if (!posConfig || typeof posConfig !== 'object') {
    return { enabled: true, lat: -34.6037, lng: -58.3816 };
  }
  const root = posConfig as Record<string, unknown>;
  const raw = root.preciosClaros;
  if (!raw || typeof raw !== 'object') {
    return { enabled: true, lat: -34.6037, lng: -58.3816 };
  }
  const p = raw as Record<string, unknown>;
  const lat = typeof p.lat === 'number' ? p.lat : Number(p.lat);
  const lng = typeof p.lng === 'number' ? p.lng : Number(p.lng);
  const branchIds = Array.isArray(p.branchIds)
    ? p.branchIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
    : [];
  return {
    enabled: p.enabled === false ? false : true,
    lat: Number.isFinite(lat) ? lat : -34.6037,
    lng: Number.isFinite(lng) ? lng : -58.3816,
    branchIds: branchIds.length ? branchIds.slice(0, 50) : undefined,
  };
}

function stripDiacritics(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeName(s: string) {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras que no sirven para match (muy comunes en góndola). */
const STOP_TOKENS = new Set([
  'de', 'la', 'el', 'los', 'las', 'y', 'con', 'en', 'un', 'una', 'unos', 'unas',
  'por', 'para', 'del', 'al', 'x', 'gr', 'g', 'kg', 'ml', 'lt', 'l', 'cc', 'cm',
  'pack', 'unidad', 'unidades', 'u', 'und', 'desc', 'descartable', 'retornable',
  'botella', 'lata', 'caja', 'paq', 'paquete',
]);

function meaningfulTokens(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t));
}

/** Score 0..1 por tokens + contención (ignora stopwords). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return 0.72 + (0.28 * shorter) / longer;
  }
  const ta = new Set(meaningfulTokens(a));
  const tb = new Set(meaningfulTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  if (!inter) {
    // Prefijos cortos: "coca" vs "cocacola"
    for (const x of ta) {
      for (const y of tb) {
        if (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))) {
          inter += 0.5;
          break;
        }
      }
    }
  }
  const union = ta.size + tb.size - Math.floor(inter);
  const jaccard = union ? inter / union : 0;
  const coverage = inter / ta.size;
  return Math.min(1, jaccard * 0.5 + coverage * 0.5);
}

/** Mejor score entre variantes (nombre solo / marca+nombre / etc.). */
function bestNameScore(productLabel: string, hit: { name: string; brand?: string | null; presentation?: string | null }) {
  const hitFull = [hit.brand, hit.name, hit.presentation].filter(Boolean).join(' ');
  return Math.max(
    nameSimilarity(productLabel, hit.name),
    nameSimilarity(productLabel, hitFull),
    hit.brand ? nameSimilarity(productLabel, `${hit.brand} ${hit.name}`) : 0,
  );
}

export function normalizeProductName(s: string) {
  return normalizeName(s);
}

@Injectable()
export class PreciosClarosService {
  private readonly logger = new Logger(PreciosClarosService.name);

  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
  ) {}

  private async configFor(businessId: string): Promise<PreciosClarosConfig> {
    const biz = await this.prisma.business.findFirst({
      where: { id: businessId },
      select: { posConfig: true },
    });
    return readPreciosClarosConfig(biz?.posConfig);
  }

  private geoQuery(cfg: PreciosClarosConfig): URLSearchParams {
    const params = new URLSearchParams();
    if (cfg.branchIds?.length) {
      params.set('array_sucursales', cfg.branchIds.join(','));
    } else if (cfg.lat != null && cfg.lng != null) {
      params.set('lat', String(cfg.lat));
      params.set('lng', String(cfg.lng));
    } else {
      params.set('lat', '-34.6037');
      params.set('lng', '-58.3816');
    }
    return params;
  }

  /** Cache corta de sucursales por negocio (evita pedirlas en cada producto). */
  private branchCache = new Map<string, { ids: string[]; at: number }>();

  private async resolveBranchIds(businessId: string, cfg: PreciosClarosConfig): Promise<string[]> {
    if (cfg.branchIds?.length) return cfg.branchIds.slice(0, 30);
    const cached = this.branchCache.get(businessId);
    if (cached && Date.now() - cached.at < 30 * 60_000) return cached.ids;
    const lat = cfg.lat ?? -34.6037;
    const lng = cfg.lng ?? -58.3816;
    try {
      const url = `${PRECIOS_CLAROS_BASE}/sucursales?lat=${lat}&lng=${lng}&limit=30`;
      const data = (await this.fetchJson(url)) as { sucursales?: Array<{ id?: string }> };
      const ids = (data.sucursales || [])
        .map((s) => String(s.id || '').trim())
        .filter(Boolean)
        .slice(0, 30);
      if (ids.length) this.branchCache.set(businessId, { ids, at: Date.now() });
      return ids;
    } catch (err) {
      this.logger.warn(`sucursales falló: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  private mapProducto(p: PcProducto, score?: number): PreciosClarosHit | null {
    const ean = String(p.id ?? '').replace(/\D/g, '');
    if (ean.length < 8) return null;
    return {
      ean,
      name: String(p.nombre ?? '').trim() || ean,
      brand: p.marca ? String(p.marca).trim() : null,
      presentation: p.presentacion ? String(p.presentacion).trim() : null,
      priceMin: typeof p.precioMin === 'number' ? p.precioMin : null,
      priceMax: typeof p.precioMax === 'number' ? p.precioMax : null,
      score,
      source: 'precios-claros',
    };
  }

  private async fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'es-AR,es;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (compatible; StockRapido/1.0; +https://stockrapido.app)',
      },
      signal: AbortSignal.timeout(14_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`Precios Claros HTTP ${res.status}: ${text.slice(0, 200)}`);
      throw new BadRequestException(`Precios Claros respondió ${res.status}`);
    }
    return res.json();
  }

  async searchByEan(businessId: string, ean: string): Promise<PreciosClarosHit[]> {
    const code = ean.replace(/\D/g, '');
    if (code.length < 8) return [];
    const cfg = await this.configFor(businessId);
    if (!cfg.enabled) return [];

    const params = this.geoQuery(cfg);
    params.set('id_producto', code);
    const url = `${PRECIOS_CLAROS_BASE}/producto?${params.toString()}`;
    try {
      const data = (await this.fetchJson(url)) as { producto?: PcProducto };
      const hit = data?.producto ? this.mapProducto(data.producto, 1) : null;
      if (hit) await this.upsertCatalog([hit]);
      return hit ? [hit] : [];
    } catch (err) {
      this.logger.warn(`searchByEan falló: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  private async fetchPcProductos(
    query: string,
    branchIds: string[],
    cfg: PreciosClarosConfig,
    limit: number,
  ): Promise<PcProducto[]> {
    const params = new URLSearchParams();
    params.set('string', query);
    params.set('limit', String(Math.min(50, Math.max(8, limit))));
    if (branchIds.length) {
      params.set('array_sucursales', branchIds.join(','));
    } else {
      params.set('lat', String(cfg.lat ?? -34.6037));
      params.set('lng', String(cfg.lng ?? -58.3816));
    }
    const url = `${PRECIOS_CLAROS_BASE}/productos?${params.toString()}`;
    const data = (await this.fetchJson(url)) as { productos?: PcProducto[] };
    return Array.isArray(data?.productos) ? data.productos : [];
  }

  /**
   * Variantes de texto: la API de PC es estricta con multi-palabra
   * ("mogul ositos" = 0, "mogul" = 34).
   */
  private buildSearchQueries(term: string): string[] {
    const tokens = meaningfulTokens(term);
    const out: string[] = [];
    const push = (q: string) => {
      const t = q.trim();
      if (t.length >= 2 && !out.includes(t)) out.push(t);
    };
    if (tokens.length) {
      push(tokens.slice(0, 3).join(' '));
      push(tokens.slice(0, 2).join(' '));
      for (const t of tokens.slice(0, 3)) push(t);
    } else {
      push(term.slice(0, 60));
    }
    return out.slice(0, 5);
  }

  async searchByName(businessId: string, q: string, limit = 20): Promise<PreciosClarosHit[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const cfg = await this.configFor(businessId);
    if (!cfg.enabled) return [];

    const branchIds = await this.resolveBranchIds(businessId, cfg);
    const queries = this.buildSearchQueries(term);
    const mergedPc = new Map<string, PcProducto>();

    for (const query of queries) {
      try {
        const list = await this.fetchPcProductos(query, branchIds, cfg, limit);
        for (const p of list) {
          const ean = String(p.id ?? '').replace(/\D/g, '');
          if (ean.length >= 8 && !mergedPc.has(ean)) mergedPc.set(ean, p);
        }
        // Si con una query corta ya trajimos bastante, no hace falta seguir.
        if (mergedPc.size >= limit && query.split(/\s+/).length === 1) break;
      } catch (err) {
        this.logger.warn(`PC query "${query}" falló: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const hits: PreciosClarosHit[] = [];
    for (const p of mergedPc.values()) {
      const hit = this.mapProducto(p);
      if (!hit) continue;
      hits.push({ ...hit, score: bestNameScore(term, hit), source: 'precios-claros' });
    }
    hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    // Fallback Día online si PC no dio nada útil.
    if (hits.length < 3 || (hits[0]?.score ?? 0) < 0.35) {
      const fromDia = await this.searchDia(term, limit);
      for (const hit of fromDia) {
        const prev = hits.find((h) => h.ean === hit.ean);
        if (!prev) hits.push(hit);
        else if ((hit.score ?? 0) > (prev.score ?? 0)) Object.assign(prev, hit);
      }
      hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    const top = hits.slice(0, limit);
    await this.upsertCatalog(top);
    return top;
  }

  /** Catálogo público VTEX de Dia Online (EAN en productReference / items[].ean). */
  private async searchDia(q: string, limit = 15): Promise<PreciosClarosHit[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const queries = this.buildSearchQueries(term).slice(0, 3);
    const byEan = new Map<string, PreciosClarosHit>();

    for (const query of queries) {
      try {
        const url = `https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}&_from=0&_to=${Math.min(19, limit + 5)}`;
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; StockRapido/1.0)',
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;
        const list = (await res.json()) as Array<{
          productName?: string;
          brand?: string;
          productReference?: string;
          items?: Array<{ ean?: string; name?: string; sellers?: Array<{ commertialOffer?: { Price?: number } }> }>;
        }>;
        if (!Array.isArray(list)) continue;
        for (const p of list) {
          const item = p.items?.[0];
          const ean = String(item?.ean || p.productReference || '').replace(/\D/g, '');
          if (ean.length < 8 || ean.length > 18) continue;
          const name = String(p.productName || item?.name || '').trim();
          if (!name) continue;
          const price = item?.sellers?.[0]?.commertialOffer?.Price;
          const hit: PreciosClarosHit = {
            ean,
            name,
            brand: p.brand ? String(p.brand).trim() : null,
            presentation: null,
            priceMin: typeof price === 'number' ? price : null,
            priceMax: typeof price === 'number' ? price : null,
            score: bestNameScore(term, { name, brand: p.brand ?? null, presentation: null }),
            source: 'dia',
          };
          const prev = byEan.get(ean);
          if (!prev || (hit.score ?? 0) > (prev.score ?? 0)) byEan.set(ean, hit);
        }
        if (byEan.size >= limit) break;
      } catch (err) {
        this.logger.warn(`Día search falló: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return [...byEan.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
  }

  /**
   * Sugiere matches para un producto local: busca por nombre (y EAN si hay)
   * y ordena por similitud. Si hay OpenAI, reordena el top.
   */
  async matchProduct(businessId: string, productId: string, opts?: { useAi?: boolean }) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      select: {
        id: true,
        name: true,
        barcode: true,
        brand: true,
        presentation: true,
        allCodes: true,
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const byEan =
      product.barcode && product.barcode.replace(/\D/g, '').length >= 8
        ? await this.searchByEan(businessId, product.barcode)
        : [];

    const query = [product.brand, product.name, product.presentation].filter(Boolean).join(' ').trim();
    const byName = await this.searchByName(businessId, query || product.name, 25);

    const merged = new Map<string, PreciosClarosHit>();
    for (const h of [...byEan, ...byName]) {
      const scored = {
        ...h,
        score: h.score ?? nameSimilarity(product.name, h.name),
      };
      const prev = merged.get(h.ean);
      if (!prev || (scored.score ?? 0) > (prev.score ?? 0)) merged.set(h.ean, scored);
    }

    let items = [...merged.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15);

    let aiUsed = false;
    if (opts?.useAi !== false && items.length > 1) {
      const reranked = await this.rerankWithAi(businessId, product.name, items);
      if (reranked) {
        items = reranked;
        aiUsed = true;
      }
    }

    const existingCodes = new Set(
      [product.barcode, ...(product.allCodes ?? '').split(/\s+/)].filter(Boolean),
    );

    return {
      product: {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        allCodes: product.allCodes,
      },
      items: items.map((h) => ({
        ...h,
        alreadyLinked: existingCodes.has(h.ean),
      })),
      aiUsed,
    };
  }

  private async rerankWithAi(
    businessId: string,
    productName: string,
    items: PreciosClarosHit[],
  ): Promise<PreciosClarosHit[] | null> {
    const key = await this.business.getOpenaiKey(businessId).catch(() => null);
    if (!key) return null;
    const catalog = items
      .slice(0, 12)
      .map((h, i) => `${i + 1}. EAN=${h.ean} | ${h.brand ?? ''} | ${h.name} | ${h.presentation ?? ''}`)
      .join('\n');
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'Elegí el mejor match de Precios Claros para el producto del comercio argentino. Respondé SOLO un JSON: {"order":["ean1","ean2",...]} con los EAN ordenados del mejor al peor. Incluí solo EAN de la lista.',
            },
            {
              role: 'user',
              content: `Producto local: ${productName}\nCandidatos:\n${catalog}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]) as { order?: string[] };
      if (!Array.isArray(parsed.order) || !parsed.order.length) return null;
      const byEan = new Map(items.map((h) => [h.ean, h]));
      const ordered: PreciosClarosHit[] = [];
      for (const ean of parsed.order) {
        const hit = byEan.get(String(ean).replace(/\D/g, ''));
        if (hit) {
          ordered.push({ ...hit, score: Math.max(hit.score ?? 0, 0.9) });
          byEan.delete(hit.ean);
        }
      }
      for (const rest of byEan.values()) ordered.push(rest);
      return ordered;
    } catch (err) {
      this.logger.warn(`IA match Precios Claros: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Asocia EAN de Precios Claros al producto.
   * Por defecto pone el EAN oficial como barcode principal y guarda el código
   * interno/importado en allCodes (sigue encontrándose en POS/búsqueda).
   */
  async applyToProduct(
    businessId: string,
    productId: string,
    body: {
      ean: string;
      name?: string;
      brand?: string | null;
      presentation?: string | null;
      fillEmptyOnly?: boolean;
      /** true (default): barcode = EAN oficial; el código viejo queda en allCodes. */
      setAsPrimary?: boolean;
    },
  ) {
    const ean = String(body.ean ?? '').replace(/\D/g, '');
    if (ean.length < 8 || ean.length > 18) throw new BadRequestException('EAN inválido.');

    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      select: {
        id: true,
        name: true,
        barcode: true,
        brand: true,
        presentation: true,
        allCodes: true,
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const fillEmptyOnly = body.fillEmptyOnly !== false;
    const setAsPrimary = body.setAsPrimary !== false;
    const previousBarcode = product.barcode?.trim() || null;
    const codes = new Set((product.allCodes ?? '').split(/\s+/).filter(Boolean));
    if (previousBarcode) codes.add(previousBarcode);
    codes.add(ean);

    const data: Record<string, unknown> = {
      allCodes: [...codes].join(' '),
    };

    if (setAsPrimary) {
      data.barcode = ean;
    } else if (!previousBarcode) {
      data.barcode = ean;
    }

    const brand = body.brand?.trim();
    if (brand && (!fillEmptyOnly || !product.brand?.trim())) data.brand = brand;

    const presentation = body.presentation?.trim();
    if (presentation && (!fillEmptyOnly || !product.presentation?.trim())) {
      data.presentation = presentation;
    }

    // Nombre: solo si está vacío (fillEmpty)
    const incomingName = body.name?.trim();
    if (incomingName && (!fillEmptyOnly || !product.name?.trim())) {
      data.name = incomingName;
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data,
      select: {
        id: true,
        name: true,
        barcode: true,
        brand: true,
        presentation: true,
        allCodes: true,
      },
    });

    const promoted =
      setAsPrimary && Boolean(previousBarcode) && previousBarcode !== ean;

    return {
      ok: true,
      product: updated,
      eanAdded: ean,
      previousBarcode,
      setAsPrimary,
      barcodePromoted: promoted,
      barcodeUnchanged: !setAsPrimary && Boolean(previousBarcode) && previousBarcode !== ean,
      coexist: Boolean(previousBarcode) && previousBarcode !== ean,
    };
  }

  async upsertCatalog(hits: PreciosClarosHit[]) {
    for (const hit of hits) {
      const ean = hit.ean.replace(/\D/g, '');
      if (ean.length < 8) continue;
      try {
        await this.prisma.preciosClarosCatalog.upsert({
          where: { ean },
          create: {
            ean,
            name: hit.name,
            brand: hit.brand ?? null,
            presentation: hit.presentation ?? null,
            priceMin: hit.priceMin == null ? null : hit.priceMin,
            priceMax: hit.priceMax == null ? null : hit.priceMax,
            nameNorm: normalizeName(`${hit.brand ?? ''} ${hit.name} ${hit.presentation ?? ''}`),
          },
          update: {
            name: hit.name,
            brand: hit.brand ?? null,
            presentation: hit.presentation ?? null,
            priceMin: hit.priceMin == null ? null : hit.priceMin,
            priceMax: hit.priceMax == null ? null : hit.priceMax,
            nameNorm: normalizeName(`${hit.brand ?? ''} ${hit.name} ${hit.presentation ?? ''}`),
          },
        });
      } catch (err) {
        this.logger.debug(`upsert catalog ${ean}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  async catalogStats() {
    const [total, latest] = await Promise.all([
      this.prisma.preciosClarosCatalog.count(),
      this.prisma.preciosClarosCatalog.findFirst({ orderBy: { syncedAt: 'desc' }, select: { syncedAt: true } }),
    ]);
    return { total, lastSyncedAt: latest?.syncedAt ?? null };
  }

  async searchCatalog(q: string, limit = 30): Promise<PreciosClarosHit[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const norm = normalizeName(term);
    const tokens = meaningfulTokens(term).slice(0, 6);
    if (!tokens.length && norm.length < 2) return [];
    const rows = await this.prisma.preciosClarosCatalog.findMany({
      where: {
        OR: [
          { ean: { contains: term.replace(/\D/g, '') || '___' } },
          { nameNorm: { contains: norm } },
          ...tokens.map((t) => ({ nameNorm: { contains: t } })),
          ...tokens.map((t) => ({ brand: { contains: t, mode: 'insensitive' as const } })),
        ],
      },
      take: Math.min(120, Math.max(20, limit * 4)),
      orderBy: { syncedAt: 'desc' },
    });
    return rows
      .map((r) => {
        const hit = {
          ean: r.ean,
          name: r.name,
          brand: r.brand,
          presentation: r.presentation,
          priceMin: r.priceMin == null ? null : Number(r.priceMin),
          priceMax: r.priceMax == null ? null : Number(r.priceMax),
          source: 'precios-claros' as const,
        };
        return {
          ...hit,
          score: bestNameScore(term, hit),
        };
      })
      .filter((h) => (h.score ?? 0) > 0.05)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);
  }

  /** Un chunk de sync: una página de una categoría (para no timeout en serverless). */
  async syncCatalogChunk(businessId: string, cursor?: string | null) {
    const cfg = await this.configFor(businessId);
    const catsData = (await this.fetchJson(`${PRECIOS_CLAROS_BASE}/categorias`)) as {
      categorias?: Array<{ id?: string; nivel?: number; productos?: number; nombre?: string | null }>;
    };
    const categories = (catsData.categorias || [])
      .filter((c) => c.nivel === 2 && (c.productos || 0) > 0 && c.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    let catIndex = 0;
    let offset = 0;
    if (cursor?.trim()) {
      const [ci, off] = cursor.split(':');
      catIndex = Math.max(0, Number(ci) || 0);
      offset = Math.max(0, Number(off) || 0);
    }
    if (catIndex >= categories.length) {
      const stats = await this.catalogStats();
      return { done: true, upserted: 0, nextCursor: null as string | null, progress: { catIndex, totalCats: categories.length }, ...stats };
    }

    const cat = categories[catIndex];
    const params = this.geoQuery(cfg);
    params.set('id_categoria', String(cat.id));
    params.set('limit', '100');
    params.set('offset', String(offset));
    const url = `${PRECIOS_CLAROS_BASE}/productos?${params.toString()}`;
    const data = (await this.fetchJson(url)) as { productos?: PcProducto[]; total?: number };
    const list = Array.isArray(data.productos) ? data.productos : [];
    const hits = list.map((p) => this.mapProducto(p)).filter((h): h is PreciosClarosHit => Boolean(h));
    await this.upsertCatalog(hits);

    const totalInCat = typeof data.total === 'number' ? data.total : offset + list.length;
    let nextCat = catIndex;
    let nextOff = offset + list.length;
    let done = false;
    if (list.length < 100 || nextOff >= totalInCat) {
      nextCat += 1;
      nextOff = 0;
      if (nextCat >= categories.length) done = true;
    }
    const stats = await this.catalogStats();
    return {
      done,
      upserted: hits.length,
      nextCursor: done ? null : `${nextCat}:${nextOff}`,
      category: { id: cat.id, name: cat.nombre, productos: cat.productos },
      progress: { catIndex, totalCats: categories.length, offset, fetched: list.length },
      ...stats,
    };
  }

  /**
   * Semilla rápida: busca en live los nombres de productos del negocio
   * y los mete al catálogo (útil antes del barrido completo).
   */
  async seedCatalogFromBusiness(businessId: string, limit = 40) {
    const products = await this.prisma.product.findMany({
      where: { businessId, isActive: true },
      select: { name: true, brand: true },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(80, Math.max(5, limit)),
    });
    let upserted = 0;
    for (const p of products) {
      const q = [p.brand, p.name].filter(Boolean).join(' ').trim();
      if (q.length < 2) continue;
      const hits = await this.searchByName(businessId, q, 15);
      upserted += hits.length;
    }
    const stats = await this.catalogStats();
    return { upserted, productsQueried: products.length, ...stats };
  }

  async bulkPreview(
    businessId: string,
    opts: {
      onlyWithoutBarcode?: boolean;
      limit?: number;
      useAi?: boolean;
      minScore?: number;
      productIds?: string[];
      /** Si false, no llama a CloudFront live (solo catálogo local). Más rápido. */
      useLive?: boolean;
      offset?: number;
      /** Texto de búsqueda custom por producto (re-buscar). */
      queryByProductId?: Record<string, string>;
    },
  ) {
    // Lotes chicos: cada producto puede pegarle a CloudFront + OpenAI.
    const limit = Math.min(10, Math.max(1, opts.limit ?? 8));
    const offset = Math.max(0, opts.offset ?? 0);
    const minScore = opts.minScore ?? 0.4;
    const useLive = opts.useLive !== false; // online ON por defecto: sin catálogo no hay magia
    const explicitIds = [...new Set((opts.productIds ?? []).filter(Boolean))].slice(0, 40);

    let totalMatching = 0;
    let products: Array<{
      id: string;
      name: string;
      brand: string | null;
      barcode: string | null;
      presentation: string | null;
      allCodes: string | null;
      imageUrl: string | null;
    }> = [];

    if (explicitIds.length) {
      // Cliente manda los IDs del lote; no usamos offset sobre “todos”.
      const chunkIds = explicitIds.slice(0, limit);
      const found = await this.prisma.product.findMany({
        where: { businessId, isActive: true, id: { in: chunkIds } },
        select: { id: true, name: true, brand: true, barcode: true, presentation: true, allCodes: true, imageUrl: true },
      });
      const byId = new Map(found.map((p) => [p.id, p]));
      products = chunkIds.map((id) => byId.get(id)).filter(Boolean) as typeof products;
      totalMatching = explicitIds.length;
    } else {
      const where: Record<string, unknown> = { businessId, isActive: true };
      if (opts.onlyWithoutBarcode === true) {
        where.OR = [{ barcode: null }, { barcode: '' }];
      }
      totalMatching = await this.prisma.product.count({ where });
      products = await this.prisma.product.findMany({
        where,
        select: { id: true, name: true, brand: true, barcode: true, presentation: true, allCodes: true, imageUrl: true },
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit,
      });
    }
    const rows: Array<{
      product: {
        id: string;
        name: string;
        brand: string | null;
        barcode: string | null;
        presentation: string | null;
        imageUrl: string | null;
      };
      status: 'matched' | 'weak' | 'closest' | 'unmatched';
      best: PreciosClarosHit | null;
      candidates: PreciosClarosHit[];
      aiUsed: boolean;
      queryUsed: string;
    }> = [];
    let aiUsedCount = 0;
    for (const product of products) {
      const override = opts.queryByProductId?.[product.id]?.trim();
      const productLabel = [product.brand, product.name, product.presentation].filter(Boolean).join(' ').trim() || product.name;
      const query = override || productLabel;
      // 1) Catálogo local
      let fromCatalog = await this.searchCatalog(query, 24);
      let fromLive: PreciosClarosHit[] = [];
      const catalogBest = fromCatalog[0]?.score ?? 0;
      // 2) Online si está on, o si el catálogo no da nada útil
      const needLive = useLive || catalogBest < 0.5 || fromCatalog.length < 2;
      if (needLive) {
        fromLive = await this.searchByName(businessId, query, 15);
        // Segunda pasada más corta si no vino nada (solo tokens fuertes)
        if (!fromLive.length) {
          const short = meaningfulTokens(query).slice(0, 3).join(' ');
          if (short && short !== meaningfulTokens(query).slice(0, 5).join(' ')) {
            fromLive = await this.searchByName(businessId, short, 15);
          } else if (product.name.trim().length >= 2) {
            fromLive = await this.searchByName(businessId, product.name, 15);
          }
        }
      }
      const merged = new Map<string, PreciosClarosHit>();
      for (const h of [...fromCatalog, ...fromLive]) {
        const scored = { ...h, score: bestNameScore(productLabel, h) };
        const prev = merged.get(h.ean);
        if (!prev || (scored.score ?? 0) > (prev.score ?? 0)) merged.set(h.ean, scored);
      }
      let candidates = [...merged.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);
      let aiUsed = false;
      let status: 'matched' | 'weak' | 'closest' | 'unmatched' = 'unmatched';

      const topScore = candidates[0]?.score ?? 0;
      if (candidates.length) {
        if (topScore >= 0.72) status = 'matched';
        else if (topScore >= minScore) status = 'weak';
        else status = 'closest'; // siempre mostramos lo más parecido si hay algo
      }

      // IA solo si no hay match fuerte (ahorra tiempo y tokens)
      if (opts.useAi && status !== 'matched') {
        if (candidates.length > 1) {
          const reranked = await this.rerankWithAi(
            businessId,
            `${product.brand ?? ''} ${product.name}`.trim(),
            candidates,
          );
          if (reranked) {
            candidates = reranked;
            aiUsed = true;
            aiUsedCount += 1;
            const s = candidates[0]?.score ?? 0;
            if (s >= 0.72) status = 'matched';
            else if (s >= minScore) status = 'weak';
            else if (candidates.length) status = 'closest';
          }
        }
        if (status === 'unmatched' || (candidates[0]?.score ?? 0) < minScore) {
          const alt = await this.aiSuggestSearchQueries(businessId, product.name, product.brand);
          if (alt?.length) {
            for (const q of alt.slice(0, 2)) {
              const extraLocal = await this.searchCatalog(q, 12);
              const extraLive = needLive ? await this.searchByName(businessId, q, 10) : [];
              for (const h of [...extraLocal, ...extraLive]) {
                const scored = { ...h, score: bestNameScore(productLabel, h) };
                const prev = merged.get(h.ean);
                if (!prev || (scored.score ?? 0) > (prev.score ?? 0)) merged.set(h.ean, scored);
              }
            }
            candidates = [...merged.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);
            const reranked = await this.rerankWithAi(businessId, product.name, candidates);
            if (reranked) {
              candidates = reranked;
              aiUsed = true;
            }
            const s = candidates[0]?.score ?? 0;
            if (s >= 0.72) status = 'matched';
            else if (s >= minScore) status = 'weak';
            else if (candidates.length) status = 'closest';
            else status = 'unmatched';
          }
        }
      }

      const best = candidates[0] ?? null;
      rows.push({
        product: {
          id: product.id,
          name: product.name,
          brand: product.brand,
          barcode: product.barcode,
          presentation: product.presentation,
          imageUrl: product.imageUrl,
        },
        status,
        best,
        candidates,
        aiUsed,
        queryUsed: query,
      });
    }

    const nextOffset = explicitIds.length
      ? null
      : offset + products.length < totalMatching
        ? offset + products.length
        : null;
    return {
      rows,
      aiUsedCount,
      catalog: await this.catalogStats(),
      totalMatching,
      offset,
      limit,
      nextOffset,
      tip:
        'Online viene prendido: busca en Precios Claros de verdad. Sembrá el catálogo para que después sea más rápido.',
    };
  }

  private async aiSuggestSearchQueries(
    businessId: string,
    name: string,
    brand?: string | null,
  ): Promise<string[] | null> {
    const key = await this.business.getOpenaiKey(businessId).catch(() => null);
    if (!key) return null;
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'Sos experto en góndola argentina (Precios Claros). Dado un producto de kiosco/almacén, sugerí hasta 4 textos de búsqueda cortos (marca + producto + tamaño) para encontrar el EAN. Respondé SOLO JSON: {"queries":["..."]}',
            },
            {
              role: 'user',
              content: `Marca: ${brand || '(vacía)'}\nNombre: ${name}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]) as { queries?: string[] };
      if (!Array.isArray(parsed.queries)) return null;
      return parsed.queries.map((q) => String(q).trim()).filter((q) => q.length >= 2).slice(0, 4);
    } catch {
      return null;
    }
  }

  async bulkApply(
    businessId: string,
    items: Array<{
      productId: string;
      ean: string;
      name?: string;
      brand?: string | null;
      presentation?: string | null;
    }>,
    opts?: { setAsPrimary?: boolean },
  ) {
    const list = (items || []).slice(0, 80);
    if (!list.length) throw new BadRequestException('No hay ítems para aplicar.');
    const setAsPrimary = opts?.setAsPrimary !== false;
    const results: Array<{
      productId: string;
      ok: boolean;
      error?: string;
      eanAdded?: string;
      coexist?: boolean;
      barcodePromoted?: boolean;
      previousBarcode?: string | null;
    }> = [];
    for (const item of list) {
      try {
        const applied = await this.applyToProduct(businessId, item.productId, {
          ean: item.ean,
          name: item.name,
          brand: item.brand,
          presentation: item.presentation,
          fillEmptyOnly: true,
          setAsPrimary,
        });
        results.push({
          productId: item.productId,
          ok: true,
          eanAdded: applied.eanAdded,
          coexist: applied.coexist,
          barcodePromoted: applied.barcodePromoted,
          previousBarcode: applied.previousBarcode,
        });
      } catch (err) {
        results.push({
          productId: item.productId,
          ok: false,
          error: err instanceof Error ? err.message : 'Error',
        });
      }
    }
    return {
      applied: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      setAsPrimary,
      results,
    };
  }
}
