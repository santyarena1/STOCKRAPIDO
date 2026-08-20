import { Injectable, Logger } from '@nestjs/common';

export type PreciosClarosHit = {
  ean: string;
  name: string;
  brand?: string | null;
  presentation?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  source: 'precios-claros';
};

/**
 * Cliente inicial de Precios Claros.
 * El endpoint público del portal no está documentado de forma estable;
 * este servicio deja la interfaz lista y un stub seguro hasta configurar origen/API key.
 */
@Injectable()
export class PreciosClarosService {
  private readonly logger = new Logger(PreciosClarosService.name);

  async searchByEan(ean: string): Promise<PreciosClarosHit[]> {
    const code = ean.replace(/\D/g, '');
    if (code.length < 8) return [];
    this.logger.debug(`Precios Claros searchByEan stub: ${code}`);
    // TODO: integrar endpoint SEPA / CloudFront o dataset cacheado.
    return [];
  }

  async searchByName(q: string): Promise<PreciosClarosHit[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    this.logger.debug(`Precios Claros searchByName stub: ${term}`);
    return [];
  }
}
