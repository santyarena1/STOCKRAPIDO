/** Fragmento dentro de Business.posConfig (JSON). */
export type AiInvoicePosConfig = {
  n8nWebhookUrl?: string;
  webhookSecret?: string;
  publicApiUrl?: string;
};

/** Marca / apariencia (web): colores, favicon-logo, título en sidebar. */
export type BrandingPosConfig = {
  accentColor?: string;
  logoUrl?: string;
  appTitle?: string;
  /** Textos/enlaces y montos destacados */
  linkColor?: string;
  /** Botones primarios (guardar, cobrar, etc.) */
  primaryButtonColor?: string;
  /** Anillo de foco en inputs */
  focusRingColor?: string;
  /** Ítem activo del menú lateral (texto y borde) */
  navActiveColor?: string;
  /** Filas seleccionadas / resaltado en listas */
  selectionColor?: string;
  /** Sombras del tutorial y resaltados */
  shadowTintColor?: string;
};

const OPTIONAL_BRAND_COLOR_KEYS = [
  'linkColor',
  'primaryButtonColor',
  'focusRingColor',
  'navActiveColor',
  'selectionColor',
  'shadowTintColor',
] as const;

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

/** Pantalla secundaria cliente (QR MP, promos). */
export type CustomerDisplayPosConfig = {
  mercadopagoAlias?: string;
  mercadopagoQrUrl?: string;
  promoImageUrls?: string[];
};

type PosConfigPatchBody = {
  posConfig?: {
    aiInvoice?: Partial<AiInvoicePosConfig>;
    branding?: Partial<BrandingPosConfig>;
    customerDisplay?: Partial<CustomerDisplayPosConfig>;
  };
  clearAiInvoiceWebhookSecret?: boolean;
};

const MAX_LOGO_DATA_URL_CHARS = 350_000;

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

  const incomingAi = patch.posConfig?.aiInvoice;
  const incomingBrand = patch.posConfig?.branding;
  const incomingCd = patch.posConfig?.customerDisplay;
  const hasAi =
    incomingAi !== undefined &&
    typeof incomingAi === 'object' &&
    Object.keys(incomingAi as object).length > 0;
  const hasBrand =
    incomingBrand !== undefined &&
    typeof incomingBrand === 'object' &&
    Object.keys(incomingBrand as object).length > 0;
  const hasCd =
    incomingCd !== undefined &&
    typeof incomingCd === 'object' &&
    Object.keys(incomingCd as object).length > 0;

  if (!hasAi && !hasBrand && !hasCd) return undefined;

  const base = existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};

  if (hasBrand) {
    const prev =
      base.branding && typeof base.branding === 'object'
        ? { ...(base.branding as Record<string, unknown>) }
        : {};
    const inc = incomingBrand as Record<string, unknown>;
    const next: Record<string, unknown> = { ...prev };
    if ('accentColor' in inc) {
      const v = inc.accentColor;
      if (typeof v === 'string' && v.trim() !== '') next.accentColor = v.trim();
      else delete next.accentColor;
    }
    for (const key of OPTIONAL_BRAND_COLOR_KEYS) {
      if (key in inc) {
        const v = inc[key];
        if (typeof v === 'string' && v.trim() !== '') next[key] = v.trim();
        else delete next[key];
      }
    }
    if ('logoUrl' in inc) {
      const v = inc.logoUrl;
      if (typeof v === 'string' && v.trim() !== '') {
        const s = v.trim();
        if (s.length > MAX_LOGO_DATA_URL_CHARS) {
          throw new Error('El icono es demasiado grande (máx. ~350 KB en base64). Probá una imagen más chica.');
        }
        next.logoUrl = s;
      } else {
        delete next.logoUrl;
      }
    }
    if ('appTitle' in inc) {
      const v = inc.appTitle;
      if (typeof v === 'string' && v.trim() !== '') next.appTitle = v.trim().slice(0, 80);
      else delete next.appTitle;
    }
    base.branding = next;
  }

  if (hasCd) {
    const prev =
      base.customerDisplay && typeof base.customerDisplay === 'object'
        ? { ...(base.customerDisplay as Record<string, unknown>) }
        : {};
    const inc = incomingCd as Record<string, unknown>;
    const next: Record<string, unknown> = { ...prev };
    if ('mercadopagoAlias' in inc) {
      const v = inc.mercadopagoAlias;
      if (typeof v === 'string' && v.trim() !== '') next.mercadopagoAlias = v.trim().slice(0, 120);
      else delete next.mercadopagoAlias;
    }
    if ('mercadopagoQrUrl' in inc) {
      const v = inc.mercadopagoQrUrl;
      if (typeof v === 'string' && v.trim() !== '') {
        const s = v.trim();
        if (s.length > MAX_LOGO_DATA_URL_CHARS) {
          throw new Error('La imagen del QR es demasiado grande (máx. ~350 KB). Probá otra imagen.');
        }
        next.mercadopagoQrUrl = s;
      } else {
        delete next.mercadopagoQrUrl;
      }
    }
    if ('promoImageUrls' in inc) {
      const v = inc.promoImageUrls;
      if (Array.isArray(v)) {
        const urls: string[] = [];
        for (const item of v.slice(0, 12)) {
          if (typeof item !== 'string') continue;
          const s = item.trim();
          if (!s) continue;
          if (s.length > MAX_LOGO_DATA_URL_CHARS) {
            throw new Error('Una imagen de promoción es demasiado grande (máx. ~350 KB cada una).');
          }
          urls.push(s);
        }
        next.promoImageUrls = urls;
      }
    }
    base.customerDisplay = next;
  }

  if (hasAi) {
    const aiPrev =
      base.aiInvoice && typeof base.aiInvoice === 'object'
        ? { ...(base.aiInvoice as Record<string, unknown>) }
        : {};
    const incoming = incomingAi as Record<string, unknown>;
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
    base.aiInvoice = nextAi;
  }

  return base;
}
