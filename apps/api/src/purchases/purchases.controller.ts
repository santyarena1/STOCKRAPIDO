import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PurchasesService } from './purchases.service';

type User = { businessId: string };

@Controller('purchases')
@UseGuards(JwtAuthGuard)
export class PurchasesController {
  constructor(private purchases: PurchasesService) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Body()
    body: {
      supplierId: string;
      items: {
        productId?: string;
        barcode?: string;
        productName?: string;
        qty: number;
        unitCost: number;
        expiresAt?: string;
        categoryId?: string;
        price?: number;
        minStock?: number;
      }[];
    },
  ) {
    return this.purchases.create(user.businessId, body.supplierId, body.items);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body()
    body: {
      supplierId: string;
      items: {
        productId?: string;
        barcode?: string;
        productName?: string;
        qty: number;
        unitCost: number;
        expiresAt?: string;
        categoryId?: string;
        price?: number;
        minStock?: number;
      }[];
    },
  ) {
    return this.purchases.update(id, user.businessId, body.supplierId, body.items);
  }

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('supplierId') supplierId?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.purchases.list(
      user.businessId,
      supplierId,
      limit ? parseInt(limit, 10) : 50,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: User) {
    return this.purchases.getLowStockProducts(user.businessId);
  }
}
