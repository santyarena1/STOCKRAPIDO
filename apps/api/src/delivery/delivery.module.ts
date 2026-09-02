import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { DeliveryController, DeliveryWebhooksController } from './delivery.controller';
import { DeliveryOrdersService } from './delivery-orders.service';
import { DeliveryIntegrationsService } from './delivery-integrations.service';
import { DeliveryListingsService } from './delivery-listings.service';
import { DeliveryProviderRegistry } from './delivery-provider.registry';

@Module({
  imports: [SalesModule],
  controllers: [DeliveryController, DeliveryWebhooksController],
  providers: [DeliveryOrdersService, DeliveryIntegrationsService, DeliveryListingsService, DeliveryProviderRegistry],
  exports: [DeliveryOrdersService, DeliveryIntegrationsService, DeliveryListingsService],
})
export class DeliveryModule {}
