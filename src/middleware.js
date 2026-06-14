const crypto = require('crypto');
const { getKey } = require('./db');

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;

  if (!key) {
    return res.status(401).json({
      error: 'Missing API key',
      message: 'Provide your key via X-API-Key header or ?api_key= query param'
    });
  }

  const entry = getKey(key);

  if (!entry) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  if (!entry.active) {
    return res.status(403).json({ error: 'API key has been revoked' });
  }

  req.apiKeyEntry = entry;
  next();
}

function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.admin_secret;
  const expected = process.env.ADMIN_SECRET || '';

  if (!secret || !expected) {
    return res.status(403).json({ error: 'Forbidden: invalid admin secret' });
  }

  try {
    const a = Buffer.from(secret);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ error: 'Forbidden: invalid admin secret' });
    }
  } catch {
    return res.status(403).json({ error: 'Forbidden: invalid admin secret' });
  }

  next();
}

module.exports = { requireApiKey, requireAdmin };
