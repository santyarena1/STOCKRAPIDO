/** Vista imprimible / PDF (print del navegador) para facturas ARCA recibidas. */

export type ReceivedInvoicePrintable = {
  id: string;
  issuedAt: string | Date;
  voucherType: string;
  pointOfSale: number;
  numberFrom: number;
  numberTo?: number;
  authCode?: string | null;
  issuerDocType?: string | null;
  issuerDocNumber: string;
  issuerName?: string | null;
  currency?: string | null;
  netTaxed?: number | null;
  netNotTaxed?: number | null;
  exemptAmount?: number | null;
  otherTaxes?: number | null;
  vatAmount?: number | null;
  totalAmount: number;
  status?: string | null;
  receptorCuit?: string | null;
  receptorName?: string | null;
};

function esc(v: unknown) {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
  );
}

function money(v: unknown) {
  return Number(v ?? 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function voucherNumber(pointOfSale: number, numberFrom: number) {
  return `${String(pointOfSale).padStart(5, '0')}-${String(numberFrom).padStart(8, '0')}`;
}

function amountRow(label: string, value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return `<tr><td>${esc(label)}</td><td class="r">${esc(money(value))}</td></tr>`;
}

export function buildReceivedInvoiceHtml(
  inv: ReceivedInvoicePrintable,
  opts?: { autoPrint?: boolean },
) {
  const nro = voucherNumber(inv.pointOfSale, inv.numberFrom);
  const issued = new Date(inv.issuedAt).toLocaleDateString('es-AR');
  const autoPrint = opts?.autoPrint
    ? `<script>window.onload=()=>{try{window.focus();window.print()}catch(e){}}</script>`
    : '';

  const css = `
    @page{size:A4;margin:16mm}
    *{box-sizing:border-box}
    body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;background:#fff}
    .sheet{max-width:800px;margin:0 auto;padding:8mm}
    .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
    .brand{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#555}
    h1{margin:4px 0 0;font-size:22px}
    .meta{text-align:right;font-size:13px;line-height:1.45}
    .meta b{display:block;font-size:18px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
    .card{border:1px solid #ddd;border-radius:10px;padding:12px}
    .card h2{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#666}
    .card p{margin:0;font-size:14px;line-height:1.4}
    .muted{color:#666;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    td{padding:8px 0;border-bottom:1px solid #eee;font-size:14px}
    td.r{text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    .total td{border-bottom:none;font-size:18px;font-weight:800;padding-top:12px}
    .foot{margin-top:24px;font-size:11px;color:#666;line-height:1.4;border-top:1px dashed #ccc;padding-top:10px}
    @media print{.no-print{display:none!important}}
  `;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>${esc(inv.voucherType)} ${esc(nro)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <div class="brand">StockRápido · Factura recibida ARCA</div>
        <h1>${esc(inv.voucherType)}</h1>
        <div class="muted">Resumen para consulta / archivo. No reemplaza el PDF oficial del emisor.</div>
      </div>
      <div class="meta">
        <b>${esc(nro)}</b>
        <div>Fecha: ${esc(issued)}</div>
        ${inv.authCode ? `<div>CAE/CAEA: ${esc(inv.authCode)}</div>` : ''}
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Emisor</h2>
        <p><b>${esc(inv.issuerName || '—')}</b></p>
        <p class="muted">${esc(inv.issuerDocType || 'CUIT')} ${esc(inv.issuerDocNumber)}</p>
      </div>
      <div class="card">
        <h2>Receptor</h2>
        <p><b>${esc(inv.receptorName || 'Tu negocio')}</b></p>
        <p class="muted">${inv.receptorCuit ? `CUIT ${esc(inv.receptorCuit)}` : '—'}</p>
      </div>
    </div>

    <div class="card">
      <h2>Importes</h2>
      <table>
        ${amountRow('Neto gravado', inv.netTaxed)}
        ${amountRow('Neto no gravado', inv.netNotTaxed)}
        ${amountRow('Exento', inv.exemptAmount)}
        ${amountRow('IVA', inv.vatAmount)}
        ${amountRow('Otros tributos', inv.otherTaxes)}
        <tr class="total"><td>Total</td><td class="r">${esc(money(inv.totalAmount))}</td></tr>
      </table>
    </div>

    <div class="foot">
      Generado desde StockRápido con los datos sincronizados de Mis Comprobantes → Recibidos.
      Para el PDF oficial del proveedor, descargalo desde el portal ARCA o pedíselo al emisor.
    </div>
  </div>
  ${autoPrint}
</body>
</html>`;
}

export function printReceivedInvoice(inv: ReceivedInvoicePrintable) {
  const popup = window.open('', '_blank', 'width=900,height=1100');
  if (!popup) {
    alert('El navegador bloqueó la ventana. Permití popups para ver el PDF.');
    return;
  }
  popup.document.write(buildReceivedInvoiceHtml(inv, { autoPrint: true }));
  popup.document.close();
}
