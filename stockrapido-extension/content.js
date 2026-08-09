(() => {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = () => script.remove();
  (document.documentElement || document.head).appendChild(script);

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'sr-sync') return;
    chrome.runtime.sendMessage({ type: 'TOKIN_CAPTURE', kind: event.data.kind, payload: event.data.payload, request: event.data.request }).catch(() => {});
  });

  const pageToken = (value, page) => {
    if (typeof value === 'number') return page;
    if (typeof value === 'string' && /^n_\d+_n$/.test(value)) return `n_${page}_n`;
    return String(page);
  };
  const sizeToken = (value, size) => {
    if (typeof value === 'number') return size;
    if (typeof value === 'string' && /^n_\d+_n$/.test(value)) return `n_${size}_n`;
    return String(size);
  };
  function mutatePagination(node, page, size) {
    if (!node || typeof node !== 'object') return false;
    let changed = false;
    for (const [key, value] of Object.entries(node)) {
      const normalized = key.toLowerCase();
      if (['current', 'page', 'pagenumber', 'pageindex'].includes(normalized)) { node[key] = pageToken(value, page); changed = true; }
      else if (['size', 'pagesize', 'limit'].includes(normalized)) { node[key] = sizeToken(value, size); changed = true; }
      else if (value && typeof value === 'object') changed = mutatePagination(value, page, size) || changed;
    }
    return changed;
  }
  function replayRequest(template, page, size) {
    const url = new URL(template.url, location.href);
    for (const key of ['current', 'page', 'pageNumber', 'pageIndex']) if (url.searchParams.has(key)) url.searchParams.set(key, pageToken(url.searchParams.get(key), page));
    for (const key of ['size', 'pageSize', 'limit']) if (url.searchParams.has(key)) url.searchParams.set(key, sizeToken(url.searchParams.get(key), size));
    let body = template.body;
    const headers = { ...(template.headers || {}) };
    for (const key of Object.keys(headers)) if (/^(host|content-length|cookie|origin|referer)$/i.test(key)) delete headers[key];
    if (typeof body === 'string' && body) {
      try { const parsed = JSON.parse(body); mutatePagination(parsed, page, size); body = JSON.stringify(parsed); }
      catch (_) {
        const params = new URLSearchParams(body);
        for (const key of ['current', 'page', 'pageNumber', 'pageIndex']) if (params.has(key)) params.set(key, pageToken(params.get(key), page));
        for (const key of ['size', 'pageSize', 'limit']) if (params.has(key)) params.set(key, sizeToken(params.get(key), size));
        body = params.toString();
      }
    } else if (body?.__formData) {
      const params = new URLSearchParams(body.__formData);
      for (const key of ['current', 'page', 'pageNumber', 'pageIndex']) if (params.has(key)) params.set(key, pageToken(params.get(key), page));
      for (const key of ['size', 'pageSize', 'limit']) if (params.has(key)) params.set(key, sizeToken(params.get(key), size));
      body = params.toString();
    }
    return { url: url.href, headers, body };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_CATALOG_LINKS') {
      const links = [...document.querySelectorAll('nav a[href], header a[href], a[href]')]
        .filter((anchor) => /catálogo|catalogo|categor|\/store\/search/i.test(`${anchor.textContent || ''} ${anchor.getAttribute('href') || ''}`))
        .map((anchor) => anchor.href);
      sendResponse({ links: [...new Set(links)] });
      return;
    }
    if (message?.type === 'GET_ACCOUNT_LINKS') {
      const links = [...document.querySelectorAll('a[href]')]
        .map((anchor) => anchor.href)
        .filter((href) => /\/store\/account\//i.test(href) && !/logout|salir|cerrar/i.test(href));
      sendResponse({ links: [...new Set(links)] });
      return;
    }
    if (message?.type === 'SCROLL_ONCE') {
      window.scrollTo(0, document.body.scrollHeight);
      sendResponse({ ok: true, height: document.body.scrollHeight });
      return;
    }
    if (message?.type === 'REPLAY_SEARCH') {
      (async () => {
        const request = replayRequest(message.template, message.page, message.size);
        const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.body, credentials: 'include' });
        if (!response.ok) throw new Error(`Tokin search HTTP ${response.status}`);
        sendResponse({ ok: true, payload: await response.json() });
      })().catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
  });
})();
