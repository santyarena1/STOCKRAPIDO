/** Fragmento dentro de Business.posConfig (JSON). */
export type AiInvoicePosConfig = {
  n8nWebhookUrl?: string;
  webhookSecret?: string;
  publicApiUrl?: string;
};

export function readAiInvoiceFromPosConfig(posConfig: unknown): AiInvoicePosConfig {
  if (!posConfig || typeof posConfig !== 'object') return {};
  const p = posConfig as Record<string, unknown>;
  const ai = p.aiInvoice;
  if (!ai || typeof ai !== 'object') return {};
  const a = ai as Record<string, unknown>;
  return {
    n8nWebhookUrl: typeof a.n8nWebhookUrl === 'string' ? a.n8nWebhookUrl : undefined,
    webhookSecret: typeof a.webhookSecret === 'string' ? a.webhookSecret : undefined,
    publicApiUrl: typeof a.publicApiUrl === 'string' ? a.publicApiUrl : undefined,
  };
}

/** No enviar el secreto al cliente; indica si hay uno guardado. */
export function sanitizePosConfigForApi(posConfig: unknown): unknown {
  if (!posConfig || typeof posConfig !== 'object') return posConfig;
  const p = posConfig as Record<string, unknown>;
  const ai = p.aiInvoice;
  if (!ai || typeof ai !== 'object') return posConfig;
  const a = ai as Record<string, unknown>;
  const hasWebhookSecret = typeof a.webhookSecret === 'string' && a.webhookSecret.length > 0;
  const { webhookSecret: _removed, ...restAi } = a;
  return {
    ...p,
    aiInvoice: {
      ...restAi,
      hasWebhookSecret,
    },
  };
}

type PosConfigPatchBody = {
  posConfig?: { aiInvoice?: Partial<AiInvoicePosConfig> };
  clearAiInvoiceWebhookSecret?: boolean;
};

export function mergePosConfigUpdate(
  existing: unknown,
  patch: PosConfigPatchBody,
): Record<string, unknown> | undefined {
  if (patch.clearAiInvoiceWebhookSecret) {
    const base = existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};
    const aiPrev =
      base.aiInvoice && typeof base.aiInvoice === 'object'
        ? { ...(base.aiInvoice as Record<string, unknown>) }
        : {};
    delete aiPrev.webhookSecret;
    return { ...base, aiInvoice: aiPrev };
  }
  if (!patch.posConfig?.aiInvoice) return undefined;
  const base = existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};
  const aiPrev =
    base.aiInvoice && typeof base.aiInvoice === 'object'
      ? { ...(base.aiInvoice as Record<string, unknown>) }
      : {};
  const incoming = patch.posConfig.aiInvoice as Record<string, unknown>;

  const nextAi: Record<string, unknown> = { ...aiPrev };
  if ('n8nWebhookUrl' in incoming) {
    const v = incoming.n8nWebhookUrl;
    nextAi.n8nWebhookUrl = typeof v === 'string' ? v.trim() : v;
  }
  if ('publicApiUrl' in incoming) {
    const v = incoming.publicApiUrl;
    nextAi.publicApiUrl = typeof v === 'string' ? v.trim() : v;
  }
  if ('webhookSecret' in incoming) {
    const v = incoming.webhookSecret;
    if (typeof v === 'string' && v.trim() !== '') {
      nextAi.webhookSecret = v.trim();
    } else {
      delete nextAi.webhookSecret;
    }
  }

  return { ...base, aiInvoice: nextAi };
}
