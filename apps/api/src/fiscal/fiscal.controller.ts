import { Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { saleDateRangeFromQuery } from '../common/argentina-date-range';
import { FiscalService } from './fiscal.service';
import { FiscalReceivedService, receivedDateRange } from './fiscal-received.service';

type User = { businessId: string };
@Controller('fiscal')
export class FiscalController {
  constructor(
    private fiscal: FiscalService,
    private received: FiscalReceivedService,
  ) {}
  @Get('config')
  @UseGuards(JwtAuthGuard)
  config(@CurrentUser() u: User) { return this.fiscal.getPublicConfig(u.businessId); }
  @Put('config')
  @UseGuards(JwtAuthGuard)
  save(@CurrentUser() u: User, @Body() body: any) { return this.fiscal.saveConfig(u.businessId, body); }
  @Put('invoice-alert')
  @UseGuards(JwtAuthGuard)
  saveAlert(@CurrentUser() u: User, @Body() body: any) { return this.fiscal.saveInvoiceAlert(u.businessId, body); }
  @Get('invoice-alert')
  @UseGuards(JwtAuthGuard)
  invoiceAlert(@CurrentUser() u: User, @Query('nextAmount') nextAmount?: string) {
    const amount = nextAmount != null && nextAmount !== '' ? Number(nextAmount) : 0;
    return this.fiscal.getInvoiceAlert(u.businessId, Number.isFinite(amount) ? amount : 0);
  }
  @Get('invoices')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  invoicesSummary(
    @CurrentUser() u: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { from: fromD, to: toD } = saleDateRangeFromQuery(from, to);
    return this.fiscal.getInvoicesSummary(u.businessId, fromD, toD);
  }
  @Get('invoices/pending')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  batchFactura(@CurrentUser() u: User, @Body() body: { saleIds?: string[] }) {
    return this.fiscal.issueFacturaCBatch(u.businessId, body?.saleIds || []);
  }
  @Get('external-invoices')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  createExternalInvoice(@CurrentUser() u: User, @Body() body: { amount?: number; note?: string; invoicedAt?: string }) {
    return this.fiscal.createExternalInvoice(u.businessId, body ?? {});
  }
  @Delete('external-invoices/:id')
  @UseGuards(JwtAuthGuard)
  deleteExternalInvoice(@CurrentUser() u: User, @Param('id') id: string) {
    return this.fiscal.deleteExternalInvoice(u.businessId, id);
  }
  @Post('test')
  @UseGuards(JwtAuthGuard)
  test(@CurrentUser() u: User) { return this.fiscal.testConnection(u.businessId); }
  @Get('sales/:saleId/receipt')
  @UseGuards(JwtAuthGuard)
  receipt(@CurrentUser() u: User, @Param('saleId') saleId: string, @Query('reveal') reveal?: string) { return this.fiscal.receipt(u.businessId, saleId, reveal === '1' || reveal === 'true'); }
  @Post('sales/:saleId/factura')
  @UseGuards(JwtAuthGuard)
  factura(@CurrentUser() u: User, @Param('saleId') saleId: string) { return this.fiscal.issueFacturaC(u.businessId, saleId); }
  @Post('sales/:saleId/retry')
  @UseGuards(JwtAuthGuard)
  retry(@CurrentUser() u: User, @Param('saleId') saleId: string) { return this.fiscal.issueFacturaC(u.businessId, saleId); }
  @UseGuards(JwtAuthGuard)

  /** Comprobantes de compra registrados en ARCA a nombre del CUIT del negocio. */
  @Get('received')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  receivedSummary(@CurrentUser() u: User, @Query('from') from?: string, @Query('to') to?: string) {
    const range = receivedDateRange(from, to);
    return this.received.summary(u.businessId, range.from, range.to);
  }

  @Post('received/import')
  @UseGuards(JwtAuthGuard)
  importReceived(@CurrentUser() u: User, @Body() body: { csv?: string }) {
    return this.received.importCsv(u.businessId, body?.csv || '');
  }

  @Post('received/verify')
  @UseGuards(JwtAuthGuard)
  verifyReceived(@CurrentUser() u: User, @Body() body: { ids?: string[] }) {
    return this.received.verifyMany(u.businessId, body?.ids || []);
  }

  @Post('received/:id/verify')
  @UseGuards(JwtAuthGuard)
  verifyReceivedOne(@CurrentUser() u: User, @Param('id') id: string) {
    return this.received.verify(u.businessId, id);
  }

  @Delete('received/:id')
  @UseGuards(JwtAuthGuard)
  deleteReceived(@CurrentUser() u: User, @Param('id') id: string) {
    return this.received.remove(u.businessId, id);
  }

  @Delete('received')
  @UseGuards(JwtAuthGuard)
  clearReceived(@CurrentUser() u: User) {
    return this.received.clear(u.businessId);
  }

  @Post('received/sync')
  @UseGuards(JwtAuthGuard)
  syncReceived(
    @CurrentUser() u: User,
    @Body() body?: { from?: string; to?: string },
  ) {
    const range = receivedDateRange(body?.from, body?.to);
    return this.received.syncFromArca(u.businessId, range.from, range.to);
  }

  /** Cron diario: sync automático de facturas recibidas (Mis Comprobantes). */
  @Get('received/cron')
  receivedCron(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || authorization !== `Bearer ${secret}`) {
      throw new ForbiddenException('cron secret inválido');
    }
    return this.received.syncAllAuto();
  }
}
