import { Injectable } from '@nestjs/common';
import type { DeliveryProviderId } from './delivery.constants';
import type { DeliveryProviderAdapter } from './providers/delivery-provider.interface';
import { rappiProvider } from './providers/rappi.provider';
import { pedidosyaProvider } from './providers/pedidosya.provider';

@Injectable()
export class DeliveryProviderRegistry {
  private readonly map: Record<DeliveryProviderId, DeliveryProviderAdapter> = {
    rappi: rappiProvider,
    pedidosya: pedidosyaProvider,
  };

  get(provider: DeliveryProviderId): DeliveryProviderAdapter {
    return this.map[provider];
  }
}
