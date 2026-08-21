import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PreciosClarosService } from './precios-claros.service';

type User = { businessId: string };

@Controller('precios-claros')
@UseGuards(JwtAuthGuard)
export class PreciosClarosController {
  constructor(private readonly preciosClaros: PreciosClarosService) {}

  @Get('search')
  async search(
    @CurrentUser() user: User,
    @Query('ean') ean?: string,
    @Query('q') q?: string,
  ) {
    if (ean?.trim()) {
      const items = await this.preciosClaros.searchByEan(user.businessId, ean);
      return { items, source: 'precios-claros', mode: 'ean' as const };
    }
    if (q?.trim()) {
      const items = await this.preciosClaros.searchByName(user.businessId, q);
      return { items, source: 'precios-claros', mode: 'name' as const };
    }
    return { items: [], source: 'precios-claros', mode: 'empty' as const };
  }

  @Get('catalog/stats')
  catalogStats() {
    return this.preciosClaros.catalogStats();
  }

  @Get('catalog/search')
  catalogSearch(@Query('q') q?: string) {
    return this.preciosClaros.searchCatalog(q || '', 40).then((items) => ({ items }));
  }

  @Post('catalog/sync-chunk')
  syncChunk(@CurrentUser() user: User, @Body() body: { cursor?: string | null }) {
    return this.preciosClaros.syncCatalogChunk(user.businessId, body?.cursor);
  }

  @Post('catalog/seed-business')
  seedBusiness(@CurrentUser() user: User, @Body() body: { limit?: number }) {
    return this.preciosClaros.seedCatalogFromBusiness(user.businessId, body?.limit);
  }

  @Get('match/:productId')
  match(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
    @Query('ai') ai?: string,
  ) {
    return this.preciosClaros.matchProduct(user.businessId, productId, {
      useAi: ai !== '0' && ai !== 'false',
    });
  }

  @Post('apply/:productId')
  apply(
    @CurrentUser() user: User,
    @Param('productId') productId: string,
    @Body()
    body: {
      ean: string;
      name?: string;
      brand?: string | null;
      presentation?: string | null;
      fillEmptyOnly?: boolean;
      setAsPrimary?: boolean;
    },
  ) {
    return this.preciosClaros.applyToProduct(user.businessId, productId, body);
  }

  @Post('bulk/preview')
  bulkPreview(
    @CurrentUser() user: User,
    @Body()
    body: {
      onlyWithoutBarcode?: boolean;
      limit?: number;
      useAi?: boolean;
      minScore?: number;
      productIds?: string[];
      useLive?: boolean;
      offset?: number;
    },
  ) {
    return this.preciosClaros.bulkPreview(user.businessId, body || {});
  }

  @Post('bulk/apply')
  bulkApply(
    @CurrentUser() user: User,
    @Body()
    body: {
      items: Array<{
        productId: string;
        ean: string;
        name?: string;
        brand?: string | null;
        presentation?: string | null;
      }>;
      /** true (default): EAN oficial como barcode; el interno queda en allCodes. */
      setAsPrimary?: boolean;
    },
  ) {
    return this.preciosClaros.bulkApply(user.businessId, body?.items || [], {
      setAsPrimary: body?.setAsPrimary,
    });
  }
}
