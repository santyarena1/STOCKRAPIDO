import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicCatalogService } from './public-catalog.service';

type User = { businessId: string };

@Controller('public-catalog')
@UseGuards(JwtAuthGuard)
export class PublicCatalogController {
  constructor(private catalog: PublicCatalogService) {}

  @Get()
  search(
    @CurrentUser() u: User,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.catalog.search(u.businessId, {
      q,
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

  @Post('import')
  importOne(
    @CurrentUser() u: User,
    @Body() body: { publicProductId?: string; price?: number },
  ) {
    return this.catalog.importOne(u.businessId, body.publicProductId || '', body.price);
  }

  @Post('import-batch')
  importBatch(@CurrentUser() u: User, @Body() body: { publicProductIds?: string[] }) {
    return this.catalog.importBatch(u.businessId, body.publicProductIds || []);
  }
}
