'use client';

import { useMemo, useState } from 'react';
import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/env-urls';
import {
  DELIVERY_CONNECTION_SCHEMA,
  type ConnectionField,
} from '@/lib/delivery-connection-config';
import { DELIVERY_PROVIDER_META } from '@/components/delivery/DeliveryBrandIcons';
import type { DeliveryIntegration, DeliveryProvider } from '@/lib/delivery';

type FormState = {
  root: Record<string, string | number | boolean>;
  config: Record<string, string>;
  credentials: Record<string, string>;
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
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
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
        placeholder={
          field.placeholder || (type === 'password' && hasCredentials ? '•••••• (dejá vacío para no cambiar)' : '')
        }
        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2"
      />
      {field.help ? <p className="mt-1 text-xs text-fg-faint">{field.help}</p> : null}
    </label>
  );
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

  const [form, setForm] = useState<FormState>(() => ({
    root: {
      enabled: integration?.enabled ?? false,
      storeExternalId: integration?.storeExternalId ?? '',
      chainExternalId: integration?.chainExternalId ?? '',
      countryCode: integration?.countryCode ?? 'AR',
      prepMinutesDefault: integration?.prepMinutesDefault ?? 15,
      autoAccept: integration?.autoAccept ?? false,
      autoConfirmSale: integration?.autoConfirmSale ?? true,
    },
    config: Object.fromEntries(
      schema.configFields.map((f) => [f.key, String((integration?.config as Record<string, unknown>)?.[f.key] ?? f.options?.[0]?.value ?? '')]),
    ),
    credentials: Object.fromEntries(schema.credentialFields.map((f) => [f.key, ''])),
  }));

  const webhookUrl = useMemo(() => {
    if (!integration?.webhookToken) return '';
    return `${getApiBaseUrl()}/delivery/webhooks/${provider}/${integration.webhookToken}`;
  }, [integration?.webhookToken, provider]);

  const setRoot = (key: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, root: { ...f.root, [key]: value } }));
  const setConfig = (key: string, value: string) => setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  const setCredential = (key: string, value: string) =>
    setForm((f) => ({ ...f, credentials: { ...f.credentials, [key]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      const credentials: Record<string, string> = {};
      for (const [key, value] of Object.entries(form.credentials)) {
        if (String(value).trim()) credentials[key] = String(value).trim();
      }

      const config: Record<string, string> = {};
      for (const [key, value] of Object.entries(form.config)) {
        if (String(value).trim()) config[key] = String(value).trim();
      }

      await api<DeliveryIntegration>(`/delivery/integrations/${provider}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: form.root.enabled,
          storeExternalId: form.root.storeExternalId,
          chainExternalId: provider === 'pedidosya' ? form.root.chainExternalId : undefined,
          countryCode: form.root.countryCode,
          autoAccept: form.root.autoAccept,
          autoConfirmSale: form.root.autoConfirmSale,
          prepMinutesDefault: form.root.prepMinutesDefault,
          config,
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

  const rotateSecret = async () => {
    setRotating(true);
    try {
      const res = await api<DeliveryIntegration & { webhookSecret?: string }>(
        `/delivery/integrations/${provider}/regenerate-webhook-secret`,
        { method: 'POST' },
      );
      setWebhookSecret(res.webhookSecret ?? null);
      await onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo regenerar el secreto');
    } finally {
      setRotating(false);
    }
  };

  const renderFields = (fields: ConnectionField[]) =>
    fields.map((field) => {
      const value =
        field.storage === 'root'
          ? form.root[field.key]
          : field.storage === 'config'
            ? form.config[field.key]
            : form.credentials[field.key];
      const onChange = (v: string | number | boolean) => {
        if (field.storage === 'root') setRoot(field.key, v);
        else if (field.storage === 'config') setConfig(field.key, String(v));
        else setCredential(field.key, String(v));
      };
      return <FieldInput key={field.key} field={field} value={value} hasCredentials={integration?.hasCredentials} onChange={onChange} />;
    });

  return (
    <section className="space-y-6 rounded-2xl border border-hair-soft bg-surface p-5">
      <div>
        <h2 className="font-semibold text-fg">{schema.title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{schema.lead}</p>
        <p className="mt-2 rounded-xl bg-raised px-3 py-2 text-xs text-fg-faint">{schema.docsHint}</p>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={Boolean(form.root.enabled)}
          onChange={(e) => setRoot('enabled', e.target.checked)}
        />
        Integración habilitada
      </label>

      <div>
        <h3 className="text-sm font-semibold text-fg">Identificación del local</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{renderFields(schema.identityFields)}</div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-fg">Configuración de plataforma</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{renderFields(schema.configFields)}</div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-fg">Credenciales API</h3>
        <p className="mt-1 text-xs text-fg-faint">
          Se guardan cifradas. {integration?.hasCredentials ? 'Dejá un campo vacío si no querés cambiarlo.' : ''}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{renderFields(schema.credentialFields)}</div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-fg">Operación automática</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Minutos de preparación por defecto
            <input
              type="number"
              min={1}
              max={120}
              value={Number(form.root.prepMinutesDefault)}
              onChange={(e) => setRoot('prepMinutesDefault', Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-hair bg-raised px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.root.autoAccept)}
              onChange={(e) => setRoot('autoAccept', e.target.checked)}
            />
            Aceptar pedidos automáticamente al entrar
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.root.autoConfirmSale)}
              onChange={(e) => setRoot('autoConfirmSale', e.target.checked)}
            />
            Registrar venta y bajar stock al marcar listo
          </label>
        </div>
      </div>

      {webhookUrl ? (
        <div className="space-y-3 rounded-xl border border-hair bg-raised p-4">
          <p className="text-xs font-semibold uppercase text-fg-faint">Webhook en {meta.label}</p>
          <p className="text-xs text-fg-faint">
            Pegá esta URL en el panel de partners de {meta.label}. Los pedidos nuevos llegan por POST.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 break-all rounded-lg bg-surface px-2 py-2 text-xs text-fg">{webhookUrl}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(webhookUrl)}
              className="shrink-0 rounded-lg border border-hair p-2"
              aria-label="Copiar URL"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="h-4 w-4 text-fg-faint" />
            <span className="text-xs text-fg-faint">
              Header <code>{schema.webhookHeader}</code> con el secreto al configurar o probar el webhook.
            </span>
            <button
              type="button"
              disabled={rotating}
              onClick={() => void rotateSecret()}
              className="inline-flex items-center gap-1 rounded-lg border border-hair px-3 py-1.5 text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${rotating ? 'animate-spin' : ''}`} />
              {rotating ? 'Generando…' : 'Generar / rotar secreto'}
            </button>
          </div>
          {webhookSecret ? (
            <div className="rounded-lg border border-warn/30 bg-[var(--warn-soft)] p-3">
              <p className="text-xs font-semibold text-warn">Secreto nuevo — copialo ahora</p>
              <div className="mt-2 flex gap-2">
                <code className="flex-1 break-all text-xs">{webhookSecret}</code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(webhookSecret)}
                  className="shrink-0 rounded border border-hair p-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </section>
  );
}
