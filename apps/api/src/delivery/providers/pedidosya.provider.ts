import { createProviderStub } from './provider-base';

export const pedidosyaProvider = createProviderStub('pedidosya', {
  parseIncomingOrder: (body) => {
    const root = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const event = String(root.event ?? root.type ?? root.status ?? '').toUpperCase();
    if (event.includes('CANCEL')) return null;
    return createProviderStub('pedidosya').parseIncomingOrder(body);
  },
});
