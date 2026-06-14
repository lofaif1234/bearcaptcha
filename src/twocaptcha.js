const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE = 'https://2captcha.com';

function get(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(url, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function submitTask(params) {
  const qs = new URLSearchParams({ key: process.env.TWOCAPTCHA_API_KEY, json: '1', ...params }).toString();
  const raw = await get(`${BASE}/in.php?${qs}`);
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('2captcha in.php non-JSON: ' + raw); }
  if (data.status !== 1) throw new Error('2captcha submit error: ' + (data.request || raw));
  return data.request;
}

async function pollResult(taskId, maxWaitMs = 120000) {
  const deadline = Date.now() + maxWaitMs;
  await sleep(10000);

  while (Date.now() < deadline) {
    const raw = await get(`${BASE}/res.php?key=${process.env.TWOCAPTCHA_API_KEY}&action=get&id=${taskId}&json=1`);
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('2captcha res.php non-JSON: ' + raw); }

    if (data.status === 1) return data.request;
    if (data.request !== 'CAPCHA_NOT_READY') throw new Error('2captcha error: ' + data.request);

    await sleep(5000);
  }
  throw new Error('2captcha timeout after ' + maxWaitMs / 1000 + 's');
}

async function solveFunCaptcha(websiteUrl, websitePublicKey, surl, extra = {}) {
  const params = {
    method: 'funcaptcha',
    publickey: websitePublicKey,
    pageurl: websiteUrl
  };
  if (surl) params.surl = surl;
  if (extra.blob) params['data[blob]'] = extra.blob;
  if (extra.userAgent) params.userAgent = extra.userAgent;
  if (extra.proxy) { params.proxy = extra.proxy; params.proxytype = extra.proxytype || 'HTTP'; }

  const taskId = await submitTask(params);
  const token = await pollResult(taskId);
  return { token, taskId };
}

const URL_RE = /^https?:\/\/.+/i;

function validateFunCaptchaParams(input = {}) {
  const publickey = typeof input.publickey === 'string' ? input.publickey.trim() : '';
  const pageurl = typeof input.pageurl === 'string' ? input.pageurl.trim() : '';
  const surl = typeof input.surl === 'string' ? input.surl.trim() : '';
  const blob = typeof input.blob === 'string' ? input.blob.trim()
    : (input.data && typeof input.data.blob === 'string' ? input.data.blob.trim() : '');
  const userAgent = typeof input.userAgent === 'string' ? input.userAgent.trim() : '';
  const proxy = typeof input.proxy === 'string' ? input.proxy.trim() : '';
  const proxytype = typeof input.proxytype === 'string' ? input.proxytype.trim().toUpperCase() : '';

  if (!publickey) throw new Error('publickey is required');
  if (!pageurl || !URL_RE.test(pageurl)) throw new Error('pageurl must be a valid http(s) URL');
  if (surl && !URL_RE.test(surl)) throw new Error('surl must be a valid http(s) URL when provided');

  return {
    pageurl,
    publickey,
    surl: surl || undefined,
    blob: blob || undefined,
    userAgent: userAgent || undefined,
    proxy: proxy || undefined,
    proxytype: proxytype || undefined
  };
}

async function solveFunCaptchaToken(params) {
  const { pageurl, publickey, surl, blob, userAgent, proxy, proxytype } = validateFunCaptchaParams(params);
  return solveFunCaptcha(pageurl, publickey, surl, { blob, userAgent, proxy, proxytype });
}

async function getBalance() {
  const raw = await get(`${BASE}/res.php?key=${process.env.TWOCAPTCHA_API_KEY}&action=getbalance&json=1`);
  let data;
  try { data = JSON.parse(raw); } catch { return parseFloat(raw) || 0; }
  return parseFloat(data.request) || 0;
}

module.exports = { solveFunCaptcha, solveFunCaptchaToken, validateFunCaptchaParams, getBalance };
