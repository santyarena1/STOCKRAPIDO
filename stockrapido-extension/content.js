(() => {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = () => script.remove();
  (document.documentElement || document.head).appendChild(script);

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'sr-sync') return;
    chrome.runtime.sendMessage({ type: 'TOKIN_CAPTURE', kind: event.data.kind, payload: event.data.payload }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_CATALOG_LINKS') {
      const links = [...document.querySelectorAll('a[href]')]
        .map((anchor) => anchor.href)
        .filter((href) => /categor|catalog|department/i.test(href));
      sendResponse({ links: [...new Set(links)] });
      return;
    }
    if (message?.type === 'SWEEP_PAGE') {
      (async () => {
        let previousHeight = 0;
        let stable = 0;
        for (let index = 0; index < 40; index += 1) {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const height = document.body.scrollHeight;
          stable = height === previousHeight ? stable + 1 : 0;
          previousHeight = height;
          const button = [...document.querySelectorAll('button')].find((item) => /ver más|cargar más|siguiente/i.test(item.textContent || '') && !item.disabled);
          if (button) {
            button.click();
            await new Promise((resolve) => setTimeout(resolve, 800));
          } else if (stable >= 3) break;
        }
        sendResponse({ ok: true });
      })().catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
  });
})();
