import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DeliveryOrdersService } from './delivery-orders.service';
import { DeliveryIntegrationsService } from './delivery-integrations.service';
import { DeliveryListingsService } from './delivery-listings.service';
import { isDeliveryProvider, type DeliveryProviderId } from './delivery.constants';

type User = { businessId: string; id: string };

@Controller('delivery')
@UseGuards(JwtAuthGuard)
export class DeliveryController {
  constructor(
    private orders: DeliveryOrdersService,
    private integrations: DeliveryIntegrationsService,
    private listingsService: DeliveryListingsService,
  ) {}

  @Get('readiness')
  readiness(@CurrentUser() u: User, @Query('productIds') productIds?: string) {
    const ids = productIds ? productIds.split(',').map((id) => id.trim()).filter(Boolean) : undefined;
    return this.listingsService.productReadiness(u.businessId, ids);
  }

  @Get('readiness/:productId')
  readinessOne(@CurrentUser() u: User, @Param('productId') productId: string) {
    return this.listingsService.productReadiness(u.businessId, [productId]);
  }

  @Get('hub/stats')
  hubStats(@CurrentUser() u: User) {
    return this.orders.hubStats(u.businessId);
  }

  @Get('orders')
  listOrders(
    @CurrentUser() u: User,
    @Query('provider') provider?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.orders.list(u.businessId, {
      provider,
      status,
      q,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('orders/:id')
  getOrder(@CurrentUser() u: User, @Param('id') id: string) {
    return this.orders.get(u.businessId, id);
  }

  @Post('orders/:id/accept')
  accept(@CurrentUser() u: User, @Param('id') id: string, @Body() body: { prepMinutes?: number }) {
    return this.orders.accept(u.businessId, id, u.id, body.prepMinutes);
  }

  @Post('orders/:id/reject')
  reject(@CurrentUser() u: User, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.orders.reject(u.businessId, id, u.id, body.reason);
  }

  @Post('orders/:id/preparing')
  preparing(@CurrentUser() u: User, @Param('id') id: string) {
    return this.orders.preparing(u.businessId, id, u.id);
  }

  @Post('orders/:id/ready')
  ready(@CurrentUser() u: User, @Param('id') id: string) {
    return this.orders.ready(u.businessId, id, u.id);
  }

  @Post('orders/:id/dispatch')
  dispatch(@CurrentUser() u: User, @Param('id') id: string) {
    return this.orders.dispatch(u.businessId, id, u.id);
  }

  @Post('orders/:id/deliver')
  deliver(@CurrentUser() u: User, @Param('id') id: string) {
    return this.orders.deliver(u.businessId, id, u.id);
  }

  @Post('orders/:id/cancel')
  cancel(@CurrentUser() u: User, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.orders.cancel(u.businessId, id, u.id, body.reason);
  }

  @Post('orders/:id/convert-sale')
  convertSale(@CurrentUser() u: User, @Param('id') id: string) {
    return this.orders.convertToSale(u.businessId, id, u.id);
  }

  @Get('integrations')
  listIntegrations(@CurrentUser() u: User) {
    return this.integrations.list(u.businessId);
  }

  @Get('integrations/:provider')
  getIntegration(@CurrentUser() u: User, @Param('provider') provider: string) {
    return this.integrations.get(u.businessId, provider);
  }

  @Patch('integrations/:provider')
  upsertIntegration(
    @CurrentUser() u: User,
    @Param('provider') provider: string,
    @Body()
    body: {
      name?: string;
      enabled?: boolean;
      storeExternalId?: string;
      chainExternalId?: string;
      countryCode?: string;
      config?: Record<string, unknown>;
      credentials?: Record<string, unknown>;
      storeOpen?: boolean;
      autoAccept?: boolean;
      autoConfirmSale?: boolean;
      prepMinutesDefault?: number;
      priceMarkupPercent?: number;
      platformCommissionPercent?: number;
      publishMode?: string;
      testMode?: boolean;
    },
  ) {
    return this.integrations.upsert(u.businessId, provider, body);
  }

  @Post('integrations/:provider/regenerate-webhook-secret')
  regenerateSecret(@CurrentUser() u: User, @Param('provider') provider: string) {
    return this.integrations.regenerateWebhookSecret(u.businessId, provider);
  }

  @Post('integrations/:provider/store-open')
  storeOpen(@CurrentUser() u: User, @Param('provider') provider: string, @Body() body: { open: boolean }) {
    return this.integrations.setStoreOpen(u.businessId, provider as DeliveryProviderId, body.open !== false);
  }

  @Get('integrations/:provider/mappings')
  mappings(@CurrentUser() u: User, @Param('provider') provider: string) {
    return this.integrations.listMappings(u.businessId, provider as DeliveryProviderId);
  }

  @Post('integrations/:provider/mappings')
  upsertMapping(
    @CurrentUser() u: User,
    @Param('provider') provider: string,
    @Body() body: { externalSku: string; externalName?: string; productId?: string | null; active?: boolean },
  ) {
    return this.integrations.upsertMapping(u.businessId, provider as DeliveryProviderId, body);
  }

  @Get('integrations/:provider/menu')
  menu(@CurrentUser() u: User, @Param('provider') provider: string) {
    return this.integrations.listMenu(u.businessId, provider as DeliveryProviderId);
  }

  @Post('integrations/:provider/menu/sync-products')
  syncMenu(@CurrentUser() u: User, @Param('provider') provider: string) {
    return this.integrations.syncMenuFromProducts(u.businessId, provider as DeliveryProviderId);
  }

  @Post('integrations/:provider/menu/push')
  pushMenu(@CurrentUser() u: User, @Param('provider') provider: string) {
    return this.integrations.pushMenu(u.businessId, provider as DeliveryProviderId);
  }

  @Get('integrations/:provider/events')
  events(@CurrentUser() u: User, @Param('provider') provider: string, @Query('limit') limit?: string) {
    return this.integrations.getEvents(u.businessId, provider as DeliveryProviderId, limit ? parseInt(limit, 10) : 50);
  }

  @Post('integrations/:provider/simulate')
  simulate(
    @CurrentUser() u: User,
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!isDeliveryProvider(provider)) throw new Error('Proveedor inválido');
    return this.orders.simulate(u.businessId, provider, body);
  }

  @Get('integrations/:provider/category-rules')
  categoryRules(@CurrentUser() u: User, @Param('provider') provider: string) {
    return this.listingsService.listCategoryRules(u.businessId, provider);
  }

  @Patch('integrations/:provider/category-rules')
  upsertCategoryRules(
    @CurrentUser() u: User,
    @Param('provider') provider: string,
    @Body() body: { rules: { categoryId: string; published?: boolean; platformCategoryId?: string; platformCategoryName?: string; sortOrder?: number }[] },
  ) {
    return this.listingsService.upsertCategoryRules(u.businessId, provider, body);
  }

  @Get('integrations/:provider/listings')
  listProviderListings(@CurrentUser() u: User, @Param('provider') provider: string, @Query('q') q?: string) {
    return this.listingsService.listListings(u.businessId, provider, q);
  }

  @Patch('integrations/:provider/listings/:id')
  updateListing(
    @CurrentUser() u: User,
    @Param('provider') provider: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.listingsService.upsertListing(u.businessId, provider, id, body);
  }

  @Post('integrations/:provider/listings/import')
  importListings(
    @CurrentUser() u: User,
    @Param('provider') provider: string,
    @Body() body: { productIds?: string[]; categoryIds?: string[]; allActive?: boolean },
  ) {
    return this.listingsService.importFromSelection(u.businessId, provider, body);
  }

  @Post('integrations/:provider/listings/validate')
  validateListings(@CurrentUser() u: User, @Param('provider') provider: string) {
    return this.listingsService.validateAll(u.businessId, provider);
  }

  @Post('integrations/:provider/listings/push')
  pushListings(@CurrentUser() u: User, @Param('provider') provider: string) {
    return this.listingsService.pushPublished(u.businessId, provider);
  }
}

@Controller('delivery/webhooks')
export class DeliveryWebhooksController {
  constructor(private orders: DeliveryOrdersService) {}

  @Post('rappi/:token')
  rappi(
    @Param('token') token: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.orders.ingestWebhook('rappi', token, body, headers);
  }

  @Post('pedidosya/:token')
  pedidosya(
    @Param('token') token: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.orders.ingestWebhook('pedidosya', token, body, headers);
  }
}
