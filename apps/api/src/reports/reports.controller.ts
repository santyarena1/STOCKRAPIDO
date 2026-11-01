import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { argentinaTodayYmd, saleDateRangeFromQuery } from '../common/argentina-date-range';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportPeriod, ReportsService } from './reports.service';

type User = { businessId: string };

function reportParams(period?: string, from?: string, to?: string) {
  const allowed: ReportPeriod[] = ['today', 'week', 'month', 'year'];
  const parsedPeriod = (period ?? 'month') as ReportPeriod;
  if (!allowed.includes(parsedPeriod)) {
    throw new BadRequestException('period debe ser today, week, month o year.');
  }
  return { period: parsedPeriod, ...saleDateRangeFromQuery(from, to) };
}

function positiveInt(value: string | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new BadRequestException('El parámetro debe ser un entero positivo.');
  return Math.min(parsed, max);
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('sales-by-hour')
  salesByHour(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.salesByHour(user.businessId, range.period, range.from, range.to);
  }

  @Get('sales-by-weekday')
  salesByWeekday(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.salesByWeekday(user.businessId, range.period, range.from, range.to);
  }

  @Get('sales-by-payment')
  salesByPayment(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.salesByPayment(user.businessId, range.period, range.from, range.to);
  }

  @Get('sales-by-user')
  salesByUser(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.salesByUser(user.businessId, range.period, range.from, range.to);
  }

  @Get('sales-by-category')
  salesByCategory(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.salesByCategory(user.businessId, range.period, range.from, range.to);
  }

  @Get('sales-by-brand')
  salesByBrand(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.salesByBrand(user.businessId, range.period, range.from, range.to);
  }

  @Get('average-ticket')
  averageTicket(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.averageTicket(user.businessId, range.period, range.from, range.to);
  }

  @Get('sales-comparison')
  salesComparison(@CurrentUser() user: User) {
    return this.reports.salesComparison(user.businessId);
  }

  @Get('dead-stock')
  deadStock(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.reports.deadStock(user.businessId, positiveInt(days, 30, 3650));
  }

  @Get('stock-outs')
  stockOuts(@CurrentUser() user: User) {
    return this.reports.stockOuts(user.businessId);
  }

  @Get('inventory-valuation')
  inventoryValuation(@CurrentUser() user: User) {
    return this.reports.inventoryValuation(user.businessId);
  }

  @Get('top-customers')
  topCustomers(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportParams(period, from, to);
    return this.reports.topCustomers(user.businessId, range.period, positiveInt(limit, 10, 200), range.from, range.to);
  }

  @Get('fiado-aging')
  fiadoAging(@CurrentUser() user: User) {
    return this.reports.fiadoAging(user.businessId);
  }

  @Get('purchases-by-supplier')
  purchasesBySupplier(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.purchasesBySupplier(user.businessId, range.period, range.from, range.to);
  }

  @Get('expenses-by-category')
  expensesByCategory(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.expensesByCategory(user.businessId, range.period, range.from, range.to);
  }

  @Get('gross-margin')
  grossMargin(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.grossMargin(user.businessId, range.period, range.from, range.to);
  }

  @Get('fiscal-summary')
  fiscalSummary(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.fiscalSummary(user.businessId, range.period, range.from, range.to);
  }

  @Get('cash-sessions')
  cashSessions(@CurrentUser() user: User, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const range = reportParams(period, from, to);
    return this.reports.cashSessions(user.businessId, range.period, range.from, range.to);
  }

  @Get('sales')
  salesSummary(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportParams(period ?? 'today', from, to);
    return this.reports.salesSummary(user.businessId, range.period, range.from, range.to);
  }

  @Get('top-products')
  topProducts(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportParams(period ?? 'today', from, to);
    return this.reports.topProducts(
      user.businessId,
      range.period,
      positiveInt(limit, 10, 200),
      range.from,
      range.to,
    );
  }

  @Get('purchases-by-day')
  purchasesByDayOfMonth(
    @CurrentUser() user: User,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const dates = saleDateRangeFromQuery(from, to);
    if (dates.from && dates.to) {
      return this.reports.purchasesByDayRange(user.businessId, dates.from, dates.to);
    }
    const y = year ? parseInt(year, 10) : undefined;
    const m = month ? parseInt(month, 10) - 1 : undefined;
    return this.reports.purchasesByDayOfMonth(user.businessId, y, m);
  }

  @Get('expenses-by-day')
  expensesByDayOfMonth(
    @CurrentUser() user: User,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const dates = saleDateRangeFromQuery(from, to);
    if (dates.from && dates.to) {
      return this.reports.expensesByDayRange(user.businessId, dates.from, dates.to);
    }
    const y = year ? parseInt(year, 10) : undefined;
    const m = month ? parseInt(month, 10) - 1 : undefined;
    return this.reports.expensesByDayOfMonth(user.businessId, y, m);
  }

  @Get('margin')
  margin(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportParams(period ?? 'today', from, to);
    return this.reports.marginEstimate(user.businessId, range.period, range.from, range.to);
  }

  @Get('net-profit')
  netProfit(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportParams(period ?? 'today', from, to);
    return this.reports.netProfit(user.businessId, range.period, range.from, range.to);
  }

  @Get('sales-by-day')
  salesByDayOfMonth(
    @CurrentUser() user: User,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const dates = saleDateRangeFromQuery(from, to);
    if (dates.from && dates.to) {
      return this.reports.salesByDayRange(user.businessId, dates.from, dates.to);
    }
    const y = year ? parseInt(year, 10) : undefined;
    const m = month ? parseInt(month, 10) - 1 : undefined;
    return this.reports.salesByDayOfMonth(user.businessId, y, m);
  }

  @Get('top-products-profit')
  topProductsByProfit(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportParams(period ?? 'today', from, to);
    return this.reports.topProductsByProfit(
      user.businessId,
      range.period,
      positiveInt(limit, 10, 200),
      range.from,
      range.to,
    );
  }

  @Get('least-sold-products')
  leastSoldProducts(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportParams(period ?? 'month', from, to);
    return this.reports.leastSoldProducts(
      user.businessId,
      range.period,
      positiveInt(limit, 10, 200),
      range.from,
      range.to,
    );
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

  @Get('critical-stock-pos')
  criticalStockPos(@CurrentUser() user: User, @Query('max') max?: string) {
    const m = max != null && max !== '' ? parseInt(max, 10) : 3;
    return this.reports.criticalStockForPos(user.businessId, m);
  }

  @Get('stock-summary')
  stockSummary(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.reports.stockSummary(user.businessId, days ? parseInt(days, 10) : 30);
  }

  @Get('sales-history-stats')
  salesHistoryStats(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customerId') customerId?: string,
    @Query('productId') productId?: string,
  ) {
    const { from: fromD, to: toD } = saleDateRangeFromQuery(from, to);
    return this.reports.salesHistoryStats(
      user.businessId,
      fromD,
      toD,
      customerId,
      productId?.trim() || undefined,
    );
  }

  @Get('expiring')
  expiring(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.reports.expiringSoon(user.businessId, days ? parseInt(days, 10) : 30);
  }

  @Get('caja')
  caja(@CurrentUser() user: User, @Query('from') from?: string, @Query('to') to?: string) {
    const r = saleDateRangeFromQuery(from, to);
    const f = r.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const t = r.to ?? new Date();
    return this.reports.cajaByDay(user.businessId, f, t);
  }

  @Get('export/sales')
  async salesCsv(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('download') download?: string,
  ) {
    const r = saleDateRangeFromQuery(from, to);
    const f = r.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const t = r.to ?? new Date();
    const csv = await this.reports.salesCsv(user.businessId, f, t);
    const fromLabel = from?.trim() || argentinaTodayYmd(f);
    const toLabel = to?.trim() || argentinaTodayYmd(t);
    return { csv, filename: `ventas-${fromLabel}-${toLabel}.csv` };
  }
}
