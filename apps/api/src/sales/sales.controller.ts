import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { saleDateRangeFromQuery } from '../common/argentina-date-range';
import { SalesService } from './sales.service';

type User = { businessId: string; id: string };

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private sales: SalesService) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Body()
    body: {
      items: { productId?: string; name?: string; qty: number; unitPrice: number }[];
      customerId?: string;
      discount?: number;
      paymentMethod?: string;
      cashRegisterId?: string;
    },
  ) {
    return this.sales.create(user.businessId, user.id, body.items, {
      customerId: body.customerId,
      discount: body.discount,
      paymentMethod: body.paymentMethod,
      cashRegisterId: body.cashRegisterId,
    });
  }

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customerId') customerId?: string,
    @Query('productId') productId?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 50;
    const { from: fromD, to: toD } = saleDateRangeFromQuery(from, to);
    return this.sales.list(
      user.businessId,
      fromD,
      toD,
      customerId || undefined,
      Number.isFinite(lim) && lim > 0 ? lim : 50,
      productId?.trim() || undefined,
    );
  }

  @Patch(':saleId/items/:itemId')
  updateItem(
    @CurrentUser() user: User,
    @Param('saleId') saleId: string,
    @Param('itemId') itemId: string,
    @Body() body: { qty?: number; unitPrice?: number },
  ) {
    return this.sales.updateSaleItem(user.businessId, saleId, itemId, body);
  }

  @Delete(':saleId/items/:itemId')
  deleteItem(
    @CurrentUser() user: User,
    @Param('saleId') saleId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.sales.deleteSaleItem(user.businessId, saleId, itemId);
  }

  @Patch(':id')
  updateSale(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { discount?: number; paymentMethod?: string; customerId?: string | null },
  ) {
    return this.sales.updateSale(user.businessId, id, body);
  }

  @Delete(':id')
  deleteSale(@CurrentUser() user: User, @Param('id') id: string) {
    return this.sales.deleteSale(user.businessId, id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.sales.getOne(id, user.businessId);
  }
}
