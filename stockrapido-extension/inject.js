(() => {
  if (window.__stockRapidoSyncInjected) return;
  window.__stockRapidoSyncInjected = true;

  const classify = (url) => {
    const value = String(url || '').toLowerCase();
    if (value.includes('/store/api/search')) return 'products';
    if (value.includes('getinvoicesummary')) return 'invoice-summary';
    if (value.includes('getmicrocredits')) return 'microcredits';
    if (value.includes('gettokinchecks')) return 'tokin-checks';
    if (/orderhistory|getorders|\/orders(?:[/?]|$)|\/order\//i.test(value)) return 'orders';
    return null;
  };
  const publish = (url, payload) => {
    const kind = classify(url);
    if (kind) window.postMessage({ source: 'sr-sync', kind, payload }, '*');
  };

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = response.url || args[0]?.url || args[0];
    if (classify(url)) response.clone().json().then((payload) => publish(url, payload)).catch(() => {});
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__srSyncUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (classify(this.__srSyncUrl)) {
      this.addEventListener('load', () => {
        try {
          const payload = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          publish(this.responseURL || this.__srSyncUrl, payload);
        } catch (_) {}
      }, { once: true });
    }
    return originalSend.apply(this, args);
  };
})();
