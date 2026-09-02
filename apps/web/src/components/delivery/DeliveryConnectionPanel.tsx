'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/env-urls';
import { DELIVERY_CONNECTION_SCHEMA, type ConnectionField } from '@/lib/delivery-connection-config';
import { DELIVERY_PROVIDER_META } from '@/components/delivery/DeliveryBrandIcons';
import type { DeliveryIntegration, DeliveryProvider } from '@/lib/delivery';

type FormState = {
  root: Record<string, string | number | boolean>;
  credentials: Record<string, string>;
  pricing: Record<string, string | number | boolean>;
};

function FieldInput({
  field,
  value,
  hasCredentials,
  onChange,
}: {
  field: ConnectionField;
  value: string | number | boolean;
  hasCredentials?: boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const type = field.type ?? 'text';
  if (type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (type === 'select' && field.options) {
    return (
      <label className="block text-sm">
        {field.label}
        {field.required ? <span className="text-crit"> *</span> : null}
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2">
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {field.help ? <p className="mt-1 text-xs text-fg-faint">{field.help}</p> : null}
      </label>
    );
  }
  return (
    <label className="block text-sm">
      {field.label}
      {field.required ? <span className="text-crit"> *</span> : null}
      <input
        type={type === 'password' ? 'password' : type === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        placeholder={field.placeholder || (type === 'password' && hasCredentials ? '•••••• (vacío = no cambiar)' : '')}
        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2"
      />
      {field.help ? <p className="mt-1 text-xs text-fg-faint">{field.help}</p> : null}
    </label>
  );
}

function formFromIntegration(provider: DeliveryProvider, integration: DeliveryIntegration | null): FormState {
  return {
    root: {
      enabled: integration?.enabled ?? false,
      storeExternalId: integration?.storeExternalId ?? '',
      chainExternalId: integration?.chainExternalId ?? '',
      countryCode: integration?.countryCode ?? 'AR',
      prepMinutesDefault: integration?.prepMinutesDefault ?? 15,
      autoAccept: integration?.autoAccept ?? false,
      autoConfirmSale: integration?.autoConfirmSale ?? true,
    },
    credentials: Object.fromEntries(DELIVERY_CONNECTION_SCHEMA[provider].credentialFields.map((f) => [f.key, ''])),
    pricing: {
      priceMarkupPercent: integration?.priceMarkupPercent ?? 0,
      platformCommissionPercent: integration?.platformCommissionPercent ?? 28,
      testMode: integration?.testMode ?? false,
    },
  };
}

export function DeliveryConnectionPanel({
  provider,
  integration,
  onSaved,
}: {
  provider: DeliveryProvider;
  integration: DeliveryIntegration | null;
  onSaved: () => Promise<void>;
}) {
  const schema = DELIVERY_CONNECTION_SCHEMA[provider];
  const meta = DELIVERY_PROVIDER_META[provider];
  const [saving, setSaving] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [form, setForm] = useState<FormState>(() => formFromIntegration(provider, integration));

  useEffect(() => {
    setForm(formFromIntegration(provider, integration));
  }, [provider, integration?.id, integration?.enabled]);

  const webhookUrl = useMemo(() => {
    if (!integration?.webhookToken) return '';
    return `${getApiBaseUrl()}/delivery/webhooks/${provider}/${integration.webhookToken}`;
  }, [integration?.webhookToken, provider]);

  const setRoot = (key: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, root: { ...f.root, [key]: value } }));
  const setCredential = (key: string, value: string) =>
    setForm((f) => ({ ...f, credentials: { ...f.credentials, [key]: value } }));
  const setPricing = (key: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, pricing: { ...f.pricing, [key]: value } }));

  const renderFields = (fields: ConnectionField[], storage: ConnectionField['storage']) =>
    fields
      .filter((f) => f.storage === storage)
      .map((field) => {
        const value =
          storage === 'root' ? form.root[field.key] : storage === 'credentials' ? form.credentials[field.key] : form.pricing[field.key];
        const onChange = (v: string | number | boolean) => {
          if (storage === 'root') setRoot(field.key, v);
          else if (storage === 'credentials') setCredential(field.key, String(v));
          else setPricing(field.key, v);
        };
        return <FieldInput key={field.key} field={field} value={value} hasCredentials={integration?.hasCredentials} onChange={onChange} />;
      });

  const save = async () => {
    setSaving(true);
    try {
      const credentials: Record<string, string> = {};
      for (const [key, value] of Object.entries(form.credentials)) {
        if (String(value).trim()) credentials[key] = String(value).trim();
      }
      await api(`/delivery/integrations/${provider}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: form.root.enabled,
          storeExternalId: form.root.storeExternalId,
          chainExternalId: provider === 'pedidosya' ? form.root.chainExternalId : null,
          countryCode: form.root.countryCode,
          autoAccept: form.root.autoAccept,
          autoConfirmSale: form.root.autoConfirmSale,
          prepMinutesDefault: form.root.prepMinutesDefault,
          priceMarkupPercent: Number(form.pricing.priceMarkupPercent) || 0,
          platformCommissionPercent: Number(form.pricing.platformCommissionPercent) || 28,
          testMode: Boolean(form.pricing.testMode),
          credentials: Object.keys(credentials).length ? credentials : undefined,
        }),
      });
      setForm((f) => ({ ...f, credentials: Object.fromEntries(Object.keys(f.credentials).map((k) => [k, ''])) }));
      await onSaved();
      alert('Configuración guardada');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6 rounded-2xl border border-hair-soft bg-surface p-5">
      <div>
        <h2 className="font-semibold text-fg">{schema.title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{schema.lead}</p>
        <p className="mt-2 rounded-xl bg-raised px-3 py-2 text-xs text-fg-faint">{schema.docsHint}</p>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={Boolean(form.root.enabled)} onChange={(e) => setRoot('enabled', e.target.checked)} />
        Integración habilitada
      </label>

      <div>
        <h3 className="text-sm font-semibold text-fg">Identificación</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{renderFields(schema.identityFields, 'root')}</div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-fg">Credenciales API</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{renderFields(schema.credentialFields, 'credentials')}</div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-fg">Precios en la app</h3>
        <p className="text-xs text-fg-faint">Se aplican al calcular el precio de cada producto publicado.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{renderFields(schema.pricingFields, 'pricing')}</div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-fg">Operación</h3>
        <div className="mt-3 space-y-2">
          {schema.operationFields.map((field) => {
            const storage = field.storage;
            const value = storage === 'root' ? form.root[field.key] : form.pricing[field.key];
            const onChange = (v: string | number | boolean) => {
              if (storage === 'root') setRoot(field.key, v);
              else setPricing(field.key, v);
            };
            return <FieldInput key={field.key} field={field} value={value} onChange={onChange} />;
          })}
        </div>
      </div>

      {webhookUrl ? (
        <div className="space-y-3 rounded-xl border border-hair bg-raised p-4">
          <p className="text-xs font-semibold uppercase text-fg-faint">Webhook {meta.label}</p>
          <div className="flex gap-2">
            <code className="flex-1 break-all rounded-lg bg-surface px-2 py-2 text-xs">{webhookUrl}</code>
            <button type="button" onClick={() => void navigator.clipboard.writeText(webhookUrl)} className="rounded-lg border border-hair p-2"><Copy className="h-4 w-4" /></button>
          </div>
          <button
            type="button"
            disabled={rotating}
            onClick={async () => {
              setRotating(true);
              try {
                const res = await api<{ webhookSecret?: string }>(`/delivery/integrations/${provider}/regenerate-webhook-secret`, { method: 'POST' });
                setWebhookSecret(res.webhookSecret ?? null);
                await onSaved();
              } finally {
                setRotating(false);
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-hair px-3 py-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rotating ? 'animate-spin' : ''}`} />
            Generar / rotar secreto
          </button>
          {webhookSecret ? (
            <div className="rounded-lg border border-warn/30 bg-[var(--warn-soft)] p-3 text-xs">
              <p className="font-semibold text-warn">Secreto nuevo — copialo ahora</p>
              <code className="mt-1 block break-all">{webhookSecret}</code>
            </div>
          ) : null}
        </div>
      ) : null}

      <button type="button" disabled={saving} onClick={() => void save()} className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
        {saving ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </section>
  );
}
