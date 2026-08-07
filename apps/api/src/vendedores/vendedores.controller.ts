import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { saleDateRangeFromQuery } from '../common/argentina-date-range';
import { VendedoresService, type VendedorStatsPeriod } from './vendedores.service';

type User = { businessId: string };

@Controller('vendedores')
@UseGuards(JwtAuthGuard)
export class VendedoresController {
  constructor(private vendedores: VendedoresService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.vendedores.list(user.businessId);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: { name: string }) {
    return this.vendedores.create(user.businessId, body?.name);
  }

  @Post('set-active')
  setActive(@CurrentUser() user: User, @Body() body: { vendedorId: string }) {
    return this.vendedores.setActive(user.businessId, body?.vendedorId);
  }

  @Get('active')
  active(@CurrentUser() user: User) {
    return this.vendedores.active(user.businessId);
  }

  @Get('stats')
  stats(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parsedPeriod: VendedorStatsPeriod = ['today', 'week', 'month', 'year'].includes(period ?? '')
      ? period as VendedorStatsPeriod
      : 'month';
    const range = saleDateRangeFromQuery(from, to);
    return this.vendedores.stats(user.businessId, parsedPeriod, range.from, range.to);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { name?: string; active?: boolean }) {
    return this.vendedores.update(user.businessId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.vendedores.remove(user.businessId, id);
  }
}
