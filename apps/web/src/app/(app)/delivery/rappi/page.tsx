'use client';

import { DeliveryProviderModule } from '@/components/delivery/DeliveryProviderModule';
import { RappiIcon } from '@/components/delivery/DeliveryBrandIcons';

export default function RappiDeliveryPage() {
  return <DeliveryProviderModule provider="rappi" Icon={RappiIcon} />;
}
