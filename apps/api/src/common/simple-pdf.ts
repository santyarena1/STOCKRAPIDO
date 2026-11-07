/**
 * Generador mínimo de PDF (texto con Helvetica / WinAnsi).
 * Suficiente para listados simples sin depender de Chromium.
 */

const PAGE_W = 595; // A4
const PAGE_H = 842;
const MARGIN_X = 40;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 40;
const LINE_H = 14;
const NAME_MAX_W = 380;
const PRICE_X = 480;

/** Mapa Unicode → WinAnsi (caracteres frecuentes en ES). */
const WINANSI: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function toWinAnsiBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) {
      out.push(code);
      continue;
    }
    if (code >= 0xa0 && code <= 0xff) {
      out.push(code);
      continue;
    }
    const mapped = WINANSI[code];
    if (mapped != null) {
      out.push(mapped);
      continue;
    }
    const folded = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (folded.length === 1) {
      const c = folded.charCodeAt(0);
      if (c >= 0x20 && c <= 0x7e) {
        out.push(c);
        continue;
      }
    }
    out.push(0x3f);
  }
  return out;
}

function pdfString(text: string): string {
  const bytes = toWinAnsiBytes(text);
  let s = '(';
  for (const b of bytes) {
    if (b === 0x5c || b === 0x28 || b === 0x29) {
      s += `\\${String.fromCharCode(b)}`;
    } else if (b < 0x20 || b > 0x7e) {
      s += `\\${b.toString(8).padStart(3, '0')}`;
    } else {
      s += String.fromCharCode(b);
    }
  }
  return `${s})`;
}

function approxWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.5;
}

function truncateToWidth(text: string, fontSize: number, maxW: number): string {
  if (approxWidth(text, fontSize) <= maxW) return text;
  let t = text;
  while (t.length > 1 && approxWidth(`${t}…`, fontSize) > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

export type PriceListPdfItem = { name: string; priceLabel: string };

function buildPageContent(
  items: PriceListPdfItem[],
  startIdx: number,
  opts: { title: string; subtitle?: string; isFirstPage: boolean },
): { content: string; nextIdx: number } {
  let y = PAGE_H - MARGIN_TOP;
  let content = '';
  const textAt = (font: '/F1' | '/F2', size: number, x: number, text: string) => {
    content += `BT ${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td ${pdfString(text)} Tj ET\n`;
  };

  if (opts.isFirstPage) {
    textAt('/F2', 16, MARGIN_X, opts.title);
    y -= 18;
    if (opts.subtitle) {
      textAt('/F1', 9, MARGIN_X, opts.subtitle);
      y -= 14;
    }
  } else {
    textAt('/F1', 9, MARGIN_X, `${opts.title} — continúa`);
    y -= 16;
  }

  textAt('/F2', 10, MARGIN_X, 'Producto');
  content += `BT /F2 10 Tf ${PRICE_X.toFixed(1)} ${y.toFixed(1)} Td ${pdfString('Precio')} Tj ET\n`;
  y -= 6;
  content += `${MARGIN_X} ${y.toFixed(1)} m ${(PAGE_W - MARGIN_X).toFixed(1)} ${y.toFixed(1)} l S\n`;
  y -= LINE_H;

  let i = startIdx;
  if (items.length === 0 && opts.isFirstPage) {
    textAt('/F1', 10, MARGIN_X, 'No hay productos activos.');
    return { content, nextIdx: 0 };
  }

  while (i < items.length && y - LINE_H >= MARGIN_BOTTOM) {
    const item = items[i];
    const name = truncateToWidth(item.name || '—', 10, NAME_MAX_W);
    textAt('/F1', 10, MARGIN_X, name);
    content += `BT /F1 10 Tf ${PRICE_X.toFixed(1)} ${y.toFixed(1)} Td ${pdfString(item.priceLabel)} Tj ET\n`;
    y -= LINE_H;
    i += 1;
  }

  return { content, nextIdx: i };
}

export function buildPriceListPdf(opts: {
  title: string;
  subtitle?: string;
  items: PriceListPdfItem[];
}): Buffer {
  const pages: string[] = [];
  let idx = 0;
  let first = true;
  do {
    const { content, nextIdx } = buildPageContent(opts.items, idx, {
      title: opts.title,
      subtitle: opts.subtitle,
      isFirstPage: first,
    });
    pages.push(content);
    idx = nextIdx;
    first = false;
    if (opts.items.length === 0) break;
  } while (idx < opts.items.length);

  const encoder = (s: string) => Buffer.from(s, 'latin1');
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let size = 0;

  const add = (chunk: string) => {
    const buf = encoder(chunk);
    parts.push(buf);
    size += buf.length;
  };

  const addObj = (id: number, body: string) => {
    offsets[id] = size;
    add(`${id} 0 obj\n${body}\nendobj\n`);
  };

  add('%PDF-1.4\n');

  const fontRegularId = 3;
  const fontBoldId = 4;
  const firstContentId = 5;
  const pageIds = pages.map((_, i) => firstContentId + pages.length + i);
  const contentIds = pages.map((_, i) => firstContentId + i);

  addObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObj(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  addObj(
    fontRegularId,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  addObj(
    fontBoldId,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  for (let i = 0; i < pages.length; i++) {
    const stream = pages[i];
    const streamBuf = encoder(stream);
    addObj(
      contentIds[i],
      `<< /Length ${streamBuf.length} >>\nstream\n${stream}endstream`,
    );
  }

  for (let i = 0; i < pages.length; i++) {
    addObj(
      pageIds[i],
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> >>`,
    );
  }

  const xrefStart = size;
  const maxId = pageIds[pageIds.length - 1] ?? fontBoldId;
  add(`xref\n0 ${maxId + 1}\n`);
  add('0000000000 65535 f \n');
  for (let id = 1; id <= maxId; id++) {
    const off = offsets[id] ?? 0;
    add(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  add(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.concat(parts);
}
