require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const adminRoutes = require('./src/routes/admin');
const captchaRoutes = require('./src/routes/captcha');
const { setupWebSocket } = require('./src/websocket');
const { getStats } = require('./src/db');

const REQUIRED_ENV = ['ADMIN_SECRET', 'TWOCAPTCHA_API_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k] || !process.env[k].trim());
if (missing.length) {
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.ADMIN_SECRET.length < 16) {
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: IS_PROD ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: IS_PROD ? { maxAge: 15552000, includeSubDomains: true } : false
}));

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: IS_PROD && ALLOWED_ORIGINS.length
    ? ALLOWED_ORIGINS
    : true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Admin-Secret']
}));

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

const jsonLimitMsg = { success: false, error: 'Too many requests, slow down' };

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimitMsg
});

const solveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
  message: { success: false, error: 'Solve rate limit reached for this key, slow down' }
});

const creditsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
  message: { success: false, error: 'Credits lookup rate limit reached, slow down' }
});

const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: jsonLimitMsg
});

const readyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: jsonLimitMsg
});

const statsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: jsonLimitMsg
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many admin requests, try again later' }
});

const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many admin login attempts, try again later' }
});

const notFoundLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'Too many requests, slow down' }
});

app.use('/api', apiLimiter);
app.use('/api/health', healthLimiter);
app.use('/api/ready', readyLimiter);
app.use('/api/stats/public', statsLimiter);
app.use('/api/captcha/solve', solveLimiter);
app.use('/api/captcha/credits', creditsLimiter);
app.use('/api/admin', adminLimiter);
app.use('/api/admin/login', adminAuthLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

app.get('/api/ready', (req, res) => {
  const checks = { keyStore: false, solverConfigured: false };
  try { getStats(); checks.keyStore = true; } catch {}
  checks.solverConfigured = Boolean(process.env.TWOCAPTCHA_API_KEY);
  const ready = checks.keyStore && checks.solverConfigured;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', checks });
});

app.use('/api', captchaRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PROD ? '1h' : 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.use('/api', notFoundLimiter, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).json({ success: false, error: 'Not found' });
});

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Payload too large' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
});

setupWebSocket(server);

server.listen(PORT);

function shutdown(signal) {
  server.close(() => { process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', () => shutdown('unhandledRejection'));
process.on('uncaughtException', () => shutdown('uncaughtException'));
