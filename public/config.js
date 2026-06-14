/* ------------------------------------------------------------------ *
 * BearCaptcha frontend configuration
 * ------------------------------------------------------------------ *
 * When the frontend (this static site, e.g. GitHub Pages) and the
 * backend (Katabump) live on DIFFERENT origins, set API_BASE to the
 * full URL of your backend, WITHOUT a trailing slash and WITHOUT /api.
 *
 *   Same origin (backend serves these files):  leave as ""
 *   Split hosting (GitHub Pages + Katabump):    set your backend URL
 *
 * IMPORTANT: GitHub Pages is HTTPS. Browsers BLOCK an HTTPS page from
 * calling an http:// API (mixed content). Your backend URL below MUST
 * be https:// — put the Katabump server behind a domain + TLS
 * (e.g. via Cloudflare) and use that https URL here.
 *
 * Examples:
 *   window.BEARCAPTCHA_API_BASE = "";                          // same origin
 *   window.BEARCAPTCHA_API_BASE = "https://api.bearcaptcha.live"; // split
 * ------------------------------------------------------------------ */
window.BEARCAPTCHA_API_BASE = "";
