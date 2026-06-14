(function () {
  'use strict';

  const send = (data) => window.postMessage(Object.assign({ source: 'bearcaptcha-inject' }, data), '*');

  let enforcementRef = null;
  let lastKey = null;
  let lastBlob = null;

  function announce() {
    if (lastKey || lastBlob) {
      send({ type: 'ARKOSE_DETECTED', publicKey: lastKey || undefined, blob: lastBlob || undefined });
    }
  }

  function scanForKey() {
    const el = document.querySelector(
      'script[src*="arkoselabs.com/v2/"], iframe[src*="arkoselabs.com"], script[data-pkey]'
    );
    if (!el) return;
    let key = el.getAttribute && el.getAttribute('data-pkey');
    if (!key) {
      const src = el.src || '';
      const m = src.match(/arkoselabs\.com\/v2\/([^/]+)\//) || src.match(/[?&]pk=([^&]+)/);
      if (m) key = decodeURIComponent(m[1]);
    }
    if (key && key !== lastKey) { lastKey = key; announce(); }
  }

  function wrapEnforcement(enf) {
    if (!enf || typeof enf !== 'object' || enf.__bearWrapped) return enf;
    enf.__bearWrapped = true;
    enforcementRef = enf;

    ['setConfig', 'run'].forEach((method) => {
      if (typeof enf[method] !== 'function') return;
      const orig = enf[method].bind(enf);
      enf[method] = function (cfg) {
        try {
          cfg = cfg || {};
          const pk = cfg.publicKey || cfg.public_key || (cfg.config && cfg.config.publicKey);
          const blob = (cfg.data && (cfg.data.blob || cfg.data['blob'])) || cfg.blob;
          if (pk) lastKey = pk;
          if (blob) lastBlob = blob;
          if (pk || blob) announce();
        } catch (e) {}
        return orig(cfg);
      };
    });
    return enf;
  }

  ['ArkoseEnforcement', 'arkose', 'fc'].forEach((name) => {
    let stored = window[name];
    if (stored) wrapEnforcement(stored);
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get() { return stored; },
        set(v) { stored = wrapEnforcement(v); }
      });
    } catch (e) {}
  });

  scanForKey();
  try {
    new MutationObserver(scanForKey).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.source !== 'bearcaptcha-content' || d.type !== 'TOKEN' || !d.token) return;
    injectToken(d.token);
  });

  function injectToken(token) {
    try {
      if (enforcementRef && typeof enforcementRef.onCompleted === 'function') {
        enforcementRef.onCompleted({ token });
      }
    } catch (e) {}
    window.__BEARCAPTCHA_TOKEN__ = token;
    try {
      window.dispatchEvent(new CustomEvent('bearcaptcha:token', { detail: { token } }));
    } catch (e) {}
  }
})();
