'use client';
import QRCode from 'qrcode';
import { api } from '@/lib/api';

export async function printFiscalReceipt(receipt:any, existingPopup?: Window | null) {
  const popup = existingPopup || window.open('', '_blank', 'width=420,height=720');
  if (!popup) { alert('El navegador bloqueó la ventana de impresión.'); return; }
  const doc = receipt.fiscalDocument;
  const qr = doc?.qrPayload ? await QRCode.toDataURL(doc.qrPayload, { width: 220, margin: 1 }) : '';
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
  const fiscal = doc?.kind === 'FACTURA_C' && doc?.status === 'AUTHORIZED';
  const template = receipt.ticket?.template === 'moderno' ? 'moderno' : 'clasico';
  const fantasyName = receipt.ticket?.fantasyName || receipt.business?.name || 'Comercio';
  const legalName = receipt.ticket?.legalName || receipt.business?.name || fantasyName;
  const logoUrl = receipt.ticket?.logoUrl;
  const rows = receipt.items.map((item: any) => template === 'moderno'
    ? `<tr><td class="qty">${esc(item.qty)}</td><td class="detail">${esc(item.name)}</td><td class="amount">$${Number(item.subtotal).toFixed(2)}</td></tr>`
    : `<tr><td colspan="2">${esc(item.qty)} x ${esc(item.name)}</td><td class="amount">$${Number(item.subtotal).toFixed(2)}</td></tr>`
  ).join('');
  const logo = logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt=""/>` : '';
  const legalDetails = [
    legalName,
    receipt.business?.cuit ? `CUIT ${receipt.business.cuit}` : '',
    receipt.business?.address,
    receipt.business?.grossIncomeNumber ? `IIBB ${receipt.business.grossIncomeNumber}` : '',
    receipt.business?.activityStartDate
      ? `Inicio de actividad ${new Date(receipt.business.activityStartDate).toLocaleDateString('es-AR')}`
      : '',
  ].filter(Boolean).map(esc).join('<br>');
  const header = `<header class="ticket-header">${logo}<div class="fantasy">${esc(fantasyName)}</div><div class="legal">${legalDetails}</div></header>`;
  const fiscalBlock = fiscal
    ? `<h1>FACTURA C</h1><p>PV ${String(doc.pointOfSale).padStart(5, '0')} · Nº ${String(doc.receiptNumber).padStart(8, '0')}</p>`
    : '<p class="internal">COMPROBANTE INTERNO<br>NO VÁLIDO COMO FACTURA</p>';
  const fiscalFooter = fiscal
    ? `<p>CAE: ${esc(doc.cae)}</p><p>Vto. CAE: ${new Date(doc.caeExpiresAt).toLocaleDateString('es-AR')}</p><div class="qr-frame"><img class="qr" src="${qr}" alt="QR ARCA"/></div>`
    : '';
  popup.document.write(`<!doctype html><html><head><title>Comprobante</title><style>
    @page{size:58mm auto;margin:2mm}*{box-sizing:border-box}body{width:54mm;margin:0;color:#000;font-size:11px}body.clasico{font-family:monospace}body.moderno{font-family:Arial,Helvetica,sans-serif}h1,h2,p{text-align:center;margin:4px 0}.ticket-header{text-align:center}.logo{display:block;max-width:42mm;max-height:28mm;width:auto;height:auto;object-fit:contain;margin:0 auto 3mm}.fantasy{font-size:21px;font-weight:900;line-height:1.05;margin:2px 0 5px}.legal{font-size:8px;font-weight:400;line-height:1.2;color:#444;margin:0 auto;max-width:49mm}.line{border-top:1px dashed #000;margin:6px 0}.internal{font-size:15px;font-weight:bold;border:2px solid #000;padding:6px}table{width:100%;border-collapse:collapse}td{padding:3px 0;border-bottom:1px dashed #777}.qty{width:9mm;text-align:center}.detail{text-align:left}.amount{width:17mm;text-align:right;white-space:nowrap}.total{font-size:15px;font-weight:bold;text-align:right;margin:8px 0}.qr{display:block;width:36mm;height:36mm;margin:auto}.qr-frame{width:max-content;margin:5px auto}.moderno .logo{max-width:44mm;max-height:32mm;margin-bottom:4mm}.moderno .fantasy{font-size:23px;border:2px solid #000;border-width:2px 0;padding:5px 2px;margin-bottom:4px;text-transform:uppercase}.moderno .legal{font-size:8px;line-height:1.15;color:#555}.moderno .line{border-top-style:solid}.moderno table{margin-top:5px}.moderno td{border-bottom:1px solid #bbb;padding:4px 1px}.moderno .total{border:2px solid #000;padding:6px;text-align:center;font-size:17px}.moderno .qr-frame{border:1px solid #000;padding:2mm}.moderno .qr{width:34mm;height:34mm}
  </style></head><body class="${template}">${header}<div class="line"></div>${fiscalBlock}<p>${new Date(receipt.createdAt).toLocaleString('es-AR')}</p><table>${rows}</table>${Number(receipt.discount) > 0 ? `<p>Descuento: -$${Number(receipt.discount).toFixed(2)}</p>` : ''}<p class="total">TOTAL $${Number(receipt.totalFinal).toFixed(2)}</p><p>Pago: ${esc(receipt.paymentMethod)}</p>${fiscalFooter}<p>Gracias por su compra</p><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
  popup.document.close();
}
export function FiscalReceiptModal({ receipt, onClose, onRefresh }: { receipt:any; onClose:()=>void; onRefresh:(r:any)=>void }) {
 const doc=receipt.fiscalDocument; const retry=async()=>{await api(`/fiscal/sales/${receipt.id}/retry`,{method:'POST'});onRefresh(await api(`/fiscal/sales/${receipt.id}/receipt`));};
 return <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70]"><div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4"><h2 className="text-xl font-bold text-white mb-2">Venta registrada</h2>{doc?.kind==='INTERNAL'?<div className="rounded-lg border border-slate-600 bg-slate-800 p-4 mb-4"><p className="font-bold text-slate-200">COMPROBANTE INTERNO</p><p className="text-sm text-amber-400">No válido como factura</p></div>:doc?.status==='AUTHORIZED'?<div className="rounded-lg border border-emerald-700 bg-emerald-950/20 p-4 mb-4"><p className="font-bold text-emerald-300">Factura C autorizada</p><p className="text-sm text-slate-300">Nº {String(doc.pointOfSale).padStart(5,'0')}-{String(doc.receiptNumber).padStart(8,'0')} · CAE {doc.cae}</p></div>:<div className="rounded-lg border border-red-700 bg-red-950/20 p-4 mb-4"><p className="font-bold text-red-300">La venta se guardó, pero ARCA no autorizó</p><p className="text-sm text-red-200 mt-1">{doc?.errorMessage}</p><button onClick={()=>void retry()} className="mt-3 px-3 py-2 rounded bg-red-700 text-white text-sm">Reintentar ARCA</button></div>}<p className="text-2xl font-bold text-right text-white mb-4">Total ${Number(receipt.totalFinal).toFixed(2)}</p><div className="grid grid-cols-2 gap-2"><button onClick={()=>{ onClose(); void printFiscalReceipt(receipt); }} className="py-3 rounded-lg btn-brand font-bold">Imprimir</button><button onClick={onClose} className="py-3 rounded-lg bg-slate-700 text-white font-bold">No imprimir</button></div></div></div>;
}
