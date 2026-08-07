'use client';
import QRCode from 'qrcode';
import { api } from '@/lib/api';

export async function printFiscalReceipt(receipt: any, existingPopup?: Window | null) {
  const popup = existingPopup || window.open('', '_blank', 'width=380,height=720');
  if (!popup) { alert('El navegador bloqueó la ventana de impresión.'); return; }

  const doc = receipt.fiscalDocument;
  const fiscal = doc?.kind === 'FACTURA_C' && doc?.status === 'AUTHORIZED';
  const qr = fiscal && doc?.qrPayload ? await QRCode.toDataURL(doc.qrPayload, { width: 200, margin: 0 }) : '';

  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  const money = (v: unknown) => '$' + Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const t = receipt.ticket || {};
  const template = t.template === 'moderno' ? 'moderno' : 'clasico';
  const fantasy = t.fantasyName || receipt.business?.name || 'Comercio';
  const legalName = t.legalName || receipt.business?.name || fantasy;
  const logoUrl = t.logoUrl;

  // Emisor: compacto y discreto (informativo / legal), NO protagonista.
  // Se organiza en líneas prolijas y solo se muestran los campos cargados.
  const fiscalMeta = [
    receipt.business?.cuit ? `CUIT ${esc(receipt.business.cuit)}` : '',
    receipt.business?.grossIncomeNumber ? `IIBB ${esc(receipt.business.grossIncomeNumber)}` : '',
  ].filter(Boolean).join('  ·  ');
  const emisor = [
    esc(legalName),
    fiscalMeta,
    esc(receipt.business?.address),
    receipt.business?.activityStartDate ? `Inicio de actividad ${new Date(receipt.business.activityStartDate).toLocaleDateString('es-AR')}` : '',
  ].filter(Boolean).join('<br>');

  const rows = receipt.items.map((i: any) => {
    const unit = Number(i.unitPrice ?? (Number(i.subtotal) / Math.max(1, Number(i.qty))));
    return `<tr><td class="q">${esc(i.qty)}</td><td class="n">${esc(i.name)}<span class="u">${esc(i.qty)} × ${money(unit)}</span></td><td class="p">${money(i.subtotal)}</td></tr>`;
  }).join('');

  const logo = logoUrl && (logoUrl.startsWith('data:') || logoUrl.startsWith('http'))
    ? `<img class="logo" src="${esc(logoUrl)}" alt=""/>` : '';

  const docLine = fiscal
    ? `<div class="doc-fiscal"><b>FACTURA C</b><span>Pto. Vta. ${String(doc.pointOfSale).padStart(5, '0')} · Nº ${String(doc.receiptNumber).padStart(8, '0')}</span></div>`
    : `<div class="doc-internal">Comprobante no fiscal — no válido como factura</div>`;

  const fiscalFooter = fiscal
    ? `<div class="sep"></div><div class="cae">CAE ${esc(doc.cae)} · Vto. ${new Date(doc.caeExpiresAt).toLocaleDateString('es-AR')}</div>${qr ? `<img class="qr" src="${qr}" alt=""/>` : ''}`
    : '';

  const discount = Number(receipt.discount) > 0
    ? `<div class="line"><span>Descuento</span><span>-${money(receipt.discount)}</span></div>` : '';

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

  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style>${css}</style></head><body>${logo}<div class="fantasy">${esc(fantasy)}</div>${emisor ? `<div class="emisor">${emisor}</div>` : ''}<div class="sep"></div>${docLine}<div class="meta">${new Date(receipt.createdAt).toLocaleString('es-AR')}</div><div class="sep"></div><table>${rows}</table><div class="sep"></div>${discount}<div class="total"><span>TOTAL</span><span class="amt">${money(receipt.totalFinal)}</span></div><div class="pay">Pago: ${esc(receipt.paymentMethod)}</div>${fiscalFooter}<div class="thanks">¡Gracias por su compra!</div><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
  popup.document.close();
}

export function FiscalReceiptModal({ receipt, onClose, onRefresh }: { receipt: any; onClose: () => void; onRefresh: (r: any) => void }) {
  const doc = receipt.fiscalDocument;
  const retry = async () => { await api(`/fiscal/sales/${receipt.id}/retry`, { method: 'POST' }); onRefresh(await api(`/fiscal/sales/${receipt.id}/receipt`)); };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70]">
      <div className="bg-surface border border-hair rounded-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-fg mb-2">Venta registrada</h2>
        {doc?.kind === 'INTERNAL' ? (
          <div className="rounded-lg border border-hair bg-raised p-4 mb-4"><p className="font-bold text-fg">Comprobante interno</p><p className="text-sm text-warn">No válido como factura</p></div>
        ) : doc?.status === 'AUTHORIZED' ? (
          <div className="rounded-lg border border-[color:var(--ok)] bg-ok-soft p-4 mb-4"><p className="font-bold text-ok">Factura C autorizada</p><p className="text-sm text-fg-muted">Nº {String(doc.pointOfSale).padStart(5, '0')}-{String(doc.receiptNumber).padStart(8, '0')} · CAE {doc.cae}</p></div>
        ) : (
          <div className="rounded-lg border border-[color:var(--crit)] bg-crit-soft p-4 mb-4"><p className="font-bold text-crit">La venta se guardó, pero ARCA no autorizó</p><p className="text-sm text-crit mt-1">{doc?.errorMessage}</p><button onClick={() => void retry()} className="mt-3 px-3 py-2 rounded bg-crit text-white text-sm">Reintentar ARCA</button></div>
        )}
        <p className="text-2xl font-bold text-right text-fg mb-4">Total {'$'}{Number(receipt.totalFinal).toFixed(2)}</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { onClose(); void printFiscalReceipt(receipt); }} className="py-3 rounded-lg btn-brand font-bold">Imprimir</button>
          <button onClick={onClose} className="py-3 rounded-lg bg-raised2 border border-hair text-fg font-bold">No imprimir</button>
        </div>
      </div>
    </div>
  );
}
