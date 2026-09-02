import type { DeliveryProvider } from '@/lib/delivery';

const BRAND_LOGOS: Record<DeliveryProvider, { src: string; alt: string }> = {
  rappi: { src: '/delivery/rappi.png', alt: 'Rappi' },
  pedidosya: { src: '/delivery/pedidosya.png', alt: 'PedidosYa' },
};

export function RappiIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return <DeliveryBrandLogo provider="rappi" className={className} />;
}

export function PedidosYaIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return <DeliveryBrandLogo provider="pedidosya" className={className} />;
}

export function DeliveryBrandLogo({
  provider,
  className = 'h-7 w-7',
}: {
  provider: DeliveryProvider;
  className?: string;
}) {
  const { src, alt } = BRAND_LOGOS[provider];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`inline-block shrink-0 object-contain ${className}`}
      draggable={false}
    />
  );
}

export const DELIVERY_PROVIDER_META = {
  rappi: {
    label: 'Rappi',
    color: '#FF441F',
    soft: 'rgba(255,68,31,0.12)',
    href: '/delivery/rappi',
  },
  pedidosya: {
    label: 'PedidosYa',
    color: '#FA0050',
    soft: 'rgba(250,0,80,0.12)',
    href: '/delivery/pedidosya',
  },
} as const;

export type DeliveryProviderKey = keyof typeof DELIVERY_PROVIDER_META;
