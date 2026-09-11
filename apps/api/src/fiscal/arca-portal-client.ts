import { BadRequestException } from '@nestjs/common';
import type { Browser, Page } from 'puppeteer-core';

const AUTH_URL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';
const PORTAL_HOME = 'https://portalcf.cloud.afip.gob.ar/portal/app/';
const MCMP_HOSTS = [
  'https://fes.afip.gob.ar',
  'https://serviciosjava2.afip.gob.ar',
  'https://serviciosjava.afip.gob.ar',
] as const;

/** Índices del array de listaResultados (portal Mis Comprobantes). */
const IDX = {
  fecha: 0,
  tipo: 1,
  puntoVenta: 3,
  numeroDesde: 4,
  numeroHasta: 5,
  codAutorizacion: 8,
  tipoDocEmisor: 10,
  nroDocEmisor: 11,
  denominacionEmisor: 12,
  tipoCambio: 13,
  moneda: 14,
  netoGravado: 15,
  netoNoGravado: 17,
  exentas: 19,
  iva: 21,
  total: 23,
} as const;

export type ArcaPortalParams = {
  cuit: string;
  username: string;
  password: string;
  from: Date;
  to: Date;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fmtAr(d: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function chunkRanges(from: Date, to: Date, days = 30): Array<{ from: Date; to: Date }> {
  const out: Array<{ from: Date; to: Date }> = [];
  let cur = new Date(from.getTime());
  const endLimit = new Date(to.getTime());
  while (cur <= endLimit) {
    const end = new Date(cur.getTime());
    end.setUTCDate(end.getUTCDate() + days - 1);
    if (end > endLimit) end.setTime(endLimit.getTime());
    out.push({ from: new Date(cur.getTime()), to: new Date(end.getTime()) });
    cur = new Date(end.getTime());
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function resolveExport<T = any>(mod: any): T {
  let current = mod;
  for (let i = 0; i < 4; i += 1) {
    if (!current || typeof current !== 'object') break;
    const hasArgs = Array.isArray(current.args);
    const hasLaunch = typeof current.launch === 'function';
    const hasExec = typeof current.executablePath === 'function';
    if (hasArgs || hasLaunch || hasExec) return current as T;
    if (current.default) {
      current = current.default;
      continue;
    }
    break;
  }
  return current as T;
}

async function launchBrowser(): Promise<Browser> {
  const puppeteerMod = await import('puppeteer-core');
  const puppeteer = resolveExport<typeof import('puppeteer-core')>(puppeteerMod);
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    // En Nest/Vercel el import() dinámico a veces deja .default undefined.
    // Preferimos require CJS y unwrapping de defaults anidados.
    let chromium: { args?: string[]; executablePath?: () => Promise<string> };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      chromium = resolveExport(require('@sparticuz/chromium'));
    } catch {
      chromium = resolveExport(await import('@sparticuz/chromium'));
    }
    if (!Array.isArray(chromium.args) || typeof chromium.executablePath !== 'function') {
      throw new BadRequestException(
        'Chromium serverless no cargó bien en este deploy. Redeployá la API o importá el CSV de Mis Comprobantes → Recibidos.',
      );
    }
    return puppeteer.launch({
      args: [...chromium.args, '--disable-dev-shm-usage'],
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_PATH ||
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/usr/bin/google-chrome');

  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 800 },
    executablePath,
    headless: true,
  });
}

async function fillFirst(page: Page, selectors: string[], value: string) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const visible = await el.isIntersectingViewport().catch(() => true);
      if (!visible) continue;
      await el.click({ clickCount: 3 }).catch(() => undefined);
      await el.type(value, { delay: 15 });
      return true;
    } catch {
      /* next */
    }
  }
  return false;
}

