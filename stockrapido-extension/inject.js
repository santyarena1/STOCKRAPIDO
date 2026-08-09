(() => {
  if (window.__stockRapidoSyncInjected) return;
  window.__stockRapidoSyncInjected = true;

  const isSearch = (url, method) => String(method || 'GET').toUpperCase() === 'POST' && String(url || '').includes('/store/api/search');
  const richKind = (url) => {
    const u = String(url || '');
    if (!/tokintienda\.(com\.ar|cl)/i.test(u)) return null;
    if (/getInvoiceSummary|invoice-summary|invoiceSummary|resumen.*cuenta|\/invoices?\b/i.test(u)) return 'invoice';
    if (/getMicrocredits|micro-?credit/i.test(u)) return 'microcredit';
    if (/getTokinChecks|tokin-?checks/i.test(u)) return 'checks';
    if (/getOrders|orderHistory|order-history|getOrderHistory|\/orders?\b|\/order\//i.test(u)) return 'orders';
    return null;
  };
  const serializeHeaders = (headers) => {
    try {
      if (headers instanceof Headers) return Object.fromEntries(headers.entries());
      if (Array.isArray(headers)) return Object.fromEntries(headers);
      return { ...(headers || {}) };
    } catch (_) { return {}; }
  };
  const serializeBody = (body) => {
    if (body == null || typeof body === 'string') return body ?? null;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) return { __formData: [...body.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : value.name]) };
    try { return JSON.stringify(body); } catch (_) { return null; }
  };
  const publish = (kind, payload, request) => window.postMessage({ source: 'sr-sync', kind, payload, request }, '*');

  const classify = (url, method) => {
    if (isSearch(url, method)) return 'products';
    return richKind(url);
  };

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const input = args[0]; const init = args[1] || {};
    const url = typeof input === 'string' ? input : input?.url;
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const kind = classify(url, method);
    const request = kind === 'products' ? {
      url: new URL(url, location.href).href,
      method,
      headers: { ...serializeHeaders(input?.headers), ...serializeHeaders(init.headers) },
      body: serializeBody(init.body),
    } : null;
    const response = await originalFetch.apply(this, args);
    if (kind) response.clone().json().then((payload) => publish(kind, payload, request)).catch(() => {});
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__srSyncRequest = { url: new URL(url, location.href).href, method: String(method || 'GET').toUpperCase(), headers: {}, body: null };
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__srSyncRequest) this.__srSyncRequest.headers[name] = value;
    return originalSetHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__srSyncRequest) this.__srSyncRequest.body = serializeBody(body);
    const req = this.__srSyncRequest;
    const kind = req ? classify(req.url, req.method) : null;
    if (req && kind) {
      this.addEventListener('load', () => {
        try {
          const payload = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          publish(kind, payload, kind === 'products' ? req : null);
        } catch (_) {}
      }, { once: true });
    }
    return originalSend.call(this, body);
  };
})();
