import { BadRequestException } from '@nestjs/common';

type AutomationStatus = string;

export type MisComprobantesParams = {
  cuit: string;
  username: string;
  password: string;
  /** Rango dd/mm/yyyy - dd/mm/yyyy */
  fechaEmision: string;
};

function accessToken() {
  const token = process.env.AFIP_SDK_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new BadRequestException(
      'Falta AFIP_SDK_ACCESS_TOKEN en el servidor. Sin eso no se puede sincronizar Mis Comprobantes automáticamente (ARCA no tiene API oficial de recibidos).',
    );
  }
  return token;
}

function isTerminal(status: AutomationStatus) {
  const s = (status || '').toLowerCase();
  return ['complete', 'completed', 'done', 'success', 'error', 'failed', 'fail'].includes(s);
}

function isError(status: AutomationStatus) {
  const s = (status || '').toLowerCase();
  return ['error', 'failed', 'fail'].includes(s);
}

async function afipFetch(path: string, init?: RequestInit) {
  const response = await fetch(`https://app.afipsdk.com/api/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
      'sdk-library': 'javascript',
      'sdk-version-number': 'stockrapido',
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      (data as { message?: string; error?: string })?.message ||
      (data as { error?: string })?.error ||
      `Afip SDK HTTP ${response.status}`;
    throw new BadRequestException(msg);
  }
  return data as Record<string, unknown>;
}

/**
 * Baja Mis Comprobantes (recibidos) vía automatización Afip SDK.
 * ARCA no publica WS oficial para listar recibidos; esto usa Clave Fiscal.
 */
export async function fetchMisComprobantesRecibidos(
  params: MisComprobantesParams,
  opts: { waitMs?: number; pollMs?: number } = {},
) {
  const waitMs = opts.waitMs ?? 110_000;
  const pollMs = opts.pollMs ?? 5_000;

  const created = await afipFetch('v1/automations', {
    method: 'POST',
    body: JSON.stringify({
      automation: 'mis-comprobantes',
      params: {
        cuit: params.cuit,
        username: params.username,
        password: params.password,
        filters: {
          t: 'R',
          fechaEmision: params.fechaEmision,
        },
      },
    }),
  });

  let current = created;
  const started = Date.now();
  while (!isTerminal(String(current.status || '')) && Date.now() - started < waitMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const id = String(current.id || '');
    if (!id) throw new BadRequestException('Afip SDK no devolvió id de automatización.');
    current = await afipFetch(`v1/automations/${id}`);
  }

  if (!isTerminal(String(current.status || ''))) {
    throw new BadRequestException('La sincronización con ARCA tardó demasiado. Probá de nuevo en unos minutos.');
  }
  if (isError(String(current.status || ''))) {
    const err =
      (current as { error?: string; message?: string }).error ||
      (current as { message?: string }).message ||
      'Error en automatización Mis Comprobantes';
    throw new BadRequestException(String(err));
  }

  const data = current.data;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

export function formatAfipDateRange(from: Date, to: Date) {
  const fmt = (d: Date) => {
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };
  return `${fmt(from)} - ${fmt(to)}`;
}