async function clickByText(page: Page, labels: string[]) {
  return page.evaluate((labs) => {
    const nodes = Array.from(
      document.querySelectorAll('button, input[type="submit"], input[type="button"], a'),
    );
    for (const node of nodes) {
      const text = ((node as HTMLInputElement).value || node.textContent || '').trim().toLowerCase();
      if (labs.some((l) => text.includes(l.toLowerCase()))) {
        (node as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, labels);
}

async function loginClaveFiscal(page: Page, cuit: string, password: string) {
  await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await sleep(800);

  const filledUser = await fillFirst(
    page,
    ['input[name="F1:username"]', '#F1\\:username', 'input[id*="username"]', 'input[type="text"]'],
    cuit,
  );
  if (!filledUser) {
    throw new BadRequestException('No encontré el campo CUIT en el login de ARCA.');
  }

  await clickByText(page, ['siguiente']);
  await sleep(1200);

  const filledPass = await fillFirst(
    page,
    ['input[name="F1:password"]', '#F1\\:password', 'input[type="password"]'],
    password,
  );
  if (!filledPass) {
    throw new BadRequestException('No encontré el campo contraseña en el login de ARCA.');
  }

  await clickByText(page, ['ingresar']);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const url = page.url().toLowerCase();
    const content = await page
      .content()
      .then((c) => c.toLowerCase())
      .catch(() => '');

    if (content.includes('captcha') || content.includes('recaptcha')) {
      throw new BadRequestException(
        'ARCA pidió CAPTCHA. Probá de nuevo en unos minutos o importá el CSV de Mis Comprobantes → Recibidos.',
      );
    }
    if (
      content.includes('doble factor') ||
      content.includes('segundo factor') ||
      (content.includes('token') && content.includes('seguridad'))
    ) {
      throw new BadRequestException(
        'ARCA pidió doble factor. Desactivá el 2FA para este CUIT o importá el CSV manualmente.',
      );
    }
    if (
      !url.includes('login') &&
      (url.includes('portalcf') ||
        url.includes('contribuyente') ||
        url.includes('fes.afip') ||
        content.includes('mis comprobantes'))
    ) {
      return;
    }
    await sleep(1500);
  }
  throw new BadRequestException('Timeout esperando el login de Clave Fiscal en ARCA.');
}

async function openMisComprobantes(browser: Browser, page: Page): Promise<Page> {
  await page.goto(PORTAL_HOME, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await sleep(2000);

  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    for (const input of inputs) {
      const ph = (input.getAttribute('placeholder') || '').toLowerCase();
      const type = (input.getAttribute('type') || '').toLowerCase();
      if (ph.includes('busc') || type === 'search' || input.id.toLowerCase().includes('busc')) {
        input.value = 'Mis Comprobantes';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }
  });
  await sleep(800);

  const before = await browser.pages();
  const beforeUrls = new Set(before.map((p) => p.url()));

  await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('a, button, div, span'));
    for (const n of nodes) {
      const t = (n.textContent || '').trim().toLowerCase();
      const title = (n.getAttribute('title') || '').toLowerCase();
      if (t === 'mis comprobantes' || title.includes('mis comprobantes') || t.includes('mis comprobantes')) {
        (n as HTMLElement).click();
        return;
      }
    }
  });
  await sleep(3500);

  const after = await browser.pages();
  for (const p of after) {
    if (!beforeUrls.has(p.url()) && /mcmp|fes\.afip|comprobantes|serviciosjava/i.test(p.url())) {
      await p.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);
      return p;
    }
  }
  for (const p of after) {
    if (/mcmp|fes\.afip|comprobantes|serviciosjava/i.test(p.url())) return p;
  }

  for (const host of MCMP_HOSTS) {
    try {
      await page.goto(`${host}/mcmp/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      if (!page.url().toLowerCase().includes('login')) return page;
    } catch {
      /* next */
    }
  }
  return page;
}

function resolveAjaxBase(pageUrl: string) {
  for (const host of MCMP_HOSTS) {
    if (pageUrl.includes(host.replace('https://', ''))) return `${host}/mcmp/jsp/ajax.do`;
  }
  return `${MCMP_HOSTS[0]}/mcmp/jsp/ajax.do`;
}

async function pageJson(page: Page, url: string): Promise<unknown> {
  const raw = await page.evaluate(async (u) => {
    const res = await fetch(u, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  }, url);

  if (!raw.ok) {
    throw new BadRequestException(`ARCA ajax HTTP ${raw.status}: ${String(raw.text).slice(0, 200)}`);
  }
  try {
    return JSON.parse(raw.text);
  } catch {
    const m = String(raw.text).match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!m) throw new BadRequestException(`Respuesta ARCA no JSON: ${String(raw.text).slice(0, 200)}`);
    return JSON.parse(m[1]);
  }
}

function cell(row: unknown, idx: number): string {
  if (Array.isArray(row) && idx < row.length && row[idx] != null) return String(row[idx]).trim();
  return '';
}

function formatFecha(val: string): string {
  const s = (val || '').trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}

function rowToNamed(row: unknown): Record<string, unknown> {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    return row as Record<string, unknown>;
  }
  return {
    'Fecha de Emisión': formatFecha(cell(row, IDX.fecha)),
    'Tipo de Comprobante': cell(row, IDX.tipo),
    'Punto de Venta': cell(row, IDX.puntoVenta),
    'Número Desde': cell(row, IDX.numeroDesde),
    'Número Hasta': cell(row, IDX.numeroHasta) || cell(row, IDX.numeroDesde),
    'Cód. Autorización': cell(row, IDX.codAutorizacion),
    'Tipo Doc. Emisor': cell(row, IDX.tipoDocEmisor) || '80',
    'Nro. Doc. Emisor': cell(row, IDX.nroDocEmisor),
    'Denominación Emisor': cell(row, IDX.denominacionEmisor),
    'Tipo Cambio': cell(row, IDX.tipoCambio) || '1',
    Moneda: cell(row, IDX.moneda) || 'PES',
    'Imp. Neto Gravado': cell(row, IDX.netoGravado) || '0',
    'Imp. Neto No Gravado': cell(row, IDX.netoNoGravado) || '0',
    'Imp. Op. Exentas': cell(row, IDX.exentas) || '0',
    'Otros Tributos': '0',
    IVA: cell(row, IDX.iva) || '0',
    'Imp. Total': cell(row, IDX.total),
  };
}

async function fetchRecibidosChunk(page: Page, ajaxBase: string, cuit: string, from: Date, to: Date) {
  const fecha = `${fmtAr(from)} - ${fmtAr(to)}`;
  const url =
    `${ajaxBase}?f=generarConsulta` +
    `&t=R` +
    `&fechaEmision=${encodeURIComponent(fecha)}` +
    `&tiposComprobantes=` +
    `&cuitConsultada=${encodeURIComponent(cuit)}`;

  const gen = (await pageJson(page, url)) as Record<string, unknown>;
  if (gen?.estado && String(gen.estado).toLowerCase() !== 'ok') {
    throw new BadRequestException(
      `generarConsulta: ${String(gen.mensajeError || JSON.stringify(gen).slice(0, 200))}`,
    );
  }

  let consultaId: unknown;
  const datos = gen?.datos;
  if (datos && typeof datos === 'object') {
    consultaId = (datos as Record<string, unknown>).idConsulta || (datos as Record<string, unknown>).id;
  }
  if (!consultaId) consultaId = gen?.idConsulta || gen?.id;
  const data = gen?.data;
  if (!consultaId && data && typeof data === 'object') {
    consultaId = (data as Record<string, unknown>).idConsulta || (data as Record<string, unknown>).id;
  }
  if (!consultaId) {
    throw new BadRequestException(`No pude obtener idConsulta de ARCA: ${JSON.stringify(gen).slice(0, 300)}`);
  }

  await sleep(1200);
  const listing = (await pageJson(
    page,
    `${ajaxBase}?f=listaResultados&id=${encodeURIComponent(String(consultaId))}`,
  )) as unknown[] | Record<string, unknown>;

  let rows: unknown[] = [];
  if (Array.isArray(listing)) {
    rows = listing;
  } else if (listing && typeof listing === 'object') {
    if (listing.estado && String(listing.estado).toLowerCase() !== 'ok') {
      throw new BadRequestException(
        `listaResultados: ${String(listing.mensajeError || JSON.stringify(listing).slice(0, 200))}`,
      );
    }
    const d = listing.datos;
    if (d && typeof d === 'object' && Array.isArray((d as { data?: unknown }).data)) {
      rows = (d as { data: unknown[] }).data;
    } else if (Array.isArray(d)) {
      rows = d;
    } else {
      for (const key of ['data', 'resultado', 'comprobantes', 'rows', 'lista']) {
        const val = listing[key];
        if (Array.isArray(val)) {
          rows = val;
          break;
        }
        if (val && typeof val === 'object' && Array.isArray((val as { data?: unknown }).data)) {
          rows = (val as { data: unknown[] }).data;
          break;
        }
      }
    }
  }
  return rows.map(rowToNamed);
}

/**
 * Baja Mis Comprobantes → Recibidos entrando al portal ARCA con Clave Fiscal.
 * Mismo enfoque que Afip SDK (automatización del portal), pero propio, sin token pago.
 */
export async function fetchMisComprobantesRecibidosPortal(params: ArcaPortalParams) {
  const cuit = params.cuit.replace(/\D/g, '');
  const username = (params.username || cuit).replace(/\D/g, '');
  if (!cuit || !params.password?.trim()) {
    throw new BadRequestException('Faltan CUIT o Clave Fiscal para sincronizar con ARCA.');
  }

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    );

    await loginClaveFiscal(page, username, params.password);
    const mcmp = await openMisComprobantes(browser, page);
    const ajaxBase = resolveAjaxBase(mcmp.url());

    const all: Record<string, unknown>[] = [];
    for (const range of chunkRanges(params.from, params.to, 30)) {
      const chunk = await fetchRecibidosChunk(mcmp, ajaxBase, cuit, range.from, range.to);
      all.push(...chunk);
    }

    const seen = new Set<string>();
    const unique: Record<string, unknown>[] = [];
    for (const row of all) {
      const key = [
        row['Cód. Autorización'],
        row['Punto de Venta'],
        row['Número Desde'],
        row['Nro. Doc. Emisor'],
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }
    return unique;
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new BadRequestException(
      `No se pudo sincronizar con el portal ARCA: ${msg}. Si persiste, importá el CSV de Mis Comprobantes → Recibidos.`,
    );
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export function formatPortalDateRange(from: Date, to: Date) {
  return `${fmtAr(from)} - ${fmtAr(to)}`;
}
