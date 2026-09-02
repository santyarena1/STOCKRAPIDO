'use client';

import Link from 'next/link';
import {
  DELIVERY_FIELD_REQUIREMENTS,
  deliveryFieldWhere,
  deliveryProviderLabel,
  type DeliveryFieldSource,
  type DeliveryProviderId,
} from '@/lib/delivery-listing';
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

function providerHref(provider: DeliveryProviderId): string {
  return provider === 'rappi' ? '/delivery/rappi' : '/delivery/pedidosya';
}

function statusLabel(p: ProductDeliveryReadiness): string {
  if (p.requiredMissing.length) {
    return `Faltan ${p.requiredMissing.length} obligatorio${p.requiredMissing.length === 1 ? '' : 's'}`;
  }
  if (p.recommendedMissing.length) {
    return `Listo · ${p.recommendedMissing.length} recomendado${p.recommendedMissing.length === 1 ? '' : 's'} opcional${p.recommendedMissing.length === 1 ? '' : 'es'}`;
  }
  return p.published ? 'Publicado en la app' : 'Listo para publicar';
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
        const titleParts = [
          `${deliveryProviderLabel(p.provider)}: ${statusLabel(p)}`,
          missing ? `Obligatorios: ${p.requiredMissing.map((i) => i.label).join(', ')}` : null,
          recommended ? `Recomendados: ${p.recommendedMissing.map((i) => i.label).join(', ')}` : null,
        ].filter(Boolean);
        return (
          <span
            key={p.provider}
            title={titleParts.join('\n')}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}
          >
            <ProviderIcon provider={p.provider} className="h-3.5 w-3.5" />
            {compact ? deliveryProviderLabel(p.provider).slice(0, 2) : deliveryProviderLabel(p.provider)}
            {!compact && missing ? ` · ${missing}` : null}
            {!compact && !missing && recommended ? ' ~' : null}
          </span>
        );
      })}
    </div>
  );
}

/** Resumen de una línea para lista / tabla de productos. */
export function DeliveryProductReadinessInline({ providers }: { providers: ProductDeliveryReadiness[] }) {
  if (!providers.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {providers.map((p) => {
        const missing = [...p.requiredMissing, ...p.recommendedMissing];
        if (!missing.length) {
          return (
            <p key={p.provider} className="text-[11px] text-ok">
              <span className="font-semibold">{deliveryProviderLabel(p.provider)}:</span> listo para publicar
              {p.listPrice != null ? ` · ~$${p.listPrice.toLocaleString('es-AR')}` : ''}
            </p>
          );
        }
        const required = p.requiredMissing.map((i) => i.label);
        const recommended = p.recommendedMissing.map((i) => i.label);
        return (
          <p key={p.provider} className={`text-[11px] ${required.length ? 'text-crit' : 'text-warn'}`}>
            <span className="font-semibold">{deliveryProviderLabel(p.provider)}:</span>{' '}
            {required.length ? (
              <>
                falta {required.join(', ')}
                {recommended.length ? ` · suma ${recommended.join(', ')}` : ''}
              </>
            ) : (
              <>suma {recommended.join(', ')}</>
            )}
          </p>
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
        <h2 className="font-semibold text-fg">Apps de delivery</h2>
        <p className="mt-1 text-sm text-fg-muted">
          No tenés integraciones delivery activas. Activá Rappi o PedidosYa en{' '}
          <Link href="/delivery" className="text-brand hover:underline">
            Delivery → Conexión
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-hair-soft bg-surface p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-fg">Listo para publicar en delivery</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Según las apps activas en tu negocio: qué campos son obligatorios para listar el producto y cuáles no son
          obligatorios pero mejoran la ficha. Completalos en este formulario o en Delivery → Publicar.
        </p>
      </div>
      {providers.map((p) => {
        const reqs = DELIVERY_FIELD_REQUIREMENTS[p.provider];
        const missingRequired = new Set(p.requiredMissing.map((i) => i.key));
        const missingRecommended = new Set(p.recommendedMissing.map((i) => i.key));
        const requiredReqs = reqs.filter((r) => r.level === 'required');
        const recommendedReqs = reqs.filter((r) => r.level === 'recommended');
        return (
          <div key={p.provider} className="rounded-xl border border-hair bg-raised p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <ProviderIcon provider={p.provider} className="h-8 w-8" />
                <div>
                  <p className="font-semibold text-fg">{deliveryProviderLabel(p.provider)}</p>
                  <p className="text-xs text-fg-faint">
                    {statusLabel(p)}
                    {p.listPrice != null ? ` · Precio en app ~$${p.listPrice.toLocaleString('es-AR')}` : ''}
                    {p.syncStatus ? ` · ${p.syncStatus}` : ''}
                  </p>
                </div>
              </div>
              <Link
                href={providerHref(p.provider)}
                className="rounded-lg border border-hair bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-raised2"
              >
                Ir a Publicar →
              </Link>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Obligatorios para listar</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {requiredReqs.map((req) => (
                  <FieldCard
                    key={req.key}
                    req={req}
                    missing={missingRequired.has(req.key)}
                    level="required"
                  />
                ))}
              </div>
            </div>

            {recommendedReqs.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
                  No obligatorios pero suman
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {recommendedReqs.map((req) => (
                    <FieldCard
                      key={req.key}
                      req={req}
                      missing={missingRecommended.has(req.key)}
                      level="recommended"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function FieldCard({
  req,
  missing,
  level,
}: {
  req: { key: DeliveryFieldSource; label: string; hint?: string };
  missing: boolean;
  level: 'required' | 'recommended';
}) {
  const ok = !missing;
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        ok
          ? 'border-ok/30 bg-[var(--ok-soft)]'
          : level === 'required'
            ? 'border-crit/30 bg-[var(--crit-soft)]'
            : 'border-warn/30 bg-[var(--warn-soft)]'
      }`}
    >
      <p className="font-medium text-fg">
        {ok ? '✓ ' : '○ '}
        {req.label}
        <span className="ml-1 text-[10px] uppercase text-fg-faint">
          {level === 'required' ? 'obligatorio' : 'recomendado'}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-fg-muted">{deliveryFieldWhere(req.key)}</p>
      {req.hint ? <p className="mt-0.5 text-xs text-fg-faint">{req.hint}</p> : null}
    </div>
  );
}
