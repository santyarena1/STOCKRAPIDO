import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { saleDateRangeFromQuery } from '../common/argentina-date-range';
import { FiscalService } from './fiscal.service';
import { FiscalReceivedService, receivedDateRange } from './fiscal-received.service';

type User = { businessId: string };
@Controller('fiscal')
@UseGuards(JwtAuthGuard)
export class FiscalController {
  constructor(
    private fiscal: FiscalService,
    private received: FiscalReceivedService,
  ) {}
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
  @Get('invoices/summary')
  invoicesSummary(
    @CurrentUser() u: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { from: fromD, to: toD } = saleDateRangeFromQuery(from, to);
    return this.fiscal.getInvoicesSummary(u.businessId, fromD, toD);
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
  @Get('external-invoices')
  externalInvoices(
    @CurrentUser() u: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 100;
    const { from: fromD, to: toD } = saleDateRangeFromQuery(from, to);
    return this.fiscal.listExternalInvoices(u.businessId, {
      from: fromD,
      to: toD,
      limit: Number.isFinite(lim) && lim > 0 ? lim : 100,
    });
  }
  @Post('external-invoices')
  createExternalInvoice(@CurrentUser() u: User, @Body() body: { amount?: number; note?: string; invoicedAt?: string }) {
    return this.fiscal.createExternalInvoice(u.businessId, body ?? {});
  }
  @Delete('external-invoices/:id')
  deleteExternalInvoice(@CurrentUser() u: User, @Param('id') id: string) {
    return this.fiscal.deleteExternalInvoice(u.businessId, id);
  }
  @Post('test') test(@CurrentUser() u: User) { return this.fiscal.testConnection(u.businessId); }
  @Get('sales/:saleId/receipt') receipt(@CurrentUser() u: User, @Param('saleId') saleId: string, @Query('reveal') reveal?: string) { return this.fiscal.receipt(u.businessId, saleId, reveal === '1' || reveal === 'true'); }
  @Post('sales/:saleId/factura') factura(@CurrentUser() u: User, @Param('saleId') saleId: string) { return this.fiscal.issueFacturaC(u.businessId, saleId); }
  @Post('sales/:saleId/retry') retry(@CurrentUser() u: User, @Param('saleId') saleId: string) { return this.fiscal.issueFacturaC(u.businessId, saleId); }

  /** Comprobantes de compra registrados en ARCA a nombre del CUIT del negocio. */
  @Get('received')
  listReceived(
    @CurrentUser() u: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 200;
    const range = receivedDateRange(from, to);
    return this.received.list(u.businessId, {
      from: range.from,
      to: range.to,
      q,
      status,
      limit: Number.isFinite(lim) && lim > 0 ? lim : 200,
    });
  }

  @Get('received/summary')
  receivedSummary(@CurrentUser() u: User, @Query('from') from?: string, @Query('to') to?: string) {
    const range = receivedDateRange(from, to);
    return this.received.summary(u.businessId, range.from, range.to);
  }

  @Post('received/import')
  importReceived(@CurrentUser() u: User, @Body() body: { csv?: string }) {
    return this.received.importCsv(u.businessId, body?.csv || '');
  }

  @Post('received/verify')
  verifyReceived(@CurrentUser() u: User, @Body() body: { ids?: string[] }) {
    return this.received.verifyMany(u.businessId, body?.ids || []);
  }

  @Post('received/:id/verify')
  verifyReceivedOne(@CurrentUser() u: User, @Param('id') id: string) {
    return this.received.verify(u.businessId, id);
  }

  @Delete('received/:id')
  deleteReceived(@CurrentUser() u: User, @Param('id') id: string) {
    return this.received.remove(u.businessId, id);
  }

  @Delete('received')
  clearReceived(@CurrentUser() u: User) {
    return this.received.clear(u.businessId);
  }
}
