import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { NormalizedItem } from './mondelez.provider';

type User = { businessId: string; role?: string };

@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  // ----- Conexiones (requieren login) -----
  @Get('proxy-check')
  @UseGuards(JwtAuthGuard)
  proxyCheck(@CurrentUser() u: User) {
    if (u.role !== 'OWNER' && u.role !== 'ADMIN') throw new ForbiddenException('Solo administradores pueden verificar el proxy.');
    return this.sync.proxyCheck();
  }

  @Get('connections')
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() u: User) {
    return this.sync.listConnections(u.businessId);
  }

  @Get('raw-columns-overview')
  @UseGuards(JwtAuthGuard)
  rawColumnsOverview(@CurrentUser() u: User) {
    return this.sync.getRawColumnsOverview(u.businessId);
  }

  @Get('connections/:id/raw-columns')
  @UseGuards(JwtAuthGuard)
  rawColumns(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.getRawColumns(id, u.businessId);
  }

  @Get('mapping-suggestions')
  @UseGuards(JwtAuthGuard)
  mappingSuggestions(@CurrentUser() u: User) {
    return this.sync.getMappingSuggestions(u.businessId);
  }

  @Post('mapping-suggestions/approve')
  @UseGuards(JwtAuthGuard)
  approveMapping(
    @CurrentUser() u: User,
    @Body() body: { field?: string; members?: Array<{ connectionId?: string; path?: string }> },
  ) {
    return this.sync.approveMappingSuggestion(u.businessId, body || {});
  }

  @Patch('connections/:id/view-config')
  @UseGuards(JwtAuthGuard)
  updateViewConfig(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() body: { tableColumns?: string[]; filterColumns?: string[] },
  ) {
    return this.sync.updateViewConfig(id, u.businessId, body || {});
  }

  @Get('connections/:id')
  @UseGuards(JwtAuthGuard)
  detail(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.getConnection(id, u.businessId);
  }

  @Post('connections')
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() u: User, @Body() body: any) {
    return this.sync.createConnection(u.businessId, body);
  }

  @Patch('connections/:id')
  @UseGuards(JwtAuthGuard)
  update(@CurrentUser() u: User, @Param('id') id: string, @Body() body: any) {
    return this.sync.updateConnection(id, u.businessId, body);
  }

  @Patch('connections/:id/credentials')
  @UseGuards(JwtAuthGuard)
  updateCredentials(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() body: { credentials: Record<string, string> },
  ) {
    return this.sync.updateCredentials(id, u.businessId, body?.credentials);
  }

  /** Sensible: entrega secretos solo al dueño autenticado para uso del runner. */
  @Get('connections/:id/credentials-secret')
  @UseGuards(JwtAuthGuard)
  credentialsSecret(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.getCredentialsSecret(id, u.businessId);
  }

  @Patch('connections/:id/session')
  @UseGuards(JwtAuthGuard)
  updateSession(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() body: { session: string | Record<string, unknown>; expiresAt?: string },
  ) {
    return this.sync.updateSession(id, u.businessId, body?.session, body?.expiresAt);
  }

  @Delete('connections/:id/session')
  @UseGuards(JwtAuthGuard)
  deleteSession(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.deleteSession(id, u.businessId);
  }

  @Post('connections/:id/account')
  @UseGuards(JwtAuthGuard)
  upsertAccount(@CurrentUser() u: User, @Param('id') id: string, @Body() body: any) {
    return this.sync.upsertSupplierAccount(id, u.businessId, body || {});
  }

  @Get('connections/:id/account')
  @UseGuards(JwtAuthGuard)
  account(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.getSupplierAccount(id, u.businessId);
  }

  @Post('connections/:id/orders')
  @UseGuards(JwtAuthGuard)
  replaceOrders(@CurrentUser() u: User, @Param('id') id: string, @Body() body: { orders: any[] }) {
    return this.sync.replaceSupplierOrders(id, u.businessId, body?.orders);
  }

  @Get('connections/:id/orders')
  @UseGuards(JwtAuthGuard)
  orders(@CurrentUser() u: User, @Param('id') id: string, @Query('source') source?: string) {
    return this.sync.listSupplierOrders(id, u.businessId, source || 'all');
  }

  @Post('connections/:id/orders/draft')
  @UseGuards(JwtAuthGuard)
  createOrderDraft(@CurrentUser() u: User, @Param('id') id: string, @Body() body: any) {
    return this.sync.createSupplierOrderDraft(id, u.businessId, body || {});
  }

  @Delete('connections/:id/orders/:orderId')
  @UseGuards(JwtAuthGuard)
  deleteOrderDraft(@CurrentUser() u: User, @Param('id') id: string, @Param('orderId') orderId: string) {
    return this.sync.deleteSupplierOrderDraft(id, u.businessId, orderId);
  }

  @Post('connections/:id/loyalty')
  @UseGuards(JwtAuthGuard)
  loyalty(@CurrentUser() u: User, @Param('id') id: string, @Body() body: { loyaltyPoints: number }) {
    return this.sync.updateSupplierLoyalty(id, u.businessId, body?.loyaltyPoints);
  }

  @Delete('connections/:id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.deleteConnection(id, u.businessId);
  }

  // ----- Sync de catálogo público (server-side) -----
  @Post('connections/:id/run')
  @UseGuards(JwtAuthGuard)
  run(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.runCatalogSync(id, u.businessId);
  }

  // ----- Listados -----
  @Get('connections/:id/products')
  @UseGuards(JwtAuthGuard)
  products(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('onlyAvailable') onlyAvailable?: string,
    @Query('onlyWithCost') onlyWithCost?: string,
  ) {
    return this.sync.listSyncedProducts(id, u.businessId, {
      q,
      onlyAvailable: onlyAvailable === 'true',
      onlyWithCost: onlyWithCost === 'true',
    });
  }

  @Get('connections/:id/products/:syncedProductId/price-history')
  @UseGuards(JwtAuthGuard)
  priceHistory(@CurrentUser() u: User, @Param('id') id: string, @Param('syncedProductId') syncedProductId: string) {
    return this.sync.getSyncedPriceHistory(id, u.businessId, syncedProductId);
  }

  @Get('connections/:id/price-changes')
  @UseGuards(JwtAuthGuard)
  priceChanges(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Query('days') days?: string,
    @Query('threshold') threshold?: string,
  ) {
    return this.sync.getPriceChanges(id, u.businessId, days ? Number(days) : 30, threshold ? Number(threshold) : 10);
  }

  @Get('connections/:id/runs')
  @UseGuards(JwtAuthGuard)
  runs(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.listRuns(id, u.businessId);
  }

  // ----- Mapeo de columnas (proveedor -> producto) -----
  @Get('connections/:id/mapping')
  @UseGuards(JwtAuthGuard)
  getMapping(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.getMappingInfo(id, u.businessId);
  }

  @Patch('connections/:id/mapping')
  @UseGuards(JwtAuthGuard)
  setMapping(@CurrentUser() u: User, @Param('id') id: string, @Body() body: { mapping: Record<string, string> }) {
    return this.sync.setMapping(id, u.businessId, body?.mapping || {});
  }

  // ----- Importar a productos del negocio -----
  @Post('connections/:id/import')
  @UseGuards(JwtAuthGuard)
  import(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() body: { onlyWithCost?: boolean; onlyAvailable?: boolean; ids?: string[] },
  ) {
    return this.sync.importToProducts(id, u.businessId, body || {});
  }

  @Post('connections/:id/reprice')
  @UseGuards(JwtAuthGuard)
  reprice(@CurrentUser() u: User, @Param('id') id: string) {
    return this.sync.repriceConnection(id, u.businessId);
  }

  // ----- Push desde el RUNNER autenticado (precios reales + todos los campos) -----
  @Post('connections/:id/push')
  @UseGuards(JwtAuthGuard)
  push(
    @CurrentUser() u: User,
    @Param('id') id: string,
    @Body() body: { items: NormalizedItem[] },
  ) {
    return this.sync.pushItems(id, u.businessId, body?.items || []);
  }

  // ----- Cron de Vercel: sync automático de catálogo (sin JWT, con secreto) -----
  // Vercel Cron hace GET y agrega "Authorization: Bearer <CRON_SECRET>".
  @Get('cron')
  cron(@Headers('authorization') auth?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      throw new ForbiddenException('cron secret inválido');
    }
    return this.sync.runAllAuto();
  }
}
