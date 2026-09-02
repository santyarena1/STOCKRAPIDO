import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicCatalogService } from './public-catalog.service';

type User = { businessId: string };

@Controller('public-catalog')
@UseGuards(JwtAuthGuard)
export class PublicCatalogController {
  constructor(private catalog: PublicCatalogService) {}

  @Get('facets')
  facets(@CurrentUser() u: User, @Query('q') q?: string) {
    return this.catalog.facets(u.businessId, q);
  }

  @Get()
  search(
    @CurrentUser() u: User,
    @Query('q') q?: string,
    @Query('brand') brand?: string,
    @Query('category') category?: string,
    @Query('imported') imported?: string,
    @Query('hasImage') hasImage?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.catalog.search(u.businessId, {
      q,
      brand,
      category,
      imported: imported === 'yes' || imported === 'no' ? imported : undefined,
      hasImage: hasImage === 'true' ? true : hasImage === 'false' ? false : undefined,
      sort: sort === 'name' || sort === 'brand' || sort === 'newest' ? sort : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('publish/:productId')
  publish(@CurrentUser() u: User, @Param('productId') productId: string) {
    return this.catalog.publishFromProduct(u.businessId, productId);
  }

  @Post('unpublish/:publicProductId')
  unpublish(@CurrentUser() u: User, @Param('publicProductId') publicProductId: string) {
    return this.catalog.unpublish(u.businessId, publicProductId);
  }

  @Get('import-history')
  importHistory(
    @CurrentUser() u: User,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.catalog.listImportHistory(u.businessId, {
      q,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('import-preview/:publicProductId')
  importPreview(@CurrentUser() u: User, @Param('publicProductId') publicProductId: string) {
    return this.catalog.importPreview(u.businessId, publicProductId);
  }

  @Post('import')
  importOne(
    @CurrentUser() u: User,
    @Body()
    body: {
      publicProductId?: string;
      price?: number;
      cost?: number;
      barcode?: string;
      brand?: string;
      categoryId?: string;
    },
  ) {
    return this.catalog.importOne(u.businessId, body.publicProductId || '', {
      price: body.price,
      cost: body.cost,
      barcode: body.barcode,
      brand: body.brand,
      categoryId: body.categoryId,
    });
  }

  @Post('import-batch')
  importBatch(@CurrentUser() u: User, @Body() body: { publicProductIds?: string[] }) {
    return this.catalog.importBatch(u.businessId, body.publicProductIds || []);
  }
}
