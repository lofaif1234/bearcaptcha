(function () {
  'use strict';

  let solving = false;

  function log(msg) {
    console.log(`[BearCaptcha] ${msg}`);
  }

  function notify(msg, type = 'info') {
    chrome.runtime.sendMessage({ type: 'NOTIFY', payload: { msg, notifType: type } });
  }

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.source !== 'bearcaptcha-inject' || d.type !== 'ARKOSE_DETECTED') return;
    if (solving) return;
    solving = true;

    log('Arkose detected — publickey=' + (d.publicKey || 'N/A') + ' blob=' + (d.blob ? 'yes' : 'no'));
    notify('Arkose detected — solving token...', 'info');

    trySolve(d.publicKey, d.blob).finally(() => { solving = false; });
  });

  async function trySolve(publicKey, blob) {
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'SOLVE_CAPTCHA',
          payload: {
            pageurl: location.href,
            publickey: publicKey,
            blob: blob || undefined,
            userAgent: navigator.userAgent
          }
        }, res => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(res);
        });
      });

      if (!result.success) throw new Error(result.error);

      const token = result.token;
      log('Token received — injecting');
      notify('Token solved — injecting into page', 'success');

      window.postMessage({
        source: 'bearcaptcha-content',
        type: 'TOKEN',
        token
      }, '*');
    } catch (err) {
      log(`Solve failed: ${err.message}`);
      notify(`Failed: ${err.message}`, 'error');
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MANUAL_SOLVE') {
      window.postMessage({ source: 'bearcaptcha-content', type: 'PING' }, '*');
      notify('Scanning for Arkose challenge...', 'info');
    }

    if (msg.type === 'TOGGLE_AUTO') {
      log('Auto-solve preference updated (no-op in token model)');
    }
  });

  log('Token solver injected on ' + location.href);
})();
