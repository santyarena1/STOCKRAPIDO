'use client';

import { DeliveryProviderModule } from '@/components/delivery/DeliveryProviderModule';
import { PedidosYaIcon } from '@/components/delivery/DeliveryBrandIcons';

export default function PedidosYaDeliveryPage() {
  return <DeliveryProviderModule provider="pedidosya" Icon={PedidosYaIcon} />;
}
