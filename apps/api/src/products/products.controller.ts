import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProductsService } from './products.service';

type User = { businessId: string };

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get('search')
  search(@CurrentUser() user: User, @Query('q') q: string, @Query('limit') limit?: string) {
    return this.products.search(user.businessId, q || '', limit ? parseInt(limit, 10) : 20);
  }

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('categoryId') categoryId?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.products.list(user.businessId, categoryId, lowStock === 'true');
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.products.create(user.businessId, body as Parameters<ProductsService['create']>[1]);
  }

  @Get('stock-moves')
  getAllStockMoves(@CurrentUser() user: User, @Query('limit') limit?: string) {
    return this.products.getAllStockMoves(user.businessId, limit ? parseInt(limit, 10) : 100);
  }

  @Get(':id')
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.products.getOne(id, user.businessId);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.products.update(id, user.businessId, body as Parameters<ProductsService['update']>[2]);
  }

  @Post(':id/stock')
  adjustStock(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { qty: number; reason: string; reference?: string },
  ) {
    return this.products.adjustStock(id, user.businessId, body.qty, body.reason, body.reference);
  }

  @Get(':id/stock-moves')
  getStockMoves(@CurrentUser() user: User, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.products.getStockMoves(id, user.businessId, limit ? parseInt(limit, 10) : 50);
  }
}
