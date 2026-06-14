(function () {
  'use strict';

  let adminSecret = null;

  /* API base URL — set in config.js. Empty string = same origin.
     Trailing slash is stripped so api('/api/x') always resolves cleanly. */
  const API_BASE = (window.BEARCAPTCHA_API_BASE || '').replace(/\/+$/, '');
  const api = (path) => API_BASE + path;

  /* ------------------------------------------------------------------ */
  /* VIEW ROUTING                                                         */
  /* ------------------------------------------------------------------ */

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
    
    // Highlight the active navbar link
    document.querySelectorAll('.navbar-links a').forEach(a => {
      a.classList.toggle('active', a.dataset.view === name);
    });
    
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', e => {
    const viewTarget = e.target.closest('[data-view]');
    if (viewTarget) {
      e.preventDefault();
      const v = viewTarget.dataset.view;
      if (v === 'admin') {
        if (!adminSecret) { openAdminModal(); return; }
      }
      showView(v);
    }

    const scrollTarget = e.target.closest('[data-scroll]');
    if (scrollTarget) {
      e.preventDefault();
      if (document.getElementById('view-home') && !document.getElementById('view-home').classList.contains('active')) {
        showView('home');
        setTimeout(() => {
          const el = document.getElementById(scrollTarget.dataset.scroll);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      } else {
        const el = document.getElementById(scrollTarget.dataset.scroll);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });

  /* ------------------------------------------------------------------ */
  /* DOCS TABS (homepage)                                                 */
  /* ------------------------------------------------------------------ */

  function activateDocTab(name) {
    document.querySelectorAll('.dtab').forEach(b => b.classList.toggle('active', b.dataset.dtab === name));
    document.querySelectorAll('.docs-nav-item').forEach(b => b.classList.toggle('active', b.dataset.dtarget === name));
    document.querySelectorAll('.dtab-pane').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('dtab-' + name);
    if (el) el.classList.add('active');
  }

  document.querySelectorAll('.dtab').forEach(btn => {
    btn.addEventListener('click', () => activateDocTab(btn.dataset.dtab));
  });
  document.querySelectorAll('.docs-nav-item').forEach(btn => {
    btn.addEventListener('click', () => activateDocTab(btn.dataset.dtarget));
  });

  /* ------------------------------------------------------------------ */
  /* ADMIN MODAL                                                          */
  /* ------------------------------------------------------------------ */

  const adminModal   = document.getElementById('adminModal');
  const adminBtn     = document.getElementById('adminBtn');
  const adminSubmit  = document.getElementById('adminLoginSubmit');
  const adminInput   = document.getElementById('adminSecretInput');
  const adminErr     = document.getElementById('admin-login-error');

  function openAdminModal() {
    adminModal.style.display = 'flex';
    adminInput.value = '';
    adminErr.style.display = 'none';
    setTimeout(() => adminInput.focus(), 50);
  }

  function closeAdminModal() { adminModal.style.display = 'none'; }

  adminBtn.addEventListener('click', () => {
    if (adminSecret) { adminLogout(); return; }
    openAdminModal();
  });

  /* ------------------------------------------------------------------ */
  /* PURCHASE MODAL                                                       */
  /* ------------------------------------------------------------------ */
  const purchaseModal = document.getElementById('purchaseModal');
  function openPurchaseModal() { if (purchaseModal) purchaseModal.style.display = 'flex'; }
  function closePurchaseModal() { if (purchaseModal) purchaseModal.style.display = 'none'; }

  // Any element with [data-purchase] (Choose buttons, Discord/Telegram icons,
  // "Buy credits") opens the purchase modal.
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-purchase]');
    if (trigger) {
      e.preventDefault();
      openPurchaseModal();
    }
  });

  if (purchaseModal) {
    document.getElementById('purchaseModalClose').addEventListener('click', closePurchaseModal);
    document.getElementById('purchaseModalCancel').addEventListener('click', closePurchaseModal);
    purchaseModal.addEventListener('click', e => { if (e.target === purchaseModal) closePurchaseModal(); });
  }

  // Footer "Admin" link opens the same login modal
  const footerAdmin = document.getElementById('footerAdmin');
  if (footerAdmin) {
    footerAdmin.addEventListener('click', e => {
      e.preventDefault();
      if (adminSecret) { showView('admin'); return; }
      openAdminModal();
    });
  }

  document.getElementById('adminModalClose').addEventListener('click', closeAdminModal);
  document.getElementById('adminModalCancel').addEventListener('click', closeAdminModal);
  adminModal.addEventListener('click', e => { if (e.target === adminModal) closeAdminModal(); });
  adminInput.addEventListener('keydown', e => { if (e.key === 'Enter') adminSubmit.click(); });

  adminSubmit.addEventListener('click', async () => {
    const secret = adminInput.value.trim();
    if (!secret) return;
    adminSubmit.innerHTML = '<span class="spinner"></span>';
    adminSubmit.disabled = true;

    try {
      const res = await fetch(api('/api/admin/stats'), { headers: { 'X-Admin-Secret': secret } });
      if (!res.ok) throw new Error('bad');
      adminSecret = secret;
      closeAdminModal();
      adminBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Logout';
      showView('admin');
      loadAdminData();
    } catch {
      adminErr.style.display = 'block';
    } finally {
      adminSubmit.innerHTML = 'Login';
      adminSubmit.disabled = false;
    }
  });

  function adminLogout() {
    adminSecret = null;
    adminBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Admin';
    showView('home');
  }

  document.getElementById('adminLogoutBtn').addEventListener('click', adminLogout);

  /* ------------------------------------------------------------------ */
  /* ADMIN TABS                                                           */
  /* ------------------------------------------------------------------ */

  document.querySelectorAll('.rlink').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.rlink').forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
      link.classList.add('active');
      const tab = document.getElementById('atab-' + link.dataset.tab);
      if (tab) tab.classList.add('active');
      if (link.dataset.tab === 'keys' || link.dataset.tab === 'credits') loadAdminKeys();
    });
  });

  /* ------------------------------------------------------------------ */
  /* ADMIN DATA                                                           */
  /* ------------------------------------------------------------------ */

  async function loadAdminData() {
    await Promise.all([loadAdminStats(), loadAdminKeys()]);
  }

  async function loadAdminStats() {
    try {
      const res = await fetch(api('/api/admin/stats'), { headers: { 'X-Admin-Secret': adminSecret } });
      const d = await res.json();
      setText('a-total-keys', d.totalKeys ?? '—');
      setText('a-active-keys', d.activeKeys ?? '—');
      setText('a-total-requests', d.totalRequests ?? '—');
      setText('a-total-credits', d.totalCredits ?? '—');
      setText('a-2c-balance', d.twocaptchaBalance != null ? '$' + d.twocaptchaBalance.toFixed(2) : '—');
      setText('hs-requests', d.totalRequests ?? '—');
    } catch {}
  }

  async function loadAdminKeys() {
    if (!adminSecret) return;
    try {
      const res = await fetch(api('/api/admin/keys'), { headers: { 'X-Admin-Secret': adminSecret } });
      const { keys } = await res.json();
      renderOverviewTable(keys);
      renderKeysTable(keys);
      populateCreditSelect(keys);
    } catch {}
  }

  function renderOverviewTable(keys) {
    const tbody = document.getElementById('overview-keys-body');
    if (!keys.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No keys yet</td></tr>';
      return;
    }
    tbody.innerHTML = [...keys].sort((a, b) => (b.requests || 0) - (a.requests || 0)).map(k => `
      <tr>
        <td>${esc(k.label)}</td>
        <td class="key-cell">${maskKey(k.key)}</td>
        <td>${k.credits ?? 0}</td>
        <td>${k.requests ?? 0}</td>
        <td>${k.lastUsed ? relTime(k.lastUsed) : 'Never'}</td>
        <td><span class="badge badge-${k.active ? 'active' : 'revoked'}">${k.active ? 'Active' : 'Revoked'}</span></td>
      </tr>
    `).join('');
  }

  function renderKeysTable(keys) {
    const tbody = document.getElementById('admin-keys-body');
    if (!keys.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No keys yet</td></tr>';
      return;
    }
    tbody.innerHTML = keys.map(k => `
      <tr>
        <td>${esc(k.label)}</td>
        <td class="key-cell">${maskKey(k.key)}
          <button class="copy-btn" data-action="copy" data-key="${esc(k.key)}" aria-label="Copy API key"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
        </td>
        <td>${k.credits ?? 0}</td>
        <td>${k.requests ?? 0}</td>
        <td>${new Date(k.createdAt).toLocaleDateString()}</td>
        <td><span class="badge badge-${k.active ? 'active' : 'revoked'}">${k.active ? 'Active' : 'Revoked'}</span></td>
        <td>
          <div style="display:flex;gap:4px">
            ${k.active ? `<button class="btn btn-outline dark btn-xs" data-action="revoke" data-id="${esc(k.id)}">Revoke</button>` : ''}
            <button class="btn btn-danger btn-xs" data-action="delete" data-id="${esc(k.id)}" aria-label="Delete key"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function populateCreditSelect(keys) {
    const sel = document.getElementById('credit-key-select');
    const cur = sel.value;
    sel.innerHTML = '<option value="">— select a key —</option>' +
      keys.filter(k => k.active).map(k => `<option value="${k.id}">${esc(k.label)} (${k.credits ?? 0} credits)</option>`).join('');
    if (cur) sel.value = cur;
  }

  /* Delegated handler for the keys table — no inline onclick (CSP-safe). */
  function revokeKey(id) {
    if (!confirm('Revoke this key?')) return;
    fetch(api(`/api/admin/keys/${id}/revoke`), { method: 'PATCH', headers: { 'X-Admin-Secret': adminSecret } })
      .then(loadAdminKeys);
  }
  function deleteKey(id) {
    if (!confirm('Delete this key permanently?')) return;
    fetch(api(`/api/admin/keys/${id}`), { method: 'DELETE', headers: { 'X-Admin-Secret': adminSecret } })
      .then(loadAdminData);
  }
  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'));
  }

  document.getElementById('admin-keys-body').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'copy')   copyText(btn.dataset.key);
    if (action === 'revoke') revokeKey(btn.dataset.id);
    if (action === 'delete') deleteKey(btn.dataset.id);
  });

  /* NEW KEY MODAL */
  const newKeyModal  = document.getElementById('newKeyModal');
  const newKeyBtn    = document.getElementById('newKeyBtn');

  newKeyBtn.addEventListener('click', () => {
    document.getElementById('newKeyLabel').value = '';
    document.getElementById('newKeyCredits').value = '';
    document.getElementById('new-key-reveal').style.display = 'none';
    document.getElementById('newKeySubmit').disabled = false;
    document.getElementById('newKeySubmit').textContent = 'Create Key';
    newKeyModal.style.display = 'flex';
    document.getElementById('newKeyLabel').focus();
  });

  document.getElementById('newKeyModalClose').addEventListener('click', () => { newKeyModal.style.display = 'none'; loadAdminData(); });
  document.getElementById('newKeyCancel').addEventListener('click', () => { newKeyModal.style.display = 'none'; loadAdminData(); });
  newKeyModal.addEventListener('click', e => { if (e.target === newKeyModal) { newKeyModal.style.display = 'none'; loadAdminData(); } });

  document.getElementById('newKeySubmit').addEventListener('click', async () => {
    const label   = document.getElementById('newKeyLabel').value.trim() || 'Unnamed';
    const credits = parseInt(document.getElementById('newKeyCredits').value, 10) || 0;
    const btn = document.getElementById('newKeySubmit');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
      const res = await fetch(api('/api/admin/keys'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
        body: JSON.stringify({ label, credits })
      });
      const data = await res.json();
      document.getElementById('new-key-value').textContent = data.key.key;
      document.getElementById('new-key-reveal').style.display = 'block';
      btn.textContent = 'Done';
    } catch {
      btn.textContent = 'Error';
      btn.disabled = false;
    }
  });

  /* ADD CREDITS */
  document.getElementById('addCreditsBtn').addEventListener('click', async () => {
    const id     = document.getElementById('credit-key-select').value;
    const amount = parseInt(document.getElementById('credit-amount').value, 10);
    const fb     = document.getElementById('credits-feedback');

    if (!id || !amount || amount < 1) {
      showFeedback(fb, 'Select a key and enter a valid amount', false);
      return;
    }

    const btn = document.getElementById('addCreditsBtn');
    btn.innerHTML = '<span class="spinner"></span> Adding...';
    btn.disabled = true;

    try {
      const res = await fetch(api(`/api/admin/keys/${id}/credits`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(fb, `Credits added. New balance: ${data.credits}`, true);
        document.getElementById('credit-amount').value = '';
        loadAdminData();
      } else {
        showFeedback(fb, data.error || 'Failed', false);
      }
    } catch {
      showFeedback(fb, 'Network error', false);
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Credits';
      btn.disabled = false;
    }
  });

  /* ------------------------------------------------------------------ */
  /* BUYER PANEL                                                          */
  /* ------------------------------------------------------------------ */

  document.getElementById('panel-lookup-btn').addEventListener('click', lookupKey);
  document.getElementById('panel-key-input').addEventListener('keydown', e => { if (e.key === 'Enter') lookupKey(); });

  async function lookupKey() {
    const key = document.getElementById('panel-key-input').value.trim();
    const errEl = document.getElementById('panel-error');
    const result = document.getElementById('panel-result');

    errEl.style.display = 'none';
    result.style.display = 'none';

    if (!key || !key.startsWith('brk_')) {
      document.getElementById('panel-error-text').textContent = 'Invalid key format. Keys start with brk_';
      errEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('panel-lookup-btn');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
      const res = await fetch(api('/api/captcha/credits'), { headers: { 'X-API-Key': key } });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Invalid or revoked key');
      }
      const data = await res.json();
      setText('pstat-credits', data.credits ?? 0);
      setText('pstat-requests', data.requests ?? 0);
      setText('pstat-status', 'Active');
      document.getElementById('pstat-key-display').textContent = maskKey(key);
      const qsEl = document.getElementById('qs-key-inline');
      if (qsEl) qsEl.textContent = '"' + key + '"';

      document.getElementById('panel-copy-key').onclick = () => {
        navigator.clipboard.writeText(key).then(() => toast('Key copied'));
      };

      result.style.display = 'block';
    } catch (err) {
      document.getElementById('panel-error-text').textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Look up';
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* UTILS                                                                */
  /* ------------------------------------------------------------------ */

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function maskKey(key) {
    if (!key) return '';
    return key.slice(0, 10) + '•••••••••••••' + key.slice(-4);
  }

  function relTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return days + 'd ago';
    if (hrs > 0)  return hrs + 'h ago';
    if (mins > 0) return mins + 'm ago';
    return 'Just now';
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  function showFeedback(el, msg, ok) {
    el.textContent = msg;
    el.className = 'credits-fb ' + (ok ? 'ok' : 'err');
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  document.getElementById('refreshBtn').addEventListener('click', loadAdminData);

  /* ------------------------------------------------------------------ */
  /* MOBILE NAV TOGGLE                                                    */
  /* ------------------------------------------------------------------ */

  const navToggle = document.getElementById('navToggle');
  const navLinks  = document.getElementById('navLinks');

  function closeMobileNav() {
    if (!navLinks) return;
    navLinks.classList.remove('open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    // Collapse the sheet after navigating to a link
    navLinks.addEventListener('click', e => {
      if (e.target.closest('a')) closeMobileNav();
    });
  }

  /* ------------------------------------------------------------------ */
  /* SCROLL REVEAL & NAVBAR SCROLL                                        */
  /* ------------------------------------------------------------------ */

  window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-on-scroll').forEach(el => {
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------------------ */
  /* INIT                                                                 */
  /* ------------------------------------------------------------------ */

  showView('home');
  fetch(api('/api/health')).catch(() => {});

  async function loadPublicStats() {
    try {
      const res = await fetch(api('/api/stats/public'));
      if (res.ok) {
        const d = await res.json();
        setText('hs-requests', d.totalRequests ?? 0);
      }
    } catch {}
  }
  loadPublicStats();

})();
