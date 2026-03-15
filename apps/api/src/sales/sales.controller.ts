import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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
    @Query('limit') limit?: string,
  ) {
    return this.sales.list(
      user.businessId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      customerId || undefined,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(':id')
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.sales.getOne(id, user.businessId);
  }
}
