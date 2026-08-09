import { Injectable, Logger } from '@nestjs/common';
import { NormalizedItem } from './mondelez.provider';
import { proxiedFetch } from './proxied-fetch';

type TokinCatalogResult = { items: NormalizedItem[]; authenticated: boolean };

@Injectable()
export class TokinProvider {
  private readonly base = 'https://tokintienda.com.ar';
  private readonly logger = new Logger(TokinProvider.name);

  async fetchCatalog(credentials?: Record<string, string> | null): Promise<TokinCatalogResult> {
    const cookie = credentials ? await this.login(credentials) : null;
    if (credentials && !cookie) this.logger.warn('Falló el login B2B de Tokin; se sincronizará el catálogo público sin sobrescribir costos.');
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'StockRapido-Sync/1.0',
      ...(cookie ? { Cookie: cookie } : {}),
    };
    const seen = new Map<string, NormalizedItem>();
    for (let from = 0; from < 5000; from += 50) {
      const to = from + 49;
      const batch = await this.catalogPage(from, to, headers);
      if (!batch.length) break;
      for (const product of batch) {
        const normalized = this.normalize(product, !!cookie);
        seen.set(normalized.externalId, normalized);
      }
      this.logger.log(`Tokin catálogo ${from}-${to}: ${seen.size} productos`);
      if (batch.length < 50) break;
    }
    return { items: [...seen.values()], authenticated: !!cookie };
  }

  private async catalogPage(from: number, to: number, headers: Record<string, string>): Promise<any[]> {
    const endpoints = [
      `${this.base}/api/catalog_system/pub/products/search?_from=${from}&_to=${to}`,
      `${this.base}/store/api/search?_from=${from}&_to=${to}`,
      `${this.base}/store/api/search?from=${from}&to=${to}`,
    ];
    let lastStatus = 0;
    for (const url of endpoints) {
      try {
        const response = await proxiedFetch(url, { headers, redirect: 'follow' });
        lastStatus = response.status;
        if (response.status === 416) return [];
        if (!response.ok) continue;
        const payload: any = await response.json();
        const rows = this.extractProducts(payload);
        if (rows.length) return rows;
      } catch (error) {
        this.logger.warn(`Tokin no respondió en ${new URL(url).pathname}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (from === 0 && lastStatus && lastStatus !== 416) this.logger.warn(`Los endpoints de catálogo Tokin respondieron sin productos (último HTTP ${lastStatus}).`);
    return [];
  }

  private async login(credentials: Record<string, string>): Promise<string | null> {
    const user = credentials.user || credentials.email;
    const password = credentials.password;
    if (!user || !password) {
      this.logger.warn('La conexión Tokin no tiene usuario y contraseña completos.');
      return null;
    }
    try {
      const startBody = new URLSearchParams({
        accountName: 'tokintienda',
        scope: this.base,
        returnUrl: `${this.base}/store/home`,
        callbackUrl: `${this.base}/api/vtexid/pub/authentication/finish`,
        user,
      });
      const start = await proxiedFetch(`${this.base}/api/vtexid/pub/authentication/startlogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: startBody.toString(),
      });
      if (!start.ok) throw new Error(`startlogin HTTP ${start.status}`);
      const startPayload: any = await start.json();
      const authenticationToken = startPayload.authenticationToken;
      if (!authenticationToken) throw new Error('VTEX ID no devolvió authenticationToken');
      const validateBody = new URLSearchParams({ login: user, password, authenticationToken });
      const validate = await proxiedFetch(`${this.base}/api/vtexid/pub/authentication/classic/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: validateBody.toString(),
      });
      if (!validate.ok) throw new Error(`validate/classic HTTP ${validate.status}`);
      const payload: any = await validate.json();
      if (payload.authStatus && payload.authStatus !== 'Success') throw new Error(`VTEX ID: ${payload.authStatus}`);
      const responseHeaders: any = validate.headers;
      const setCookies: string[] = typeof responseHeaders.getSetCookie === 'function'
        ? responseHeaders.getSetCookie()
        : [validate.headers.get('set-cookie') || ''];
      const cookie = setCookies
        .flatMap((value) => value.split(/,(?=[^;,]+=)/))
        .map((value) => value.split(';')[0].trim())
        .find((value) => value.startsWith('VtexIdclientAutCookie='));
      const token = payload.token || payload.authToken;
      if (cookie) return cookie;
      if (token) return `VtexIdclientAutCookie=${token}`;
      throw new Error('VTEX ID autenticó pero no devolvió VtexIdclientAutCookie');
    } catch (error) {
      this.logger.warn(`Login B2B Tokin no disponible: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  normalize(product: any, authenticated: boolean): NormalizedItem {
    const productItems = Array.isArray(product?.items) ? product.items : [];
    const variants = productItems.map((item: any) => this.normalizeVariant(item, authenticated));
    const unit = variants.find((variant) => variant.uom === 'UN') || variants[0];
    const box = variants.find((variant) => variant.uom === 'BU');
    const firstItem = productItems[0] || {};
    const categories = Array.isArray(product?.categories) ? product.categories[0] || '' : '';
    const categoryParts = String(categories).split('/').filter(Boolean);
    const unitsPerDisplay = this.spec(product, 'Unidades por Display');
    const unitsPerBox = this.spec(product, 'Unidades por Bulto') || this.spec(product, 'Unidades por Caja');
    const listPrice = unit?.listPrice;
    const cost = authenticated ? unit?.cost : undefined;
    return {
      externalId: String(product.productId),
      sku: unit?.skuId || (firstItem.itemId != null ? String(firstItem.itemId) : undefined),
      ean: unit?.ean,
      eanUnit: unit?.ean,
      eanBox: box?.ean || this.spec(product, 'EAN Bulto') || this.spec(product, 'EAN Caja'),
      supplierRef: product.productReference != null ? String(product.productReference) : unit?.refId,
      name: product.productName || product.name || `Producto ${product.productId}`,
      brand: product.brand || undefined,
      category: categoryParts[0],
      subcategory: this.spec(product, 'Subcategoría') || categoryParts[1],
      cost,
      listPrice,
      basePrice: listPrice,
      ivaAlicuota: this.numericSpec(product, 'IVA') ?? this.numericSpec(product, 'Alicuota IVA'),
      unitsPerDisplay,
      unitsPerBox,
      available: variants.some((variant) => variant.stock == null || variant.stock > 0),
      stock: unit?.stock,
      weight: this.spec(product, 'Peso'),
      format: this.spec(product, 'Formato'),
      flavor: this.spec(product, 'Sabor'),
      presentation: this.spec(product, 'Presentación'),
      imageUrl: firstItem.images?.[0]?.imageUrl || undefined,
      link: product.link || undefined,
      variants,
      raw: product,
    };
  }

  private normalizeVariant(item: any, authenticated: boolean): NonNullable<NormalizedItem['variants']>[number] {
    const seller = item?.sellers?.[0] || {};
    const offer = seller.commertialOffer || {};
    const listPrice = this.validPrice(offer.ListPrice);
    const sellingPrice = this.validPrice(offer.Price);
    const stock = this.validStock(offer.AvailableQuantity);
    const refId = this.refId(item);
    const text = `${item.measurementUnit || ''} ${item.name || item.nameComplete || ''}`.toLowerCase();
    const uom = /bulto|caja|box|\bbu\b/.test(text) ? 'BU' : /display|\bdi\b/.test(text) ? 'DI' : 'UN';
    return {
      uom,
      multiplier: Number(item.unitMultiplier) > 0 ? Math.round(Number(item.unitMultiplier)) : 1,
      skuId: item.itemId != null ? String(item.itemId) : undefined,
      refId,
      ean: item.ean || undefined,
      listPrice,
      sellingPrice,
      priceWithTax: sellingPrice,
      cost: authenticated ? sellingPrice : undefined,
      stock,
      sellerId: seller.sellerId != null ? String(seller.sellerId) : undefined,
    };
  }

  private extractProducts(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    for (const key of ['products', 'data', 'items', 'results']) {
      const value = payload?.[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        const nested = this.extractProducts(value);
        if (nested.length) return nested;
      }
    }
    return [];
  }

  private spec(product: any, key: string): string | undefined {
    const value = product?.[key];
    if (Array.isArray(value)) return value[0] != null ? String(value[0]) : undefined;
    return value != null && value !== '' ? String(value) : undefined;
  }

  private numericSpec(product: any, key: string): number | undefined {
    const parsed = Number(String(this.spec(product, key) || '').replace(',', '.').replace('%', ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private refId(item: any): string | undefined {
    const references = item?.referenceId || item?.referenceIds || {};
    const value = references.RefId || references.refId || (Array.isArray(references)
      ? references.find((reference: any) => reference?.Key === 'RefId')?.Value
      : undefined) || item?.RefId;
    return value != null ? String(value) : undefined;
  }

  private validPrice(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value < 999999 ? value : undefined;
  }

  private validStock(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value < 99999 ? Math.trunc(value) : undefined;
  }
}
