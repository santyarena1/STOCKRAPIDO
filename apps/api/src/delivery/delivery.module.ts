import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { DeliveryController, DeliveryWebhooksController } from './delivery.controller';
import { DeliveryOrdersService } from './delivery-orders.service';
import { DeliveryIntegrationsService } from './delivery-integrations.service';
import { DeliveryProviderRegistry } from './delivery-provider.registry';

@Module({
  imports: [SalesModule],
  controllers: [DeliveryController, DeliveryWebhooksController],
  providers: [DeliveryOrdersService, DeliveryIntegrationsService, DeliveryProviderRegistry],
  exports: [DeliveryOrdersService, DeliveryIntegrationsService],
})
export class DeliveryModule {}
