import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuppliersService } from './suppliers.service';

type User = { businessId: string };

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private suppliers: SuppliersService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.suppliers.list(user.businessId);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: { name: string; phone?: string; email?: string; address?: string }) {
    return this.suppliers.create(user.businessId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.suppliers.update(id, user.businessId, body as Parameters<SuppliersService['update']>[2]);
  }

  @Get(':id/purchases')
  getPurchases(@CurrentUser() user: User, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.suppliers.getPurchases(id, user.businessId, limit ? parseInt(limit, 10) : 30);
  }
}
