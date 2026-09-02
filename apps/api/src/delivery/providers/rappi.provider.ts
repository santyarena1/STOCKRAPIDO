import { createProviderStub } from './provider-base';

export const rappiProvider = createProviderStub('rappi', {
  parseIncomingOrder: (body) => {
    const root = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const event = String(root.event ?? root.type ?? '').toUpperCase();
    if (event.includes('CANCEL')) return null;
    if (event && !event.includes('ORDER') && !root.order && !root.data) return null;
    return createProviderStub('rappi').parseIncomingOrder(body);
  },
});
