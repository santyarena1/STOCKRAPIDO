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
  source: 'precios-claros';
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

/** Score 0..1 por tokens + contención. */
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
  const ta = new Set(na.split(' ').filter((t) => t.length > 1));
  const tb = new Set(nb.split(' ').filter((t) => t.length > 1));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  const jaccard = union ? inter / union : 0;
  const coverage = inter / ta.size;
  return Math.min(1, jaccard * 0.55 + coverage * 0.45);
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
        'User-Agent': 'StockRapido/1.0 (precios-claros)',
      },
      signal: AbortSignal.timeout(12_000),
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

  async searchByName(businessId: string, q: string, limit = 20): Promise<PreciosClarosHit[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const cfg = await this.configFor(businessId);
    if (!cfg.enabled) return [];

    const params = this.geoQuery(cfg);
    params.set('string', term);
    params.set('limit', String(Math.min(50, Math.max(5, limit))));
    const url = `${PRECIOS_CLAROS_BASE}/productos?${params.toString()}`;
    try {
      const data = (await this.fetchJson(url)) as { productos?: PcProducto[] };
      const list = Array.isArray(data?.productos) ? data.productos : [];
      const hits = list
        .map((p) => this.mapProducto(p, nameSimilarity(term, String(p.nombre ?? ''))))
        .filter((h): h is PreciosClarosHit => Boolean(h))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, limit);
      await this.upsertCatalog(hits);
      return hits;
    } catch (err) {
      this.logger.warn(`searchByName falló: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
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
   * Asocia EAN de Precios Claros al producto sin pisar barcode;
   * completa solo campos vacíos.
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
    const codes = new Set((product.allCodes ?? '').split(/\s+/).filter(Boolean));
    if (product.barcode) codes.add(product.barcode);
    codes.add(ean);

    const data: Record<string, unknown> = {
      allCodes: [...codes].join(' '),
    };

    // Nunca reemplazar el barcode principal si ya hay uno distinto.
    if (!product.barcode) {
      data.barcode = ean;
    }

    const brand = body.brand?.trim();
    if (brand && (!fillEmptyOnly || !product.brand?.trim())) data.brand = brand;

    const presentation = body.presentation?.trim();
    if (presentation && (!fillEmptyOnly || !product.presentation?.trim())) {
      data.presentation = presentation;
    }

    // Nombre: solo si está vacío o es muy genérico (opcional / fillEmpty)
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

    return {
      ok: true,
      product: updated,
      eanAdded: ean,
      barcodeUnchanged: Boolean(product.barcode) && product.barcode !== ean,
      coexist: Boolean(product.barcode) && product.barcode !== ean,
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
    const tokens = norm.split(' ').filter((t) => t.length > 1).slice(0, 6);
    const rows = await this.prisma.preciosClarosCatalog.findMany({
      where: {
        OR: [
          { ean: { contains: term.replace(/\D/g, '') || term } },
          { nameNorm: { contains: norm } },
          ...tokens.map((t) => ({ nameNorm: { contains: t } })),
        ],
      },
      take: Math.min(80, Math.max(10, limit * 3)),
      orderBy: { syncedAt: 'desc' },
    });
    return rows
      .map((r) => ({
        ean: r.ean,
        name: r.name,
        brand: r.brand,
        presentation: r.presentation,
        priceMin: r.priceMin == null ? null : Number(r.priceMin),
        priceMax: r.priceMax == null ? null : Number(r.priceMax),
        score: nameSimilarity(term, `${r.brand ?? ''} ${r.name}`),
        source: 'precios-claros' as const,
      }))
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
    },
  ) {
    const limit = Math.min(60, Math.max(1, opts.limit ?? 25));
    const minScore = opts.minScore ?? 0.45;
    const where: Record<string, unknown> = { businessId, isActive: true };
    if (opts.productIds?.length) where.id = { in: opts.productIds.slice(0, 80) };
    else if (opts.onlyWithoutBarcode !== false) {
      where.OR = [{ barcode: null }, { barcode: '' }];
    }
    const products = await this.prisma.product.findMany({
      where,
      select: { id: true, name: true, brand: true, barcode: true, presentation: true, allCodes: true, imageUrl: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    const rows: Array<{
      product: {
        id: string;
        name: string;
        brand: string | null;
        barcode: string | null;
        presentation: string | null;
        imageUrl: string | null;
      };
      status: 'matched' | 'weak' | 'unmatched';
      best: PreciosClarosHit | null;
      candidates: PreciosClarosHit[];
      aiUsed: boolean;
    }> = [];
    let aiUsedCount = 0;
    for (const product of products) {
      const query = [product.brand, product.name, product.presentation].filter(Boolean).join(' ').trim() || product.name;
      const [fromCatalog, fromLive] = await Promise.all([
        this.searchCatalog(query, 20),
        this.searchByName(businessId, query, 15),
      ]);
      const merged = new Map<string, PreciosClarosHit>();
      for (const h of [...fromCatalog, ...fromLive]) {
        const scored = { ...h, score: h.score ?? nameSimilarity(product.name, h.name) };
        const prev = merged.get(h.ean);
        if (!prev || (scored.score ?? 0) > (prev.score ?? 0)) merged.set(h.ean, scored);
      }
      let candidates = [...merged.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);
      let aiUsed = false;
      let status: 'matched' | 'weak' | 'unmatched' = 'unmatched';

      if (candidates.length && (candidates[0].score ?? 0) >= minScore) {
        status = (candidates[0].score ?? 0) >= 0.72 ? 'matched' : 'weak';
      }

      // IA: reordena o sugiere búsqueda alternativa si no hay buen match
      if (opts.useAi && (status !== 'matched' || candidates.length > 1)) {
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
            if ((candidates[0]?.score ?? 0) >= minScore) {
              status = (candidates[0].score ?? 0) >= 0.72 ? 'matched' : 'weak';
            }
          }
        }
        if (status === 'unmatched' || (candidates[0]?.score ?? 0) < minScore) {
          const alt = await this.aiSuggestSearchQueries(businessId, product.name, product.brand);
          if (alt?.length) {
            for (const q of alt.slice(0, 3)) {
              const extra = await this.searchByName(businessId, q, 12);
              for (const h of extra) {
                const scored = { ...h, score: Math.max(h.score ?? 0, nameSimilarity(product.name, h.name)) };
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
            if ((candidates[0]?.score ?? 0) >= minScore) {
              status = (candidates[0].score ?? 0) >= 0.72 ? 'matched' : 'weak';
            }
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
      });
    }

    return {
      rows,
      aiUsedCount,
      catalog: await this.catalogStats(),
      tip:
        'Si no encuentra, expandí el catálogo local (barrido por categorías) o usá la búsqueda manual. La base oficial SEPA tiene ~70k productos en datos.gob.ar.',
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
  ) {
    const list = (items || []).slice(0, 80);
    if (!list.length) throw new BadRequestException('No hay ítems para aplicar.');
    const results: Array<{
      productId: string;
      ok: boolean;
      error?: string;
      eanAdded?: string;
      coexist?: boolean;
    }> = [];
    for (const item of list) {
      try {
        const applied = await this.applyToProduct(businessId, item.productId, {
          ean: item.ean,
          name: item.name,
          brand: item.brand,
          presentation: item.presentation,
          fillEmptyOnly: true,
        });
        results.push({
          productId: item.productId,
          ok: true,
          eanAdded: applied.eanAdded,
          coexist: applied.coexist,
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
      results,
    };
  }
}
