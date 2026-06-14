# BearCaptcha — Split Deployment Guide

Architecture for this setup:

- **Frontend** (`obfuscator/dist/`) → GitHub Pages (static, HTTPS)
- **Backend + DB** (`server.js`, `src/`, `data/`) → Katabump Pro (Node.js)

Because the two live on **different origins**, three things must line up: the
frontend's API base URL, the backend's CORS allow-list, and HTTPS on both
sides. Follow the steps in order.

---

## 1. Backend on Katabump (Pro)

1. Create a **Node.js** server. Pick a current Node version (>= 18).
2. Upload the project **without** `node_modules/`, `.env`, or `data/bearcaptcha.db`
   (these are gitignored; Katabump runs `npm install` on first start).
3. Set the **startup command** to: `node server.js`
4. Set **environment variables** in the Katabump panel (NOT in a committed
   `.env` file):
   - `TWOCAPTCHA_API_KEY` — your real solver key
   - `ADMIN_SECRET` — a long random string (>= 16 chars; required in prod)
   - `NODE_ENV` = `production`
   - `PORT` = the port Katabump allocates to your server
   - `CORS_ORIGINS` = your frontend origin, e.g. `https://USERNAME.github.io`
     (or your custom domain). Comma-separate multiple origins.
5. Start the server. Confirm it's healthy by hitting `/api/health` and
   `/api/ready` on the allocated address.

### HTTPS is mandatory (the #1 gotcha)

GitHub Pages serves over **HTTPS**, and browsers **block** an HTTPS page from
calling an `http://` API ("mixed content"). Katabump gives you a raw
`IP:PORT` over HTTP, so you must put the backend behind TLS:

- Point a subdomain (e.g. `api.bearcaptcha.live`) at the Katabump server and
  proxy it through **Cloudflare** (free), which terminates HTTPS for you.
- The app already sets `trust proxy = 1`, so it works correctly behind a proxy.

Your public backend URL then becomes e.g. `https://api.bearcaptcha.live`.

---

## 2. Frontend on GitHub Pages

1. Edit **`public/config.js`** and set your HTTPS backend URL:
   ```js
   window.BEARCAPTCHA_API_BASE = "https://api.bearcaptcha.live";
   ```
2. Build the obfuscated frontend:
   ```bash
   cd obfuscator
   npm install
   npm run build
   ```
   This writes encoded HTML + CSS + obfuscated JS into `obfuscator/dist/`.
3. Publish the **contents of `obfuscator/dist/`** (not `public/`) to GitHub Pages:
   - a dedicated `gh-pages` branch whose **root** is the `obfuscator/dist/` contents, or
   - a GitHub Actions workflow that deploys `obfuscator/dist/` to Pages.
4. In the repo's **Settings → Pages**, select the branch/folder you used.

> Do not commit `.env` or `data/bearcaptcha.db` — `.gitignore` already excludes them.

---

## 3. Verify end to end

1. Open the GitHub Pages site over HTTPS.
2. Buyer panel: look up a key → should hit `https://<backend>/api/captcha/credits`.
3. Admin panel: log in with `ADMIN_SECRET` → stats and key management load.
4. If requests fail, check the browser console:
   - **CORS error** → `CORS_ORIGINS` on the backend doesn't match the Pages origin exactly.
   - **Mixed content / blocked** → backend URL in `config.js` is `http://`, not `https://`.

---

## 4. Protect the database (Katabump renewal)

The credit/key store is `data/bearcaptcha.db` (SQLite) on the Katabump disk.
On Pro plans you avoid the free tier's 4-day deletion, but still **back up
`data/bearcaptcha.db` regularly** (via SFTP) — it holds your customers' keys
and credit balances.

> SQLite is now the default. It provides atomic credit deductions and removes
> the concurrency race that existed with the previous `data/keys.json` flat-file
> store.
