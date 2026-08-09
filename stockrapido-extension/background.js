const API = 'https://stockrapido-api.vercel.app';
const TOKIN_HOME = 'https://tokintienda.com.ar/store/home';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let run = null;

async function setProgress(status, message, extra = {}) {
  const syncStatus = { status, message, at: new Date().toISOString(), ...extra };
  await chrome.storage.local.set({ syncStatus });
  chrome.runtime.sendMessage({ type: 'SYNC_PROGRESS', payload: syncStatus }).catch(() => {});
}

async function api(path, token, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`StockRápido HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.status === 204 ? null : response.json();
}

function extractProducts(payload) {
  const products = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.productId != null && (node.name != null || node.productName != null)) {
      products.push(node);
      return;
    }
    Object.values(node).forEach(walk);
  };
  walk(payload);
  return products;
}

function nodes(payload) {
  const result = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    result.push(node);
    Object.values(node).forEach(walk);
  };
  walk(payload);
  return result;
}

const num = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') { const parsed = Number(value.replace(',', '.')); return Number.isFinite(parsed) ? parsed : null; }
  return null;
};
const integer = (value) => { const parsed = num(value); return parsed == null ? null : Math.trunc(parsed); };
const pick = (node, ...keys) => {
  const lowered = Object.fromEntries(Object.entries(node || {}).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) if (lowered[key.toLowerCase()] != null && lowered[key.toLowerCase()] !== '') return lowered[key.toLowerCase()];
  return null;
};

function normalizeVariant(raw) {
  const price = raw?.price && typeof raw.price === 'object' ? raw.price : {};
  const tax = Array.isArray(raw?.taxGroup) && raw.taxGroup[0] ? raw.taxGroup[0] : {};
  return {
    uom: String(raw?.uom || 'UN'), multiplier: integer(raw?.multiplier) || 1,
    skuId: raw?.skuId != null ? String(raw.skuId) : null, refId: raw?.refId != null ? String(raw.refId) : null,
    ean: raw?.refId != null ? String(raw.refId) : null, listPrice: num(price.listPrice), sellingPrice: num(price.sellingPrice),
    priceWithTax: num(price.sellingPriceWithTax), cost: num(price.sellingPrice), stock: integer(raw?.stock),
    taxAlicuota: num(tax.alicuota), sellerId: raw?.sellerId != null ? String(raw.sellerId) : null, erpStatus: raw?.erpStatus != null ? String(raw.erpStatus) : null,
  };
}

function normalizeProduct(product) {
  const variants = Array.isArray(product.variants) ? product.variants.filter((item) => item && typeof item === 'object').map(normalizeVariant) : [];
  const unit = variants.find((item) => item.uom === 'UN') || variants[0] || {};
  const skus = Array.isArray(product.skus) ? product.skus : product.skus ? [product.skus] : [];
  const supplierRef = skus.find((sku) => sku?.ref_id || sku?.refId)?.ref_id || skus.find((sku) => sku?.ref_id || sku?.refId)?.refId || product.refId || unit.refId;
  const price = num(product.priceUN);
  const stock = integer(product.stockUN);
  const item = {
    externalId: String(product.productId), supplierRef: supplierRef != null ? String(supplierRef) : null,
    sku: product.skuId != null ? String(product.skuId) : unit.skuId, ean: unit.ean || null, eanUnit: unit.ean || null,
    name: product.name || product.productName || `Producto ${product.productId}`, ivaAlicuota: num(product.ivaAlicuota),
    unitsPerBox: integer(product.unitsUNPerBU) > 1 ? String(integer(product.unitsUNPerBU)) : null,
    basePrice: price, cost: price, listPrice: num(product.listPriceUN), available: stock == null || stock > 0,
    stock, variants, raw: product,
  };
  return Object.fromEntries(Object.entries(item).filter(([, value]) => value != null));
}

function normalizeAccount(summaryPayloads, microPayloads, checksPayloads) {
  const summaryNodes = summaryPayloads.flatMap(nodes);
  const all = [...summaryNodes, ...microPayloads.flatMap(nodes), ...checksPayloads.flatMap(nodes)];
  const account = { currency: 'ARS' };
  for (const node of all) {
    account.clienteId ||= pick(node, 'clienteId', 'clientId', 'customerId', 'codigoCliente');
    account.razonSocial ||= pick(node, 'razonSocial', 'businessName', 'customerName', 'nombreCliente');
    account.balance ??= num(pick(node, 'saldo', 'balance', 'currentBalance', 'saldoTotal'));
    account.creditLimit ??= num(pick(node, 'creditLimit', 'limiteCredito', 'limite'));
    account.availableCredit ??= num(pick(node, 'availableCredit', 'creditoDisponible', 'disponible'));
  }
  const invoices = []; const seen = new Set();
  for (const node of summaryNodes) {
    const number = pick(node, 'number', 'numero', 'invoiceNumber', 'nroFactura', 'comprobante');
    const date = pick(node, 'date', 'fecha', 'invoiceDate', 'fechaEmision');
    const total = num(pick(node, 'total', 'importeTotal', 'amount', 'monto'));
    const pending = num(pick(node, 'saldoPendiente', 'pendingBalance', 'saldo', 'importePendiente'));
    if (number == null || (date == null && total == null && pending == null) || seen.has(String(number))) continue;
    seen.add(String(number));
    invoices.push({ number: String(number), date, dueDate: pick(node, 'dueDate', 'vencimiento', 'fechaVencimiento'), total, saldoPendiente: pending, status: pick(node, 'status', 'estado'), pdfUrl: pick(node, 'pdfUrl', 'urlPdf', 'downloadUrl'), raw: node });
  }
  const credits = [];
  for (const [tipo, payloads] of [['microcredito', microPayloads], ['tokinchecks', checksPayloads]]) for (const node of payloads.flatMap(nodes)) {
    const available = num(pick(node, 'montoDisponible', 'availableAmount', 'disponible', 'availableCredit'));
    const used = num(pick(node, 'montoUsado', 'usedAmount', 'utilizado', 'usedCredit'));
    const expiry = pick(node, 'vencimiento', 'dueDate', 'expirationDate', 'fechaVencimiento');
    if (available == null && used == null && expiry == null) continue;
    credits.push({ tipo, montoDisponible: available, montoUsado: used, vencimiento: expiry, condiciones: pick(node, 'condiciones', 'conditions', 'description', 'descripcion') });
  }
  return { account, invoices, credits };
}

function normalizeOrders(payloads) {
  const orders = []; const seen = new Set();
  for (const node of payloads.flatMap(nodes)) {
    const id = pick(node, 'externalOrderId', 'orderId', 'id', 'numeroPedido', 'orderNumber');
    const status = pick(node, 'status', 'estado', 'orderStatus');
    const total = num(pick(node, 'total', 'amount', 'importeTotal', 'monto'));
    const placedAt = pick(node, 'placedAt', 'createdAt', 'date', 'fecha', 'orderDate');
    if (id == null || (status == null && total == null && placedAt == null) || seen.has(String(id))) continue;
    seen.add(String(id));
    const rawItems = pick(node, 'items', 'products', 'orderItems');
    const items = Array.isArray(rawItems) ? rawItems.filter((item) => item && typeof item === 'object').map((item) => {
      const qty = integer(pick(item, 'qty', 'quantity', 'cantidad')) || 1; const unitPrice = num(pick(item, 'unitPrice', 'price', 'precio'));
      return { name: pick(item, 'name', 'productName', 'nombre'), uom: pick(item, 'uom', 'unit'), qty, unitPrice, total: num(pick(item, 'total', 'subtotal')) ?? (unitPrice == null ? null : unitPrice * qty) };
    }) : [];
    orders.push({ externalOrderId: String(id), status, total, deliveryDate: pick(node, 'deliveryDate', 'fechaEntrega'), tracking: pick(node, 'tracking', 'trackingNumber', 'seguimiento'), placedAt, raw: node, items });
  }
  return orders;
}

function waitForTab(tabId, timeout = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('Tokin tardó demasiado en cargar.')); }, timeout);
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
async function navigate(tabId, url) { const waiting = waitForTab(tabId); await chrome.tabs.update(tabId, { url, active: true }); await waiting; await sleep(1500); }
async function messageTab(tabId, message, retries = 10) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try { return await chrome.tabs.sendMessage(tabId, message); } catch (_) { await sleep(400); }
  }
  return null;
}

async function waitForTemplate(timeout = 8000) {
  const started = Date.now();
  while (run && !run.searchTemplate && Date.now() - started < timeout) await sleep(250);
  return run?.searchTemplate || null;
}

function collectProducts(payload) {
  let added = 0;
  for (const product of extractProducts(payload)) {
    const key = String(product.productId);
    if (!run.products.has(key)) added += 1;
    run.products.set(key, product);
  }
  return added;
}

async function scrollHarvest(tabId, label, maxScrolls = 40) {
  let stable = 0;
  let previous = run.products.size;
  for (let index = 0; index < maxScrolls && stable < 3; index += 1) {
    await messageTab(tabId, { type: 'SCROLL_ONCE' });
    await sleep(1200);
    const current = run.products.size;
    stable = current === previous ? stable + 1 : 0;
    previous = current;
    await setProgress('running', `${label} · scroll ${index + 1}`, { products: current });
  }
}

async function harvestCurrentPage(tabId, label) {
  let template = await waitForTemplate(8000);
  if (!template) {
    await setProgress('running', `${label} · activando catálogo…`, { products: run.products.size });
    for (let index = 0; index < 8 && !template; index += 1) {
      await messageTab(tabId, { type: 'SCROLL_ONCE' });
      await sleep(1100);
      template = run.searchTemplate;
    }
  }
  let replayWorked = false;
  if (template) {
    let replayAdded = 0;
    for (let page = 0; page < 100 && run.products.size < 5000; page += 1) {
      const response = await messageTab(tabId, { type: 'REPLAY_SEARCH', template, page, size: 50 }, 3);
      if (!response?.ok) break;
      const added = collectProducts(response.payload);
      replayAdded += added;
      await setProgress('running', `${label} · página ${page + 1}`, { products: run.products.size });
      if (added === 0 && page > 0) break;
    }
    replayWorked = replayAdded > 0;
  }
  await scrollHarvest(tabId, replayWorked ? `${label} · cobertura por scroll` : `${label} · fallback por scroll`);
}

async function synchronize() {
  const stored = await chrome.storage.local.get(['accessToken']);
  if (!stored.accessToken) throw new Error('Iniciá sesión en StockRápido primero.');
  const connections = await api('/sync/connections', stored.accessToken);
  const connection = connections.find((item) => item.provider === 'tokin');
  if (!connection) throw new Error('No existe una conexión Tokin. Creala en Configuración → Proveedores.');
  run = { tabId: null, products: new Map(), searchTemplate: null, rich: { invoice: [], microcredit: [], checks: [], orders: [] } };
  await setProgress('running', 'Abriendo Tokin…', { products: 0 });
  const tabs = await chrome.tabs.query({ url: ['https://tokintienda.com.ar/*', 'https://tokintienda.cl/*'] });
  const tab = tabs[0] || await chrome.tabs.create({ url: TOKIN_HOME, active: true });
  run.tabId = tab.id;
  run.searchTemplate = null;
  await navigate(tab.id, 'https://tokintienda.com.ar/store/search?q=&size=n_50_n');
  await harvestCurrentPage(tab.id, 'Catálogo general');
  const response = await messageTab(tab.id, { type: 'GET_CATALOG_LINKS' });
  const links = [...new Set((response?.links || []).filter((url) => /^https:\/\/([^.]+\.)?tokintienda\.(com\.ar|cl)\//i.test(url)))].slice(0, 200);
  for (let index = 0; index < links.length; index += 1) {
    run.searchTemplate = null;
    await navigate(tab.id, links[index]);
    await harvestCurrentPage(tab.id, `Categoría ${index + 1}/${links.length}`);
  }

  // Cuenta corriente, facturas, microcréditos, TokinChecks y pedidos (best-effort, no rompe el catálogo).
  try {
    await setProgress('running', 'Trayendo cuenta corriente y pedidos…', { products: run.products.size });
    await navigate(tab.id, 'https://tokintienda.com.ar/store/account/orders');
    await sleep(3500);
    const acct = await messageTab(tab.id, { type: 'GET_ACCOUNT_LINKS' });
    const acctLinks = [...new Set((acct?.links || []).filter((url) => /^https:\/\/([^.]+\.)?tokintienda\.(com\.ar|cl)\/store\/account\//i.test(url)))].slice(0, 20);
    for (const link of acctLinks) {
      try { await navigate(tab.id, link); await sleep(2800); } catch (_) {}
    }
  } catch (error) { /* seguimos con lo que haya */ }

  const items = [...run.products.values()].map(normalizeProduct);
  if (!items.length) throw new Error('No se capturaron productos. Abrí el catálogo de Tokin, scrolleá un poco y volvé a intentar.');
  let pushed = 0;
  for (let start = 0; start < items.length; start += 100) {
    const batch = items.slice(start, start + 100);
    const result = await api(`/sync/connections/${connection.id}/push`, stored.accessToken, { method: 'POST', body: JSON.stringify({ items: batch }) });
    pushed += Number(result?.itemsUpserted || 0);
    await setProgress('running', `Subiendo productos ${Math.min(start + batch.length, items.length)}/${items.length}`, { products: items.length });
  }

  // Push de cuenta corriente y pedidos (best-effort).
  let invoicesCount = 0; let ordersCount = 0;
  try {
    const orders = normalizeOrders(run.rich.orders);
    const { account, invoices, credits } = normalizeAccount(run.rich.invoice, run.rich.microcredit, run.rich.checks);
    if (invoices.length || credits.length || (account && Object.keys(account).length > 1)) {
      await api(`/sync/connections/${connection.id}/account`, stored.accessToken, { method: 'POST', body: JSON.stringify({ account, invoices, credits }) });
      invoicesCount = invoices.length;
    }
    if (orders.length) {
      await api(`/sync/connections/${connection.id}/orders`, stored.accessToken, { method: 'POST', body: JSON.stringify({ orders }) });
      ordersCount = orders.length;
    }
  } catch (error) { /* cuenta/pedidos best-effort */ }

  await setProgress('success', `Listo: ${pushed} productos, ${invoicesCount} facturas y ${ordersCount} pedidos.`, { products: items.length, pushed, invoices: invoicesCount, orders: ordersCount });
  run = null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'TOKIN_CAPTURE' && run && sender.tab?.id === run.tabId) {
    if (message.kind === 'products') {
      if (!run.searchTemplate && message.request) run.searchTemplate = message.request;
      collectProducts(message.payload);
    } else if (run.rich && run.rich[message.kind]) {
      run.rich[message.kind].push(message.payload);
    }
    setProgress('running', 'Capturando datos de Tokin…', { products: run.products.size }).catch(() => {});
    return;
  }
  if (message?.type === 'START_SYNC') {
    synchronize()
      .then(() => sendResponse({ ok: true }))
      .catch(async (error) => {
        await setProgress('error', error instanceof Error ? error.message : String(error));
        run = null;
        sendResponse({ ok: false });
      });
    return true;
  }
});
