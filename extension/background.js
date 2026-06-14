chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SOLVE_CAPTCHA') {
    handleSolve(msg.payload).then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (msg.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(['apiKey', 'serverUrl', 'autoSolve'], settings => {
      sendResponse(settings);
    });
    return true;
  }
});

async function handleSolve(payload) {
  const settings = await new Promise(resolve => {
    chrome.storage.sync.get(['apiKey', 'serverUrl'], resolve);
  });

  const { apiKey, serverUrl } = settings;

  if (!apiKey) throw new Error('No API key configured. Open the extension popup to set it.');
  if (!serverUrl) throw new Error('No server URL configured.');

  const base = serverUrl.replace(/\/$/, '');

  const res = await fetch(`${base}/api/captcha/solve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify({
      pageurl: payload.pageurl,
      publickey: payload.publickey,
      surl: payload.surl || undefined,
      blob: payload.blob || undefined,
      userAgent: payload.userAgent || navigator.userAgent,
      proxy: payload.proxy || undefined,
      proxytype: payload.proxytype || undefined
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}
