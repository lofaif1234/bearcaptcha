const { WebSocketServer } = require('ws');
const { getKey, deductCredit } = require('./db');
const { solveFunCaptchaToken, validateFunCaptchaParams } = require('./twocaptcha');


function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress;
}

function setupWebSocket(server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 64 * 1024
  });

  const SOLVE_WINDOW_MS = 60 * 1000;
  const SOLVE_MAX_PER_WINDOW = 20;

  const ipConnections = new Map();
  const ipAuthAttempts = new Map();
  const MAX_CONN_PER_IP = 5;
  const MAX_AUTH_PER_IP = 10;
  const AUTH_WINDOW_MS = 60 * 1000;
  const GLOBAL_MAX_CONN = 500;

  wss.on('connection', (ws, req) => {
    const clientIp = getClientIp(req);

    if (wss.clients.size > GLOBAL_MAX_CONN) {
      ws.close(1013, 'Server overloaded');
      return;
    }

    const currentConns = (ipConnections.get(clientIp) || 0) + 1;
    if (currentConns > MAX_CONN_PER_IP) {
      ws.close(1013, 'Too many connections from this IP');
      return;
    }
    ipConnections.set(clientIp, currentConns);

    ws.on('close', () => {
      const c = (ipConnections.get(clientIp) || 1) - 1;
      if (c <= 0) ipConnections.delete(clientIp);
      else ipConnections.set(clientIp, c);
    });

    let authenticated = false;
    let apiKeyEntry = null;
    let inFlight = 0;
    let windowStart = Date.now();
    let windowCount = 0;
    let alive = true;

    const send = (data) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
    };

    ws.on('pong', () => { alive = true; });

    ws.on('message', async (raw) => {
      if (raw.length > 64 * 1024) {
        return send({ event: 'error', message: 'Payload too large' });
      }

      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send({ event: 'error', message: 'Invalid JSON' });
      }

      if (msg.event === 'auth') {
        const now = Date.now();
        let bucket = ipAuthAttempts.get(clientIp);
        if (!bucket || now > bucket.resetAt) {
          bucket = { count: 0, resetAt: now + AUTH_WINDOW_MS };
          ipAuthAttempts.set(clientIp, bucket);
        }
        if (bucket.count >= MAX_AUTH_PER_IP) {
          return send({ event: 'auth_failed', message: 'Too many auth attempts from this IP, slow down' });
        }
        bucket.count++;

        const key = typeof msg.api_key === 'string' ? msg.api_key.trim() : '';
        if (!key) return send({ event: 'error', message: 'Missing api_key' });

        const entry = getKey(key);
        if (!entry || !entry.active) {
          return send({ event: 'auth_failed', message: 'Invalid or revoked API key' });
        }

        authenticated = true;
        apiKeyEntry = entry;
        return send({ event: 'auth_ok', message: 'Authenticated', label: entry.label });
      }

      if (!authenticated) {
        return send({ event: 'error', message: 'Not authenticated. Send an auth event first.' });
      }

      if (msg.event === 'ping') {
        return send({ event: 'pong', timestamp: Date.now() });
      }

      if (msg.event === 'solve') {
        const requestId = typeof msg.request_id === 'string' || typeof msg.request_id === 'number'
          ? msg.request_id : null;

        let params;
        try {
          params = validateFunCaptchaParams(msg);
        } catch (err) {
          return send({ event: 'solve_error', request_id: requestId, error: err.message });
        }

        const now = Date.now();
        if (now - windowStart > SOLVE_WINDOW_MS) { windowStart = now; windowCount = 0; }
        if (windowCount >= SOLVE_MAX_PER_WINDOW) {
          return send({ event: 'solve_error', request_id: requestId, error: 'Rate limit: too many solves, slow down' });
        }
        if (inFlight >= 5) {
          return send({ event: 'solve_error', request_id: requestId, error: 'Too many concurrent solves on this connection' });
        }

        const charged = deductCredit(apiKeyEntry.key);
        if (!charged) {
          return send({ event: 'solve_error', request_id: requestId, error: 'Insufficient credits' });
        }

        windowCount++;
        inFlight++;
        send({ event: 'solving', request_id: requestId, message: 'Resolving FunCaptcha token' });

        try {
          const { token } = await solveFunCaptchaToken(params);
          const fresh = getKey(apiKeyEntry.key);
          send({
            event: 'solved',
            request_id: requestId,
            success: true,
            token,
            credits_remaining: fresh ? fresh.credits : undefined,
            usage: 'Pass token as captchaToken with captchaProvider: PROVIDER_ARKOSE_LABS',
            timestamp: new Date().toISOString()
          });
        } catch (err) {
          try { require('./db').addCredits(apiKeyEntry.id, 1); } catch {}
          send({ event: 'solve_error', request_id: requestId, success: false, error: 'Solve failed, credit refunded' });
        } finally {
          inFlight--;
        }
        return;
      }

      send({ event: 'error', message: 'Unknown event' });
    });

    ws.on('error', () => {});

    ws._isAlive = () => alive;
    ws._resetAlive = () => { alive = false; };

    send({ event: 'connected', message: 'Send {"event":"auth","api_key":"brk_..."} to begin' });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws._isAlive && !ws._isAlive()) return ws.terminate();
      if (ws._resetAlive) ws._resetAlive();
      try { ws.ping(); } catch {}
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

module.exports = { setupWebSocket };
