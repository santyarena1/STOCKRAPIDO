'use client';

import { useEffect, useMemo, useState } from 'react';
import { barcodeSvg } from '@/lib/barcode-svg';

export type LabelItem = {
  id?: string;
  name: string;
  barcode: string;
  sku?: string;
  category?: string;
  price?: number;
};

export type LabelFields = {
  name: boolean;
  sku: boolean;
  category: boolean;
  barcode: boolean;
  barcodeText: boolean;
  price: boolean;
};

const DEFAULT_FIELDS: LabelFields = {
  name: true,
  sku: true,
  category: true,
  barcode: true,
  barcodeText: true,
  price: false,
};

const STORAGE_KEY = 'sr-label-fields';

function loadFields(): LabelFields {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<LabelFields> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_FIELDS;
    return { ...DEFAULT_FIELDS, ...raw };
  } catch {
    return DEFAULT_FIELDS;
  }
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);
}

function labelHtml(item: LabelItem, fields: LabelFields) {
  const bits: string[] = [];
  if (fields.name && item.name) bits.push(`<p class="name">${escapeHtml(item.name)}</p>`);
  if (fields.sku && item.sku) bits.push(`<p class="meta">SKU ${escapeHtml(item.sku)}</p>`);
  if (fields.category && item.category) bits.push(`<p class="meta">${escapeHtml(item.category)}</p>`);
  if (fields.barcode && item.barcode) bits.push(`<div class="bars">${barcodeSvg(item.barcode, 1.05, 28)}</div>`);
  if (fields.barcodeText && item.barcode) bits.push(`<p class="code">${escapeHtml(item.barcode)}</p>`);
  if (fields.price && item.price != null && Number.isFinite(item.price)) bits.push(`<p class="price">${formatPrice(item.price)}</p>`);
  if (!item.barcode) bits.push('<p class="meta">Sin código</p>');
  return `<article class="label">${bits.join('')}</article>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function LabelPrintDialog({
  items,
  onClose,
}: {
  items: LabelItem[];
  onClose: () => void;
}) {
  const [fields, setFields] = useState<LabelFields>(DEFAULT_FIELDS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFields(loadFields());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
  }, [fields, ready]);

  const preview = useMemo(() => items.slice(0, 6), [items]);

  const print = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
  .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3.5mm; }
  .label {
    width: 62mm; min-height: 28mm; max-height: 32mm;
    border: 0.4pt dashed #bbb; padding: 2mm 2.2mm;
    display: flex; flex-direction: column; justify-content: center;
    break-inside: avoid; page-break-inside: avoid;
  }
  .name { font-size: 9.5pt; font-weight: 700; line-height: 1.15; margin: 0 0 1mm; }
  .meta { font-size: 7.5pt; margin: 0; color: #333; }
  .bars { margin: 1.2mm 0 0.4mm; overflow: hidden; }
  .bars svg { display: block; max-width: 100%; height: 26px; }
  .code { font-size: 8pt; font-family: ui-monospace, monospace; letter-spacing: 0.04em; margin: 0; }
  .price { font-size: 9pt; font-weight: 700; margin: 1mm 0 0; }
</style></head><body><div class="sheet">${items.map((item) => labelHtml(item, fields)).join('')}</div></body></html>`;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      alert('No se pudo armar la impresión. Probá de nuevo.');
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const frameWindow = iframe.contentWindow;
    const cleanup = () => {
      iframe.remove();
    };
    frameWindow?.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      frameWindow?.focus();
      frameWindow?.print();
      setTimeout(cleanup, 1500);
    }, 250);
  };

  const toggle = (key: keyof LabelFields) => setFields((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-hair bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-fg">Imprimir etiquetas</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {items.length} etiqueta{items.length === 1 ? '' : 's'} chicas en hoja A4. Marcá qué datos van.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-fg-muted hover:text-fg">Cerrar</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ['name', 'Nombre'],
            ['sku', 'SKU'],
            ['category', 'Categoría'],
            ['barcode', 'Código de barras (dibujo)'],
            ['barcodeText', 'Números del código'],
            ['price', 'Precio'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-hair-soft bg-raised px-3 py-2 text-sm">
              <input type="checkbox" checked={fields[key]} onChange={() => toggle(key)} />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {preview.map((item, i) => (
            <div
              key={item.id || `${item.barcode}-${i}`}
              className="rounded-lg border border-dashed border-hair bg-white p-3 text-black"
              dangerouslySetInnerHTML={{ __html: labelHtml(item, fields) }}
            />
          ))}
        </div>
        {items.length > preview.length ? (
          <p className="mt-2 text-xs text-fg-faint">Vista previa de {preview.length}. Al imprimir salen todas.</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-hair px-4 py-2.5 text-sm text-fg-muted">Cancelar</button>
          <button type="button" onClick={print} className="btn-brand rounded-xl px-5 py-2.5 text-sm font-semibold">
            Imprimir A4
          </button>
        </div>
      </div>
    </div>
  );
}
