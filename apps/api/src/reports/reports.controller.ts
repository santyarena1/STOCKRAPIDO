import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

type User = { businessId: string };

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('sales')
  salesSummary(@CurrentUser() user: User, @Query('period') period?: string) {
    const p = (period === 'week' || period === 'month' ? period : 'today') as 'today' | 'week' | 'month';
    return this.reports.salesSummary(user.businessId, p);
  }

  @Get('top-products')
  topProducts(@CurrentUser() user: User, @Query('period') period?: string, @Query('limit') limit?: string) {
    const p = (period === 'week' || period === 'month' ? period : 'today') as 'today' | 'week' | 'month';
    return this.reports.topProducts(user.businessId, p, limit ? parseInt(limit, 10) : 10);
  }

  @Get('purchases-by-day')
  purchasesByDayOfMonth(
    @CurrentUser() user: User,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = year ? parseInt(year, 10) : undefined;
    const m = month ? parseInt(month, 10) - 1 : undefined;
    return this.reports.purchasesByDayOfMonth(user.businessId, y, m);
  }

  @Get('expenses-by-day')
  expensesByDayOfMonth(
    @CurrentUser() user: User,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = year ? parseInt(year, 10) : undefined;
    const m = month ? parseInt(month, 10) - 1 : undefined;
    return this.reports.expensesByDayOfMonth(user.businessId, y, m);
  }

  @Get('margin')
  margin(@CurrentUser() user: User, @Query('period') period?: string) {
    const p = (period === 'week' || period === 'month' ? period : 'today') as 'today' | 'week' | 'month';
    return this.reports.marginEstimate(user.businessId, p);
  }

  @Get('net-profit')
  netProfit(@CurrentUser() user: User, @Query('period') period?: string) {
    const p = (period === 'week' || period === 'month' ? period : 'today') as 'today' | 'week' | 'month';
    return this.reports.netProfit(user.businessId, p);
  }

  @Get('sales-by-day')
  salesByDayOfMonth(
    @CurrentUser() user: User,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const y = year ? parseInt(year, 10) : undefined;
    const m = month ? parseInt(month, 10) - 1 : undefined;
    return this.reports.salesByDayOfMonth(user.businessId, y, m);
  }

  @Get('top-products-profit')
  topProductsByProfit(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    const p = (period === 'week' || period === 'month' ? period : 'today') as 'today' | 'week' | 'month';
    return this.reports.topProductsByProfit(user.businessId, p, limit ? parseInt(limit, 10) : 10);
  }

  @Get('least-sold-products')
  leastSoldProducts(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    const p = (period === 'week' || period === 'month' ? period : 'month') as 'today' | 'week' | 'month';
    return this.reports.leastSoldProducts(user.businessId, p, limit ? parseInt(limit, 10) : 10);
  }

  @Get('top-products-expiring')
  topProductsExpiring(
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ) {
    return this.reports.topProductsExpiringSoon(
      user.businessId,
      days ? parseInt(days, 10) : 30,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: User) {
    return this.reports.lowStock(user.businessId);
  }

  @Get('expiring')
  expiring(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.reports.expiringSoon(user.businessId, days ? parseInt(days, 10) : 30);
  }

  @Get('caja')
  caja(@CurrentUser() user: User, @Query('from') from?: string, @Query('to') to?: string) {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const t = to ? new Date(to) : new Date();
    return this.reports.cajaByDay(user.businessId, f, t);
  }

  @Get('export/sales')
  async salesCsv(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const t = to ? new Date(to) : new Date();
    const csv = await this.reports.salesCsv(user.businessId, f, t);
    return { csv, filename: `ventas-${f.toISOString().slice(0, 10)}-${t.toISOString().slice(0, 10)}.csv` };
  }
}
