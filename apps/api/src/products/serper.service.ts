import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessService } from '../business/business.service';
import { mirrorFirstAvailable, mirrorRemoteImageUrl } from '../common/image-mirror';

export type SerperImage = {
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  source: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class SerperService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
  ) {}

  buildQuery(name: string, brand?: string | null) {
    return [name, brand].map((part) => (part ?? '').trim()).filter(Boolean).join(' ');
  }

  async searchImages(businessId: string, q: string, num = 8): Promise<{ query: string; images: SerperImage[] }> {
    const key = await this.business.getSerperKey(businessId);
    if (!key) {
      throw new BadRequestException('Cargá la API key de Serper en Configuración → Imágenes Serper.');
    }
    const query = q.trim();
    if (query.length < 2) throw new BadRequestException('Escribí el nombre del producto para buscar fotos.');
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: query,
        gl: 'ar',
        hl: 'es',
        num: Math.min(20, Math.max(4, Math.floor(num) || 8)),
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new BadRequestException('La API key de Serper no es válida. Revisala en Configuración.');
      }
      if (res.status === 429) throw new BadRequestException('Serper está al límite de búsquedas. Probá de nuevo en un rato.');
      throw new BadRequestException(`Serper no respondió (${res.status}).`);
    }
    const json = (await res.json()) as {
      images?: Array<{ title?: string; imageUrl?: string; thumbnailUrl?: string; source?: string }>;
    };
    const images = (json.images ?? [])
      .map((img) => ({
        title: img.title || '',
        imageUrl: img.imageUrl || '',
        thumbnailUrl: img.thumbnailUrl || img.imageUrl || '',
        source: img.source || '',
      }))
      .filter((img) => /^https?:\/\//i.test(img.imageUrl));
    return { query, images };
  }

  async assignImage(businessId: string, productId: string, imageUrl: string) {
    const raw = String(imageUrl ?? '').trim();
    if (raw && (!/^https?:\/\//i.test(raw) || raw.length > 2000) && !raw.startsWith('data:image/')) {
      throw new BadRequestException('URL de imagen inválida.');
    }
    const product = await this.prisma.product.findFirst({
      where: { id: productId, businessId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    // Espejar a Blob: las URLs crudas de Serper/Google se rompen (hotlink / vencen).
    const url = raw ? await mirrorRemoteImageUrl(raw) : '';
    return this.prisma.product.update({
      where: { id: product.id },
      data: { imageUrl: url || null },
      select: { id: true, name: true, imageUrl: true },
    });
  }

  async listForEditor(businessId: string, opts: { q?: string; missingOnly?: boolean; page?: number; pageSize?: number }) {
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(50, Math.max(8, opts.pageSize || 24));
    const q = opts.q?.trim();
    const filters: Prisma.ProductWhereInput[] = [{ businessId }, { isActive: true }];
    if (opts.missingOnly !== false) {
      filters.push({ OR: [{ imageUrl: null }, { imageUrl: '' }] });
    }
    if (q) {
      filters.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { barcode: { contains: q } },
          { brand: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.ProductWhereInput = { AND: filters };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: { id: true, name: true, brand: true, barcode: true, imageUrl: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async autoAssign(businessId: string, ids: string[], onlyMissing = true) {
    const unique = [...new Set((ids ?? []).filter((id) => typeof id === 'string' && id.length > 0))].slice(0, 40);
    if (!unique.length) throw new BadRequestException('Indicá al menos un producto.');
    const products = await this.prisma.product.findMany({
      where: { businessId, id: { in: unique } },
      select: { id: true, name: true, brand: true, imageUrl: true },
    });
    const found = new Set(products.map((p) => p.id));
    const skipped: Array<{ id: string; reason: string }> = unique
      .filter((id) => !found.has(id))
      .map((id) => ({ id, reason: 'Producto no encontrado.' }));
    let updated = 0;
    const items: Array<{ id: string; name: string; imageUrl: string | null; ok: boolean; reason?: string }> = [];

    for (const product of products) {
      if (onlyMissing && product.imageUrl?.trim()) {
        skipped.push({ id: product.id, reason: 'Ya tiene imagen.' });
        items.push({ id: product.id, name: product.name, imageUrl: product.imageUrl, ok: false, reason: 'Ya tiene imagen.' });
        continue;
      }
      try {
        const { images } = await this.searchImages(businessId, this.buildQuery(product.name, product.brand), 6);
        if (!images.length) {
          skipped.push({ id: product.id, reason: 'Serper no encontró fotos.' });
          items.push({ id: product.id, name: product.name, imageUrl: product.imageUrl, ok: false, reason: 'Sin resultados.' });
          continue;
        }
        // Probá full + thumb de las primeras coincidencias hasta que una se pueda guardar.
        const candidates = images.flatMap((img) => [img.imageUrl, img.thumbnailUrl]).filter(Boolean);
        let hosted: string;
        try {
          hosted = await mirrorFirstAvailable(candidates);
        } catch {
          skipped.push({ id: product.id, reason: 'Fotos de Serper inaccesibles (rotas).' });
          items.push({
            id: product.id,
            name: product.name,
            imageUrl: product.imageUrl,
            ok: false,
            reason: 'Imagen rota / no se pudo guardar.',
          });
          continue;
        }
        await this.prisma.product.update({
          where: { id: product.id },
          data: { imageUrl: hosted },
        });
        updated += 1;
        items.push({ id: product.id, name: product.name, imageUrl: hosted, ok: true });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Error al buscar.';
        skipped.push({ id: product.id, reason });
        items.push({ id: product.id, name: product.name, imageUrl: product.imageUrl, ok: false, reason });
      }
      await sleep(180);
    }
    return { updated, skipped, items };
  }
}
