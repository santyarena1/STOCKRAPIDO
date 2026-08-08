import { Injectable, Logger } from '@nestjs/common';

/** Item normalizado proveniente del proveedor (Mondelez VTEX). */
export interface NormalizedItem {
  externalId: string;
  sku?: string;
  ean?: string;
  supplierRef?: string;
  eanUnit?: string;
  eanBox?: string;
  name: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  cost?: number; // precio real B2B (solo lo trae el runner autenticado)
  listPrice?: number;
  ivaAlicuota?: number | null;
  unitsPerDisplay?: string;
  displaysPerBox?: string;
  retornable?: boolean;
  basePrice?: number;
  available: boolean;
  stock?: number;
  unitsPerBox?: string;
  weight?: string;
  format?: string;
  flavor?: string;
  presentation?: string;
  imageUrl?: string;
  link?: string;
  variants?: Array<{
    uom: string;
    multiplier?: number;
    skuId?: string;
    refId?: string;
    ean?: string;
    listPrice?: number;
    sellingPrice?: number;
    priceWithTax?: number;
    cost?: number;
    stock?: number;
    taxAlicuota?: number;
    sellerId?: string;
    erpStatus?: string;
  }>;
  raw?: any;
}

/**
 * Provider de Mondelez. El backend (serverless) usa el CATÁLOGO PÚBLICO de VTEX
 * para traer todos los campos (sin precio real). El precio real B2B lo aporta el
 * "runner" autenticado (login con teléfono) que empuja los datos por la API.
 */
@Injectable()
export class MondelezProvider {
  private readonly base = 'https://www.mitiendamondelez.com.ar';
  private readonly logger = new Logger('MondelezProvider');

  private spec(p: any, key: string): string | undefined {
    const v = p?.[key];
    if (Array.isArray(v)) return v[0];
    return typeof v === 'string' ? v : undefined;
  }

  async fetchCatalog(): Promise<NormalizedItem[]> {
    const tree = await this.getJson(
      `${this.base}/api/catalog_system/pub/category/tree/10`,
    );
    const catIds: number[] = [];
    const walk = (nodes: any[]) =>
      (nodes || []).forEach((n) => {
        catIds.push(n.id);
        if (n.children) walk(n.children);
      });
    walk(tree || []);

    const seen = new Set<string>();
    const items: NormalizedItem[] = [];
    const targets = catIds.length ? catIds : [0];
    for (const cid of targets) {
      let from = 0;
      while (true) {
        const url = cid
          ? `${this.base}/api/catalog_system/pub/products/search?fq=C:/${cid}/&_from=${from}&_to=${from + 49}`
          : `${this.base}/api/catalog_system/pub/products/search?_from=${from}&_to=${from + 49}`;
        const batch = await this.getJson(url);
        if (!Array.isArray(batch) || batch.length === 0) break;
        for (const p of batch) {
          const id = String(p.productId);
          if (seen.has(id)) continue;
          seen.add(id);
          items.push(this.normalize(p));
        }
        if (batch.length < 50) break;
        from += 50;
        await this.sleep(120);
      }
    }
    this.logger.log(`Catálogo público Mondelez: ${items.length} productos`);
    return items;
  }

  normalize(p: any): NormalizedItem {
    const item = (p.items || [])[0] || {};
    const seller = (item.sellers || [])[0] || {};
    const offer = seller.commertialOffer || {};
    const img = (item.images || [])[0] || {};
    const cat: string = (p.categories || [''])[0] || '';
    const parts = cat.split('/').filter(Boolean);
    const referenceId = item.referenceId || item.referenceIds || {};
    const refId =
      referenceId.RefId ||
      referenceId.refId ||
      (Array.isArray(referenceId)
        ? referenceId.find((reference: any) => reference?.Key === 'RefId')?.Value
        : undefined) ||
      item.RefId;
    const listPrice =
      typeof offer.ListPrice === 'number' && offer.ListPrice < 999999
        ? offer.ListPrice
        : undefined;
    const sellingPrice =
      typeof offer.Price === 'number' && offer.Price < 999999
        ? offer.Price
        : undefined;
    const availableQuantity =
      typeof offer.AvailableQuantity === 'number' &&
      offer.AvailableQuantity < 99999
        ? offer.AvailableQuantity
        : undefined;
    const unitsPerDisplay = this.spec(p, 'Unidades por Display');
    return {
      externalId: String(p.productId),
      sku: item.itemId ? String(item.itemId) : undefined,
      ean: item.ean || undefined,
      supplierRef:
        p.productReference != null
          ? String(p.productReference)
          : refId != null
            ? String(refId)
            : undefined,
      eanUnit: item.ean || undefined,
      name: p.productName,
      brand: p.brand || undefined,
      category: parts[0],
      subcategory: this.spec(p, 'Subcategoría') || parts[1],
      available: !!offer.IsAvailable,
      stock: availableQuantity,
      unitsPerBox: unitsPerDisplay,
      unitsPerDisplay,
      ivaAlicuota: null,
      basePrice: listPrice,
      weight: this.spec(p, 'Peso'),
      format: this.spec(p, 'Formato'),
      flavor: this.spec(p, 'Sabor'),
      presentation: this.spec(p, 'Presentación'),
      imageUrl: img.imageUrl || undefined,
      link: p.link || undefined,
      variants: [
        {
          uom: 'UN',
          multiplier: 1,
          skuId: item.itemId ? String(item.itemId) : undefined,
          refId: refId ? String(refId) : undefined,
          ean: item.ean || undefined,
          listPrice,
          sellingPrice,
          cost: undefined,
          stock: availableQuantity,
        },
      ],
      raw: p,
    };
  }

  private async getJson(url: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'StockRapido-Sync',
            Accept: 'application/json',
          },
        });
        if (res.status === 416) return [];
        if (!res.ok) {
          await this.sleep(800);
          continue;
        }
        return await res.json();
      } catch {
        await this.sleep(800);
      }
    }
    return [];
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
