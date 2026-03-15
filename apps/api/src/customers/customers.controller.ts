import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomersService } from './customers.service';

type User = { businessId: string };

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('withBalance') withBalance?: string) {
    return this.customers.list(user.businessId, withBalance === 'true');
  }

  @Get('morosos')
  morosos(@CurrentUser() user: User) {
    return this.customers.getMorosos(user.businessId);
  }

  @Get('total-fiado')
  totalFiado(@CurrentUser() user: User) {
    return this.customers.getTotalFiado(user.businessId);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: { name: string; phone?: string; notes?: string }) {
    return this.customers.create(user.businessId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.customers.update(id, user.businessId, body as Parameters<CustomersService['update']>[2]);
  }

  @Post(':id/payment')
  addPayment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { amount: number; note?: string },
  ) {
    return this.customers.addPayment(id, user.businessId, body.amount, body.note);
  }

  @Get(':id/payments')
  getPayments(@CurrentUser() user: User, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.customers.getPayments(id, user.businessId, limit ? parseInt(limit, 10) : 50);
  }
}
