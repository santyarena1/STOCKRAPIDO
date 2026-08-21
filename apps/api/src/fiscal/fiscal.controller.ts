import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { saleDateRangeFromQuery } from '../common/argentina-date-range';
import { FiscalService } from './fiscal.service';

type User = { businessId: string };
@Controller('fiscal')
@UseGuards(JwtAuthGuard)
export class FiscalController {
  constructor(private fiscal: FiscalService) {}
  @Get('config') config(@CurrentUser() u: User) { return this.fiscal.getPublicConfig(u.businessId); }
  @Put('config') save(@CurrentUser() u: User, @Body() body: any) { return this.fiscal.saveConfig(u.businessId, body); }
  @Put('invoice-alert') saveAlert(@CurrentUser() u: User, @Body() body: any) { return this.fiscal.saveInvoiceAlert(u.businessId, body); }
  @Get('invoice-alert')
  invoiceAlert(@CurrentUser() u: User, @Query('nextAmount') nextAmount?: string) {
    const amount = nextAmount != null && nextAmount !== '' ? Number(nextAmount) : 0;
    return this.fiscal.getInvoiceAlert(u.businessId, Number.isFinite(amount) ? amount : 0);
  }
  @Get('invoices')
  invoices(
    @CurrentUser() u: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('includeVoided') includeVoided?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 100;
    const { from: fromD, to: toD } = saleDateRangeFromQuery(from, to);
    return this.fiscal.listInvoices(u.businessId, {
      from: fromD,
      to: toD,
      limit: Number.isFinite(lim) && lim > 0 ? lim : 100,
      includeVoided: includeVoided === '1' || includeVoided === 'true',
    });
  }
  @Get('invoices/pending')
  pendingInvoices(
    @CurrentUser() u: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 100;
    const { from: fromD, to: toD } = saleDateRangeFromQuery(from, to);
    return this.fiscal.listPendingInvoices(u.businessId, {
      from: fromD,
      to: toD,
      limit: Number.isFinite(lim) && lim > 0 ? lim : 100,
    });
  }
  @Post('invoices/batch')
  batchFactura(@CurrentUser() u: User, @Body() body: { saleIds?: string[] }) {
    return this.fiscal.issueFacturaCBatch(u.businessId, body?.saleIds || []);
  }
  @Post('test') test(@CurrentUser() u: User) { return this.fiscal.testConnection(u.businessId); }
  @Get('sales/:saleId/receipt') receipt(@CurrentUser() u: User, @Param('saleId') saleId: string, @Query('reveal') reveal?: string) { return this.fiscal.receipt(u.businessId, saleId, reveal === '1' || reveal === 'true'); }
  @Post('sales/:saleId/factura') factura(@CurrentUser() u: User, @Param('saleId') saleId: string) { return this.fiscal.issueFacturaC(u.businessId, saleId); }
  @Post('sales/:saleId/retry') retry(@CurrentUser() u: User, @Param('saleId') saleId: string) { return this.fiscal.issueFacturaC(u.businessId, saleId); }
}
