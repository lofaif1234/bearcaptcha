(function () {
  'use strict';

  const serverUrlInput = document.getElementById('serverUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const autoSolveCheckbox = document.getElementById('autoSolve');
  const toggleKeyBtn = document.getElementById('toggleKey');
  const saveBtn = document.getElementById('saveBtn');
  const manualSolveBtn = document.getElementById('manualSolveBtn');
  const statusDot = document.getElementById('status-dot');
  const resultArea = document.getElementById('result-area');
  const resultContent = document.getElementById('result-content');
  const saveNotice = document.getElementById('save-notice');
  const openDashboard = document.getElementById('openDashboard');

  chrome.storage.sync.get(['apiKey', 'serverUrl', 'autoSolve'], (settings) => {
    if (settings.serverUrl) serverUrlInput.value = settings.serverUrl;
    if (settings.apiKey) apiKeyInput.value = settings.apiKey;
    autoSolveCheckbox.checked = settings.autoSolve !== false;

    if (settings.serverUrl) checkServerHealth(settings.serverUrl);
  });

  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.querySelector('i').className = isPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
  });

  saveBtn.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const autoSolve = autoSolveCheckbox.checked;

    chrome.storage.sync.set({ serverUrl, apiKey, autoSolve }, () => {
      saveNotice.style.display = 'flex';
      setTimeout(() => { saveNotice.style.display = 'none'; }, 2500);

      notifyContentScripts({ type: 'TOGGLE_AUTO', enabled: autoSolve });

      if (serverUrl) checkServerHealth(serverUrl);
    });
  });

  autoSolveCheckbox.addEventListener('change', () => {
    notifyContentScripts({ type: 'TOGGLE_AUTO', enabled: autoSolveCheckbox.checked });
  });

  manualSolveBtn.addEventListener('click', async () => {
    manualSolveBtn.innerHTML = '<span class="spinner"></span> Solving...';
    manualSolveBtn.disabled = true;
    resultArea.style.display = 'none';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) throw new Error('No active tab');

      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js']
      }).catch(() => {});

      chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_SOLVE' }, (response) => {
        if (chrome.runtime.lastError) {
          showResult({ error: 'Could not reach page. Refresh and try again.' }, false);
        }
      });

      showResult({ info: 'Solve triggered — check the page for results' }, null);
    } catch (err) {
      showResult({ error: err.message }, false);
    } finally {
      manualSolveBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Solve Current CAPTCHA';
      manualSolveBtn.disabled = false;
    }
  });

  openDashboard.addEventListener('click', (e) => {
    e.preventDefault();
    const url = serverUrlInput.value.trim() || 'http://localhost:3000';
    chrome.tabs.create({ url });
  });

  async function checkServerHealth(serverUrl) {
    try {
      const base = serverUrl.replace(/\/$/, '');
      const res = await fetch(`${base}/api/health`);
      if (res.ok) {
        statusDot.className = 'status-dot online';
        statusDot.title = 'Server online';
      } else {
        throw new Error('Not ok');
      }
    } catch {
      statusDot.className = 'status-dot offline';
      statusDot.title = 'Server offline or unreachable';
    }
  }

  function showResult(data, success) {
    resultArea.style.display = 'block';

    if (data.error) {
      resultContent.innerHTML = `<div class="result-error"><i class="fa-solid fa-circle-xmark"></i> ${escHtml(data.error)}</div>`;
      return;
    }

    if (data.info) {
      resultContent.innerHTML = `<div style="color:var(--muted);font-size:12px">${escHtml(data.info)}</div>`;
      return;
    }

    if (data.token) {
      resultContent.innerHTML = `
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <button class="btn btn-ghost btn-sm" id="copyTokenBtn"><i class="fa-regular fa-copy"></i> Copy token</button>
        </div>
        <pre class="result-token" id="tokenBox">${escHtml(data.token)}</pre>
        ${data.credits_remaining !== undefined ? `<div class="result-meta" style="margin-top:6px">Credits remaining: <strong>${data.credits_remaining}</strong></div>` : ''}
      `;
      const copyBtn = document.getElementById('copyTokenBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(data.token).catch(() => {});
          copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
          setTimeout(() => copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy token', 1500);
        });
      }
      return;
    }

    resultContent.innerHTML = `<pre class="result-token">${escHtml(JSON.stringify(data, null, 2))}</pre>`;
  }

  function notifyContentScripts(msg) {
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      });
    });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
