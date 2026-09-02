'use client';

import { DELIVERY_FIELD_REQUIREMENTS, deliveryProviderLabel, type DeliveryProviderId } from '@/lib/delivery-listing';
import { RappiIcon, PedidosYaIcon } from '@/components/delivery/DeliveryBrandIcons';

export type ProductDeliveryReadiness = {
  provider: DeliveryProviderId;
  ready: boolean;
  requiredMissing: { key: string; label: string; level: string }[];
  recommendedMissing: { key: string; label: string; level: string }[];
  published: boolean;
  listPrice: number | null;
  syncStatus: string | null;
};

function ProviderIcon({ provider, className }: { provider: DeliveryProviderId; className?: string }) {
  return provider === 'rappi' ? <RappiIcon className={className} /> : <PedidosYaIcon className={className} />;
}

export function DeliveryProductReadinessBadges({
  providers,
  compact = false,
}: {
  providers: ProductDeliveryReadiness[];
  compact?: boolean;
}) {
  if (!providers.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? '' : 'gap-1.5'}`}>
      {providers.map((p) => {
        const missing = p.requiredMissing.length;
        const recommended = p.recommendedMissing.length;
        const tone = missing
          ? 'border-crit/40 bg-[var(--crit-soft)] text-crit'
          : recommended
            ? 'border-warn/40 bg-[var(--warn-soft)] text-warn'
            : 'border-ok/40 bg-[var(--ok-soft)] text-ok';
        return (
          <span
            key={p.provider}
            title={
              missing
                ? `Faltan: ${p.requiredMissing.map((i) => i.label).join(', ')}`
                : recommended
                  ? `Recomendado: ${p.recommendedMissing.map((i) => i.label).join(', ')}`
                  : `Listo para ${deliveryProviderLabel(p.provider)}`
            }
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}
          >
            <ProviderIcon provider={p.provider} className="h-3.5 w-3.5" />
            {compact ? (missing ? '!' : recommended ? '~' : '✓') : deliveryProviderLabel(p.provider).slice(0, 2)}
          </span>
        );
      })}
    </div>
  );
}

export function DeliveryProductReadinessPanel({
  providers,
}: {
  providers: ProductDeliveryReadiness[];
}) {
  if (!providers.length) {
    return (
      <section className="rounded-2xl border border-hair-soft bg-surface p-4">
        <h2 className="font-semibold text-fg">Delivery apps</h2>
        <p className="mt-1 text-sm text-fg-muted">No tenés integraciones delivery activas. Activá Rappi o PedidosYa en Delivery → Conexión.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-hair-soft bg-surface p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-fg">Listo para publicar en delivery</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Campos obligatorios y recomendados según cada app activa. Completalos acá o en Delivery → Publicar.
        </p>
      </div>
      {providers.map((p) => {
        const reqs = DELIVERY_FIELD_REQUIREMENTS[p.provider];
        const missingRequired = new Set(p.requiredMissing.map((i) => i.key));
        const missingRecommended = new Set(p.recommendedMissing.map((i) => i.key));
        return (
          <div key={p.provider} className="rounded-xl border border-hair bg-raised p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ProviderIcon provider={p.provider} className="h-8 w-8" />
              <div>
                <p className="font-semibold text-fg">{deliveryProviderLabel(p.provider)}</p>
                <p className="text-xs text-fg-faint">
                  {p.ready ? 'Listo para publicar' : `Faltan ${p.requiredMissing.length} obligatorios`}
                  {p.listPrice != null ? ` · Precio app ~$${p.listPrice.toLocaleString('es-AR')}` : ''}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {reqs.map((req) => {
                const missing = missingRequired.has(req.key) || missingRecommended.has(req.key);
                const isRequired = req.level === 'required';
                return (
                  <div
                    key={req.key}
                    className={`rounded-lg border px-3 py-2 text-sm ${missing ? (isRequired ? 'border-crit/30 bg-[var(--crit-soft)]' : 'border-warn/30 bg-[var(--warn-soft)]') : 'border-ok/30 bg-[var(--ok-soft)]'}`}
                  >
                    <p className="font-medium text-fg">
                      {req.label}{' '}
                      <span className="text-[10px] uppercase text-fg-faint">{isRequired ? 'obligatorio' : 'recomendado'}</span>
                    </p>
                    {req.hint ? <p className="text-xs text-fg-muted">{req.hint}</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
