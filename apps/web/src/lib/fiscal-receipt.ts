/** Util compartido para armar / imprimir / descargar comprobantes (interno o Factura C). */

export type FiscalReceiptLike = {
  id: string;
  createdAt: string | Date;
  total?: unknown;
  discount?: unknown;
  totalFinal?: unknown;
  paymentMethod?: string | null;
  items: Array<{ name: string; qty: number; unitPrice?: unknown; subtotal?: unknown }>;
  business?: {
    name?: string | null;
    cuit?: string | null;
    address?: string | null;
    grossIncomeNumber?: string | null;
    activityStartDate?: string | Date | null;
  };
  ticket?: {
    fantasyName?: string | null;
    legalName?: string | null;
    logoUrl?: string | null;
    template?: string | null;
  };
  fiscalDocument?: {
    kind?: string | null;
    status?: string | null;
    pointOfSale?: number | null;
    receiptNumber?: number | null;
    cae?: string | null;
    caeExpiresAt?: string | Date | null;
    qrPayload?: string | null;
  } | null;
};

function esc(v: unknown) {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
  );
}

function money(v: unknown) {
  return (
    '$' +
    Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

const PAY_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_debito: 'Débito',
  tarjeta_credito: 'Crédito',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  fiado: 'Cuenta corriente',
};

export function paymentMethodLabel(method?: string | null) {
  if (!method) return '—';
  return PAY_LABELS[method] || method;
}

/** HTML del ticket (sin auto-print). */
export async function buildFiscalReceiptHtml(
  receipt: FiscalReceiptLike,
  opts?: { autoPrint?: boolean },
): Promise<string> {
  const doc = receipt.fiscalDocument;
  const fiscal = doc?.kind === 'FACTURA_C' && doc?.status === 'AUTHORIZED';

  let qr = '';
  if (fiscal && doc?.qrPayload) {
    try {
      const QRCode = (await import('qrcode')).default;
      qr = await QRCode.toDataURL(doc.qrPayload, { width: 200, margin: 0 });
    } catch {
      qr = '';
    }
  }

  const t = receipt.ticket || {};
  const template = t.template === 'moderno' ? 'moderno' : 'clasico';
  const fantasy = t.fantasyName || receipt.business?.name || 'Comercio';
  const legalName = t.legalName || receipt.business?.name || fantasy;
  const logoUrl = t.logoUrl;

  const fiscalMeta = [
    receipt.business?.cuit ? `CUIT ${esc(receipt.business.cuit)}` : '',
    receipt.business?.grossIncomeNumber ? `IIBB ${esc(receipt.business.grossIncomeNumber)}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');
  const emisor = [
    esc(legalName),
    fiscalMeta,
    esc(receipt.business?.address),
    receipt.business?.activityStartDate
      ? `Inicio de actividad ${new Date(receipt.business.activityStartDate).toLocaleDateString('es-AR')}`
      : '',
  ]
    .filter(Boolean)
    .join('<br>');

  const rows = (receipt.items || [])
    .map((i) => {
      const unit = Number(i.unitPrice ?? Number(i.subtotal) / Math.max(1, Number(i.qty)));
      return `<tr><td class="q">${esc(i.qty)}</td><td class="n">${esc(i.name)}<span class="u">${esc(i.qty)} × ${money(unit)}</span></td><td class="p">${money(i.subtotal)}</td></tr>`;
    })
    .join('');

  const logo =
    logoUrl && (logoUrl.startsWith('data:') || logoUrl.startsWith('http'))
      ? `<img class="logo" src="${esc(logoUrl)}" alt=""/>`
      : '';

  const docLine = fiscal
    ? `<div class="doc-fiscal"><b>FACTURA C</b><span>Pto. Vta. ${String(doc?.pointOfSale ?? 0).padStart(5, '0')} · Nº ${String(doc?.receiptNumber ?? 0).padStart(8, '0')}</span></div>`
    : `<div class="doc-internal">Comprobante no fiscal — no válido como factura</div>`;

  const fiscalFooter = fiscal
    ? `<div class="sep"></div><div class="cae">CAE ${esc(doc?.cae)} · Vto. ${doc?.caeExpiresAt ? new Date(doc.caeExpiresAt).toLocaleDateString('es-AR') : '—'}</div>${qr ? `<img class="qr" src="${qr}" alt=""/>` : ''}`
    : '';

  const discount =
    Number(receipt.discount) > 0
      ? `<div class="line"><span>Descuento</span><span>-${money(receipt.discount)}</span></div>`
      : '';

  const css = `
    @page{size:58mm auto;margin:0}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{background:#fff}
    body{width:54mm;margin:0 auto;color:#000;font-size:11px;line-height:1.3;padding:3mm 2mm 6mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:${template === 'moderno' ? "'Helvetica Neue',Arial,sans-serif" : "'Courier New',ui-monospace,monospace"}}
    .logo{display:block;margin:0 auto 2mm;max-width:30mm;max-height:18mm;filter:grayscale(1) contrast(1.15)}
    .fantasy{text-align:center;font-weight:800;font-size:16px;letter-spacing:.5px;line-height:1.1;text-transform:uppercase}
    .emisor{text-align:center;font-size:7.5px;color:#444;line-height:1.25;margin:1.5mm 1mm 0;font-family:'Helvetica Neue',Arial,sans-serif}
    .sep{border-top:1px ${template === 'moderno' ? 'solid #000' : 'dashed #000'};margin:2mm 0}
    .doc-internal{text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}
    .doc-fiscal{text-align:center}
    .doc-fiscal b{display:block;font-size:15px;font-weight:800;letter-spacing:1px}
    .doc-fiscal span{font-size:9.5px}
    .meta{text-align:center;font-size:9px;color:#333;margin-top:1mm}
    table{width:100%;border-collapse:collapse}
    td{vertical-align:top;padding:.6mm 0}
    td.q{width:6mm;font-weight:700}
    td.n{padding:.6mm 1.5mm}
    td.n .u{display:block;font-size:8px;color:#555}
    td.p{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .line{display:flex;justify-content:space-between;font-size:10px;margin:.5mm 0}
    .total{display:flex;justify-content:space-between;align-items:baseline;font-weight:800;font-size:15px;margin:1mm 0}
    .total .amt{font-variant-numeric:tabular-nums}
    .pay{text-align:center;font-size:10px;margin-top:1mm}
    .cae{text-align:center;font-size:8px;color:#333;line-height:1.3}
    .qr{display:block;width:26mm;height:26mm;margin:1.5mm auto 0}
    .thanks{text-align:center;font-size:10.5px;margin-top:3mm;font-weight:600}
  `;

  const autoPrintScript = opts?.autoPrint
    ? `<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Comprobante</title><style>${css}</style></head><body>${logo}<div class="fantasy">${esc(fantasy)}</div>${emisor ? `<div class="emisor">${emisor}</div>` : ''}<div class="sep"></div>${docLine}<div class="meta">${new Date(receipt.createdAt).toLocaleString('es-AR')}</div><div class="sep"></div><table>${rows}</table><div class="sep"></div>${discount}<div class="total"><span>TOTAL</span><span class="amt">${money(receipt.totalFinal)}</span></div><div class="pay">Pago: ${esc(paymentMethodLabel(receipt.paymentMethod))}</div>${fiscalFooter}<div class="thanks">¡Gracias por su compra!</div>${autoPrintScript}</body></html>`;
}

export async function printFiscalReceipt(
  receipt: FiscalReceiptLike,
  existingPopup?: Window | null,
) {
  const popup = existingPopup || window.open('', '_blank', 'width=380,height=720');
  if (!popup) {
    alert('El navegador bloqueó la ventana de impresión.');
    return;
  }
  const html = await buildFiscalReceiptHtml(receipt, { autoPrint: true });
  popup.document.write(html);
  popup.document.close();
}

export async function downloadFiscalReceipt(receipt: FiscalReceiptLike) {
  const html = await buildFiscalReceiptHtml(receipt, { autoPrint: false });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const doc = receipt.fiscalDocument;
  const fiscal = doc?.kind === 'FACTURA_C' && doc?.status === 'AUTHORIZED';
  const label = fiscal
    ? `factura-c-${doc?.pointOfSale ?? 0}-${doc?.receiptNumber ?? receipt.id.slice(0, 8)}`
    : `comprobante-${receipt.id.slice(0, 8)}`;
  a.href = url;
  a.download = `${label}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
