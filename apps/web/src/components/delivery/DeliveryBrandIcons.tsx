export function RappiIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#FF441F" />
      <path
        d="M9 22V10h4.2c3.1 0 5.1 1.7 5.1 4.4 0 1.8-1 3.2-2.6 3.8L19.5 22H15l-2.8-3.2H13V22H9zm4-6.6h.2c1.2 0 1.9-.6 1.9-1.5s-.7-1.5-1.9-1.5H13v3zM20.5 22l3.5-12h3.8L24.3 22h-3.8z"
        fill="white"
      />
    </svg>
  );
}

export function PedidosYaIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#FA0050" />
      <path
        d="M8 11h16v2.2H13.8L19 22h-3.4l-4.3-7.2v7.2H8V11zm14.8 0H24l-3.2 5.4L24 22h-3.2l-2.1-3.6L16.6 22h-3.2l4.8-8.1L13.4 11h3.2l2.1 3.5L21.2 11z"
        fill="white"
      />
    </svg>
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
